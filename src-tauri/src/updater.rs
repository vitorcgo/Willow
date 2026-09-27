use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

const RELEASES_API: &str = "https://api.github.com/repos/vitorcgo/Willow/releases/latest";
const RELEASES_PAGE: &str = "https://github.com/vitorcgo/Willow/releases/latest";

/// Minimum time between background update checks. Manual checks bypass this.
const CHECK_INTERVAL_SECS: i64 = 4 * 60 * 60;
/// Network timeout for a single manifest request.
const CHECK_TIMEOUT_SECS: u64 = 10;
const STATE_FILE: &str = "update-state.json";

/// Serializes manifest requests so concurrent callers share a single network hit.
static CHECK_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static LAST_CHECK: Mutex<Option<UpdateCheckResult>> = Mutex::new(None);

#[derive(Clone, Default, Serialize)]
pub struct UpdateCheckResult {
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Default, Serialize, Deserialize)]
struct PersistedUpdateState {
    last_check: i64,
    app_version: String,
    version: String,
    date: String,
    #[serde(default)]
    url: String,
    /// Version whose installer was last launched, auto or manual.
    #[serde(default)]
    attempted_version: String,
    /// Unix seconds of the last install attempt.
    #[serde(default)]
    attempted_at: i64,
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn state_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(STATE_FILE))
}

fn read_state(app: &AppHandle) -> PersistedUpdateState {
    state_path(app)
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn write_state(app: &AppHandle, state: &PersistedUpdateState) {
    if let Some(path) = state_path(app) {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(content) = serde_json::to_string(state) {
            let _ = std::fs::write(path, content);
        }
    }
}

fn result_from_state(state: &PersistedUpdateState) -> UpdateCheckResult {
    if state.version.is_empty() {
        return UpdateCheckResult::default();
    }
    UpdateCheckResult {
        available: true,
        version: Some(state.version.clone()),
        date: (!state.date.is_empty()).then(|| state.date.clone()),
        body: None,
        url: (!state.url.is_empty()).then(|| state.url.clone()),
    }
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    published_at: Option<String>,
    body: Option<String>,
    html_url: String,
}

fn version_parts(value: &str) -> Vec<u64> {
    value
        .trim()
        .trim_start_matches(['v', 'V'])
        .split('.')
        .map(|part| {
            part.split(|ch: char| !ch.is_ascii_digit())
                .next()
                .unwrap_or("0")
                .parse::<u64>()
                .unwrap_or(0)
        })
        .collect()
}

fn version_is_newer(candidate: &str, current: &str) -> bool {
    let mut candidate = version_parts(candidate);
    let mut current = version_parts(current);
    let width = candidate.len().max(current.len()).max(3);
    candidate.resize(width, 0);
    current.resize(width, 0);
    candidate > current
}

fn check_github_release(current_version: &str) -> Result<UpdateCheckResult, String> {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(CHECK_TIMEOUT_SECS))
        .timeout_read(Duration::from_secs(CHECK_TIMEOUT_SECS))
        .timeout_write(Duration::from_secs(CHECK_TIMEOUT_SECS))
        .build();
    let response = match agent
        .get(RELEASES_API)
        .set("Accept", "application/vnd.github+json")
        .set("User-Agent", "Willow-Updater")
        .call()
    {
        Ok(response) => response,
        // GitHub returns 404 while a repository has no published release.
        // That is a valid "no update" state, not a broken settings control.
        Err(ureq::Error::Status(404, _)) => {
            return Ok(UpdateCheckResult {
                url: Some(RELEASES_PAGE.to_string()),
                ..Default::default()
            });
        }
        Err(error) => {
            return Err(format!(
                "Não foi possível consultar as versões do Willow: {error}"
            ));
        }
    };
    let release: GithubRelease = response
        .into_json()
        .map_err(|error| format!("A resposta de atualização é inválida: {error}"))?;
    let version = release.tag_name.trim_start_matches(['v', 'V']).to_string();
    let available = version_is_newer(&version, current_version);
    Ok(UpdateCheckResult {
        available,
        version: available.then_some(version),
        date: release.published_at,
        body: release.body,
        url: Some(release.html_url),
    })
}

/// Returns a cached result only when the last check is recent and was made
/// against the version currently running (so updating invalidates the cache).
fn cached_result(app: &AppHandle) -> Option<UpdateCheckResult> {
    let state = read_state(app);
    if state.last_check == 0 || now_secs() - state.last_check >= CHECK_INTERVAL_SECS {
        return None;
    }
    if state.app_version != app.package_info().version.to_string() {
        return None;
    }
    Some(result_from_state(&state))
}

/// Checks for an update at most once per `CHECK_INTERVAL_SECS` unless `force`
/// is set. Development builds skip the automatic network check because their
/// version never tracks releases; manual checks still work.
pub async fn check(app: &AppHandle, force: bool) -> Result<UpdateCheckResult, String> {
    if !force {
        if let Some(cached) = cached_result(app) {
            return Ok(cached);
        }
        #[cfg(debug_assertions)]
        {
            return Ok(UpdateCheckResult::default());
        }
    }

    let _guard = CHECK_LOCK.lock().await;

    // Another caller may have completed a check while we waited for the lock.
    if !force {
        if let Some(cached) = cached_result(app) {
            return Ok(cached);
        }
    }

    let current_version = app.package_info().version.to_string();
    let result =
        tauri::async_runtime::spawn_blocking(move || check_github_release(&current_version))
            .await
            .map_err(|error| error.to_string())??;

    let previous = read_state(app);
    write_state(
        app,
        &PersistedUpdateState {
            last_check: now_secs(),
            app_version: app.package_info().version.to_string(),
            version: result.version.clone().unwrap_or_default(),
            date: result.date.clone().unwrap_or_default(),
            url: result.url.clone().unwrap_or_default(),
            attempted_version: previous.attempted_version,
            attempted_at: previous.attempted_at,
        },
    );
    if let Ok(mut cached) = LAST_CHECK.lock() {
        *cached = Some(result.clone());
    }
    Ok(result)
}

/// Opens the trusted GitHub release page for the available version. Automatic
/// installation remains disabled until a matching signing public key is
/// configured in the repository.
pub async fn install(app: &AppHandle) -> Result<(), String> {
    let url = LAST_CHECK
        .lock()
        .ok()
        .and_then(|result| result.as_ref().and_then(|result| result.url.clone()))
        .or_else(|| {
            let state = read_state(app);
            (!state.url.is_empty()).then_some(state.url)
        })
        .unwrap_or_else(|| RELEASES_PAGE.to_string());

    unsafe {
        use windows::Win32::UI::Shell::ShellExecuteA;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        let operation = std::ffi::CString::new("open").map_err(|e| e.to_string())?;
        let target = std::ffi::CString::new(url).map_err(|e| e.to_string())?;
        let result = ShellExecuteA(
            None,
            windows::core::PCSTR(operation.as_ptr() as *const u8),
            windows::core::PCSTR(target.as_ptr() as *const u8),
            windows::core::PCSTR::null(),
            windows::core::PCSTR::null(),
            SW_SHOWNORMAL,
        );
        if result.0 as isize <= 32 {
            return Err("Não foi possível abrir a página da atualização".to_string());
        }
    }
    Ok(())
}

/// Background update monitor. It checks at startup and then every four hours.
/// It never opens or installs anything without an explicit click.
pub async fn run_startup_check(app: AppHandle) {
    loop {
        let automatic_checks =
            crate::utils::get_setting_str(&app, "willow-auto-update").as_deref() != Some("false");

        if automatic_checks {
            if let Ok(result) = check(&app, false).await {
                if result.available {
                    let _ = app.emit("update-available", &result);
                }
            }
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(CHECK_INTERVAL_SECS as u64)).await;
    }
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle, force: bool) -> Result<UpdateCheckResult, String> {
    let result = check(&app, force).await?;
    if result.available {
        let _ = app.emit("update-available", &result);
    }
    Ok(result)
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    install(&app).await
}

#[tauri::command]
pub fn get_update_state(app: AppHandle) -> UpdateCheckResult {
    if let Ok(cached) = LAST_CHECK.lock() {
        if let Some(result) = cached.as_ref() {
            return result.clone();
        }
    }
    let state = read_state(&app);
    if state.app_version != app.package_info().version.to_string() {
        return UpdateCheckResult::default();
    }
    result_from_state(&state)
}

#[cfg(test)]
fn parse_rfc3339_utc(value: &str) -> Option<i64> {
    if value.len() < 20 || !value.ends_with('Z') {
        return None;
    }
    let bytes = value.as_bytes();
    if bytes[4] != b'-' || bytes[7] != b'-' || bytes[10] != b'T' {
        return None;
    }
    let year: i64 = value.get(0..4)?.parse().ok()?;
    let month: i64 = value.get(5..7)?.parse().ok()?;
    let day: i64 = value.get(8..10)?.parse().ok()?;
    let hour: i64 = value.get(11..13)?.parse().ok()?;
    let minute: i64 = value.get(14..16)?.parse().ok()?;
    let second: i64 = value.get(17..19)?.parse().ok()?;
    if !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || hour > 23
        || minute > 59
        || second > 60
    {
        return None;
    }
    let days = days_from_civil(year, month, day);
    Some(days * 86_400 + hour * 3_600 + minute * 60 + second)
}

/// Howard Hinnant's days-from-civil algorithm.
#[cfg(test)]
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let shifted_month = if month > 2 { month - 3 } else { month + 9 };
    let day_of_year = (153 * shifted_month + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

#[cfg(test)]
mod tests {
    use super::{days_from_civil, parse_rfc3339_utc, version_is_newer, PersistedUpdateState};

    #[test]
    fn parses_tauri_action_pub_date() {
        assert_eq!(parse_rfc3339_utc("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(
            parse_rfc3339_utc("2026-09-13T18:14:46Z"),
            Some(1_789_323_286)
        );
        assert_eq!(
            parse_rfc3339_utc("2026-09-13T18:14:46.123Z"),
            Some(1_789_323_286)
        );
    }

    #[test]
    fn rejects_non_utc_and_malformed_dates() {
        assert_eq!(parse_rfc3339_utc("2026-09-13T18:14:46+02:00"), None);
        assert_eq!(parse_rfc3339_utc("not-a-date"), None);
        assert_eq!(parse_rfc3339_utc("2026-13-40T99:99:99Z"), None);
    }

    #[test]
    fn computes_civil_days() {
        assert_eq!(days_from_civil(1970, 1, 1), 0);
        assert_eq!(days_from_civil(2026, 9, 13), 20_709);
    }

    #[test]
    fn parses_legacy_update_state_without_attempt_fields() {
        let state: PersistedUpdateState = serde_json::from_str(
            r#"{"last_check":1,"app_version":"3.8.7","version":"3.8.8","date":"2026-09-13T18:14:46Z"}"#,
        )
        .expect("legacy state parses");
        assert_eq!(state.attempted_version, "");
        assert_eq!(state.attempted_at, 0);
    }

    #[test]
    fn compares_release_versions() {
        assert!(version_is_newer("v0.1.2", "0.1.1"));
        assert!(version_is_newer("1.0.0", "0.9.9"));
        assert!(!version_is_newer("0.1.1", "0.1.1"));
        assert!(!version_is_newer("0.1.0", "0.1.1"));
    }
}
