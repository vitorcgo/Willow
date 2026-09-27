use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rusqlite::OpenFlags;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const HTTP_TIMEOUT: Duration = Duration::from_secs(15);
const TAIL_BYTES: u64 = 256 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UsageWindow {
    pub id: String,
    pub label: String,
    pub used: f64,
    pub resets_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProviderUsage {
    pub id: String,
    pub name: String,
    pub status: String,
    pub note: String,
    pub fetched_at: u64,
    pub windows: Vec<UsageWindow>,
    pub working: bool,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn home_dir() -> Option<PathBuf> {
    dirs::home_dir()
}

fn percent(value: Option<&Value>) -> Option<f64> {
    value
        .and_then(Value::as_f64)
        .map(|n| (n / 100.0).clamp(0.0, 1.0))
}

fn parse_iso(value: Option<&Value>) -> Option<u64> {
    value
        .and_then(Value::as_str)
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|d| d.timestamp_millis().max(0) as u64)
}

fn http_note(error: &ureq::Error) -> String {
    match error {
        ureq::Error::Status(code, _) => format!("O serviço respondeu com o código {code}"),
        _ => "Não foi possível atualizar pela rede".into(),
    }
}

fn modified_recently(path: &Path, seconds: u64) -> bool {
    path.metadata()
        .and_then(|m| m.modified())
        .and_then(|m| {
            SystemTime::now()
                .duration_since(m)
                .map_err(std::io::Error::other)
        })
        .map(|age| age.as_secs() <= seconds)
        .unwrap_or(false)
}

fn newest_file(root: &Path, prefix: &str, suffix: &str, depth: usize) -> Option<PathBuf> {
    fn visit(
        dir: &Path,
        prefix: &str,
        suffix: &str,
        depth: usize,
        best: &mut Option<(SystemTime, PathBuf)>,
    ) {
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && depth > 0 {
                visit(&path, prefix, suffix, depth - 1, best);
                continue;
            }
            let name = path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or_default();
            if !path.is_file() || !name.starts_with(prefix) || !name.ends_with(suffix) {
                continue;
            }
            let modified = entry
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(UNIX_EPOCH);
            if best
                .as_ref()
                .map(|(time, _)| modified > *time)
                .unwrap_or(true)
            {
                *best = Some((modified, path));
            }
        }
    }

    let mut best = None;
    visit(root, prefix, suffix, depth, &mut best);
    best.map(|(_, path)| path)
}

fn tail_text(path: &Path) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let length = file.metadata().ok()?.len();
    file.seek(SeekFrom::Start(length.saturating_sub(TAIL_BYTES)))
        .ok()?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).ok()?;
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

fn reset_ms(value: &Value, now: u64) -> Option<u64> {
    value
        .get("reset_at")
        .or_else(|| value.get("resets_at"))
        .and_then(Value::as_f64)
        .map(|n| {
            if n > 10_000_000_000.0 {
                n as u64
            } else {
                (n * 1000.0) as u64
            }
        })
        .or_else(|| {
            value
                .get("reset_after_seconds")
                .or_else(|| value.get("resets_in_seconds"))
                .and_then(Value::as_f64)
                .map(|seconds| now.saturating_add((seconds * 1000.0) as u64))
        })
}

fn window_label(minutes: Option<f64>, fallback: &str) -> String {
    match minutes {
        Some(value) if value < 60.0 => format!("Limite de {} min", value.round() as i64),
        Some(value) if value < 1440.0 => format!("Limite de {} h", (value / 60.0).round() as i64),
        Some(value) => format!("Limite de {} dias", (value / 1440.0).round() as i64),
        None => fallback.into(),
    }
}

fn codex_window(value: &Value, id: &str, fallback: &str, now: u64) -> Option<UsageWindow> {
    let used = percent(value.get("used_percent"))?;
    let minutes = value
        .get("limit_window_seconds")
        .and_then(Value::as_f64)
        .map(|s| s / 60.0)
        .or_else(|| value.get("window_minutes").and_then(Value::as_f64));
    Some(UsageWindow {
        id: id.into(),
        label: window_label(minutes, fallback),
        used,
        resets_at: reset_ms(value, now),
    })
}

fn codex_windows(value: &Value) -> Vec<UsageWindow> {
    let now = now_ms();
    let root = value.get("rate_limit").unwrap_or(value);
    let mut windows = Vec::new();
    for (key, id, label) in [
        ("primary_window", "primary", "Sessão atual"),
        ("secondary_window", "secondary", "Limite semanal"),
        ("primary", "primary", "Sessão atual"),
        ("secondary", "secondary", "Limite semanal"),
    ] {
        if windows.iter().any(|window: &UsageWindow| window.id == id) {
            continue;
        }
        if let Some(window) = root
            .get(key)
            .and_then(|item| codex_window(item, id, label, now))
        {
            windows.push(window);
        }
    }
    windows
}

fn jwt_claims(token: &str) -> Option<Value> {
    let segment = token.split('.').nth(1)?;
    let padded = match segment.len() % 4 {
        2 => format!("{segment}=="),
        3 => format!("{segment}="),
        _ => segment.to_string(),
    };
    let bytes = URL_SAFE_NO_PAD
        .decode(segment)
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(padded))
        .ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn codex_from_rollout(path: &Path) -> Option<ProviderUsage> {
    let text = tail_text(path)?;
    for line in text
        .lines()
        .rev()
        .filter(|line| line.contains("rate_limits"))
    {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let Some(rate_limits) = value
            .get("rate_limits")
            .or_else(|| value.pointer("/payload/rate_limits"))
        else {
            continue;
        };
        if rate_limits
            .get("limit_id")
            .or_else(|| rate_limits.get("limitId"))
            .and_then(Value::as_str)
            .is_some_and(|id| id != "codex")
        {
            continue;
        }
        let windows = codex_windows(rate_limits);
        if windows.is_empty() {
            continue;
        }
        let fetched_at = value
            .get("timestamp")
            .and_then(Value::as_str)
            .and_then(|stamp| chrono::DateTime::parse_from_rfc3339(stamp).ok())
            .map(|stamp| stamp.timestamp_millis().max(0) as u64)
            .unwrap_or(0);
        return Some(ProviderUsage {
            id: "codex".into(),
            name: "Codex".into(),
            status: if now_ms().saturating_sub(fetched_at) <= 5 * 60 * 1000 {
                "ok".into()
            } else {
                "stale".into()
            },
            note: "Dados da sessão local mais recente".into(),
            fetched_at,
            windows,
            working: modified_recently(path, 30),
        });
    }
    None
}

fn read_codex() -> Option<ProviderUsage> {
    let root = home_dir()?.join(".codex");
    let auth_path = root.join("auth.json");
    let rollout = newest_file(&root.join("sessions"), "rollout-", ".jsonl", 4);
    if !auth_path.is_file() && rollout.is_none() {
        return None;
    }

    let fallback = rollout.as_deref().and_then(codex_from_rollout);
    let auth: Option<Value> = fs::read_to_string(&auth_path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok());
    let token = auth
        .as_ref()
        .and_then(|value| value.pointer("/tokens/access_token"))
        .and_then(Value::as_str);
    let account = auth
        .as_ref()
        .and_then(|value| value.pointer("/tokens/account_id"))
        .and_then(Value::as_str);

    let (Some(token), Some(account)) = (token, account) else {
        return fallback.or_else(|| {
            Some(ProviderUsage {
                id: "codex".into(),
                name: "Codex".into(),
                status: "needsAuth".into(),
                note: "Abra o Codex e entre na sua conta".into(),
                ..Default::default()
            })
        });
    };

    let request = ureq::get("https://chatgpt.com/backend-api/wham/usage")
        .set("Authorization", &format!("Bearer {token}"))
        .set("ChatGPT-Account-Id", account)
        .set("Accept", "application/json")
        .set("Cache-Control", "no-cache, no-store")
        .set("User-Agent", "willow/1.0 Windows")
        .timeout(HTTP_TIMEOUT)
        .call();

    match request {
        Ok(response) => {
            let value: Value = response.into_json().ok()?;
            let windows = codex_windows(&value);
            if windows.is_empty() {
                return fallback;
            }
            let plan = auth
                .as_ref()
                .and_then(|value| value.pointer("/tokens/id_token"))
                .and_then(Value::as_str)
                .and_then(jwt_claims)
                .and_then(|claims| {
                    claims
                        .pointer("/https:~1~1api.openai.com~1auth/chatgpt_plan_type")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                });
            Some(ProviderUsage {
                id: "codex".into(),
                name: "Codex".into(),
                status: "ok".into(),
                note: plan.map(|plan| format!("Plano {plan}")).unwrap_or_default(),
                fetched_at: now_ms(),
                windows,
                working: rollout
                    .as_deref()
                    .is_some_and(|path| modified_recently(path, 30)),
            })
        }
        Err(error) => fallback.or_else(|| {
            Some(ProviderUsage {
                id: "codex".into(),
                name: "Codex".into(),
                status: if matches!(&error, ureq::Error::Status(401 | 403, _)) {
                    "needsAuth".into()
                } else {
                    "error".into()
                },
                note: http_note(&error),
                working: rollout
                    .as_deref()
                    .is_some_and(|path| modified_recently(path, 30)),
                ..Default::default()
            })
        }),
    }
}

fn claude_profiles() -> Vec<PathBuf> {
    let Some(home) = home_dir() else {
        return Vec::new();
    };
    let mut profiles = vec![home.join(".claude")];
    if let Ok(entries) = fs::read_dir(&home) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(".claude-") && entry.path().is_dir() {
                profiles.push(entry.path());
            }
        }
    }
    profiles
}

fn claude_credential(profile: &Path) -> Option<(String, Option<String>)> {
    for name in [".credentials.json", "credentials.json"] {
        let Some(value) = fs::read_to_string(profile.join(name))
            .ok()
            .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        else {
            continue;
        };
        let oauth = value.get("claudeAiOauth").unwrap_or(&value);
        let token = oauth.get("accessToken").and_then(Value::as_str)?.trim();
        if token.is_empty() {
            continue;
        }
        let plan = oauth
            .get("subscriptionType")
            .and_then(Value::as_str)
            .map(str::to_string);
        return Some((token.to_string(), plan));
    }
    None
}

fn claude_windows(value: &Value) -> Vec<UsageWindow> {
    let mut windows = Vec::new();
    if let Some(limits) = value.get("limits").and_then(Value::as_array) {
        for limit in limits {
            let Some(kind) = limit.get("kind").and_then(Value::as_str) else {
                continue;
            };
            let Some(used) = percent(limit.get("percent")) else {
                continue;
            };
            let label = match kind {
                "session" | "five_hour" => "Sessão atual",
                "seven_day" | "weekly_all" => "Semanal, todos os modelos",
                "seven_day_opus" | "weekly_opus" => "Semanal, Opus",
                "weekly_scoped" => "Semanal, modelo atual",
                _ => kind,
            };
            windows.push(UsageWindow {
                id: kind.into(),
                label: label.into(),
                used,
                resets_at: parse_iso(limit.get("resets_at")),
            });
        }
    }
    for (field, id, label) in [
        ("five_hour", "session", "Sessão atual"),
        ("seven_day", "weekly", "Limite semanal"),
    ] {
        if windows.iter().any(|window| window.id == id) {
            continue;
        }
        let Some(item) = value.get(field) else {
            continue;
        };
        if let Some(used) = percent(item.get("utilization")) {
            windows.push(UsageWindow {
                id: id.into(),
                label: label.into(),
                used,
                resets_at: parse_iso(item.get("resets_at")),
            });
        }
    }
    windows
}

fn read_claude() -> Option<ProviderUsage> {
    let profiles = claude_profiles();
    if !profiles.iter().any(|profile| profile.is_dir()) {
        return None;
    }
    let mut combined = ProviderUsage {
        id: "claude".into(),
        name: "Claude".into(),
        status: "needsAuth".into(),
        note: "Abra o Claude Code e entre na sua conta".into(),
        ..Default::default()
    };
    for profile in profiles {
        let Some((token, plan)) = claude_credential(&profile) else {
            continue;
        };
        let request = ureq::get("https://api.anthropic.com/api/oauth/usage")
            .set("Authorization", &format!("Bearer {token}"))
            .set("anthropic-beta", "oauth-2025-04-20")
            .timeout(HTTP_TIMEOUT)
            .call();
        match request {
            Ok(response) => {
                let value: Value = match response.into_json() {
                    Ok(value) => value,
                    Err(_) => continue,
                };
                let mut windows = claude_windows(&value);
                if windows.is_empty() {
                    continue;
                }
                let slug = profile
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or(".claude")
                    .trim_start_matches(".claude-");
                if profile.file_name().and_then(|name| name.to_str()) != Some(".claude") {
                    for window in &mut windows {
                        window.id = format!("{}@{slug}", window.id);
                        window.label = format!("{} ({slug})", window.label);
                    }
                }
                combined.windows.extend(windows);
                combined.status = "ok".into();
                combined.fetched_at = now_ms();
                combined.note = plan.map(|plan| format!("Plano {plan}")).unwrap_or_default();
            }
            Err(error) => {
                combined.status = if matches!(&error, ureq::Error::Status(401, _)) {
                    "needsAuth".into()
                } else {
                    "error".into()
                };
                combined.note = http_note(&error);
            }
        }
    }
    let project_root = home_dir().map(|home| home.join(".claude").join("projects"));
    combined.working = project_root
        .as_deref()
        .and_then(|root| newest_file(root, "", ".jsonl", 5))
        .as_deref()
        .is_some_and(|path| modified_recently(path, 30));
    Some(combined)
}

fn open_sqlite_readonly(path: &Path, table: &str) -> Option<rusqlite::Connection> {
    if !path.is_file() {
        return None;
    }
    let connection = rusqlite::Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .ok()?;
    connection
        .prepare(&format!("SELECT 1 FROM {table} LIMIT 1"))
        .ok()?;
    Some(connection)
}

fn cursor_item(connection: &rusqlite::Connection, key: &str) -> Option<String> {
    connection
        .query_row("SELECT value FROM ItemTable WHERE key = ?1", [key], |row| {
            row.get(0)
        })
        .ok()
        .filter(|value: &String| !value.is_empty())
}

fn read_cursor() -> Option<ProviderUsage> {
    let database = dirs::config_dir()?
        .join("Cursor")
        .join("User")
        .join("globalStorage")
        .join("state.vscdb");
    if !database.is_file() {
        return None;
    }
    let Some(connection) = open_sqlite_readonly(&database, "ItemTable") else {
        return Some(ProviderUsage {
            id: "cursor".into(),
            name: "Cursor".into(),
            status: "error".into(),
            note: "O banco local está ocupado".into(),
            ..Default::default()
        });
    };
    let token = cursor_item(&connection, "cursorAuth/accessToken");
    let account = cursor_item(&connection, "cursorAuth/stripeMembershipAuthId");
    let plan = cursor_item(&connection, "cursorAuth/stripeMembershipType");
    let (Some(token), Some(account)) = (token, account) else {
        return Some(ProviderUsage {
            id: "cursor".into(),
            name: "Cursor".into(),
            status: "needsAuth".into(),
            note: "Entre na sua conta pelo editor".into(),
            ..Default::default()
        });
    };
    let cookie = format!("WorkosCursorSessionToken={account}::{token}");
    match ureq::get("https://cursor.com/api/usage-summary")
        .set("Cookie", &cookie)
        .set("Accept", "application/json")
        .timeout(HTTP_TIMEOUT)
        .call()
    {
        Ok(response) => {
            let value: Value = response.into_json().ok()?;
            let resets_at = parse_iso(value.get("billingCycleEnd"));
            let usage = value.pointer("/individualUsage/plan");
            let mut windows = Vec::new();
            if let Some(used) = usage.and_then(|item| percent(item.get("totalPercentUsed"))) {
                windows.push(UsageWindow {
                    id: "included".into(),
                    label: "Uso incluído".into(),
                    used,
                    resets_at,
                });
            }
            if let Some(used) = usage.and_then(|item| percent(item.get("apiPercentUsed"))) {
                if used > 0.0 {
                    windows.push(UsageWindow {
                        id: "api".into(),
                        label: "Uso da API".into(),
                        used,
                        resets_at,
                    });
                }
            }
            let membership = value
                .get("membershipType")
                .and_then(Value::as_str)
                .map(str::to_string)
                .or(plan)
                .unwrap_or_else(|| "atual".into());
            Some(ProviderUsage {
                id: "cursor".into(),
                name: "Cursor".into(),
                status: if windows.is_empty() {
                    "none".into()
                } else {
                    "ok".into()
                },
                note: if windows.is_empty() {
                    format!("O plano {membership} não informou um limite")
                } else {
                    format!("Plano {membership}")
                },
                fetched_at: now_ms(),
                windows,
                working: modified_recently(&database, 30),
            })
        }
        Err(error) => Some(ProviderUsage {
            id: "cursor".into(),
            name: "Cursor".into(),
            status: if matches!(&error, ureq::Error::Status(401 | 403, _)) {
                "needsAuth".into()
            } else {
                "error".into()
            },
            note: http_note(&error),
            ..Default::default()
        }),
    }
}

fn read_grok() -> Option<ProviderUsage> {
    let path = home_dir()?.join(".grok").join("auth.json");
    if !path.is_file() {
        return None;
    }
    let root: Value = fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())?;
    let entry = root.as_object()?.iter().find_map(|(key, value)| {
        let trusted = key.split("::").next() == Some("https://auth.x.ai")
            || value.get("oidc_issuer").and_then(Value::as_str) == Some("https://auth.x.ai");
        trusted.then_some(value)
    });
    let Some(entry) = entry else {
        return Some(ProviderUsage {
            id: "grok".into(),
            name: "Grok".into(),
            status: "needsAuth".into(),
            note: "Execute grok login".into(),
            ..Default::default()
        });
    };
    let token = entry.get("key").and_then(Value::as_str)?;
    match ureq::get("https://cli-chat-proxy.grok.com/v1/billing?format=credits")
        .set("Authorization", &format!("Bearer {token}"))
        .set("X-XAI-Token-Auth", "xai-grok-cli")
        .set("Accept", "application/json")
        .timeout(HTTP_TIMEOUT)
        .call()
    {
        Ok(response) => {
            let value: Value = response.into_json().ok()?;
            let config = value.get("config")?;
            let used = percent(config.get("creditUsagePercent")).or_else(|| {
                config
                    .get("productUsage")
                    .and_then(Value::as_array)
                    .and_then(|items| items.first())
                    .and_then(|item| percent(item.get("usagePercent")))
            });
            let resets_at = parse_iso(config.pointer("/currentPeriod/end"))
                .or_else(|| parse_iso(config.get("billingPeriodEnd")));
            let windows = used
                .map(|used| {
                    vec![UsageWindow {
                        id: "credits".into(),
                        label: "Limite semanal".into(),
                        used,
                        resets_at,
                    }]
                })
                .unwrap_or_default();
            Some(ProviderUsage {
                id: "grok".into(),
                name: "Grok".into(),
                status: if windows.is_empty() {
                    "none".into()
                } else {
                    "ok".into()
                },
                note: entry
                    .get("email")
                    .and_then(Value::as_str)
                    .unwrap_or("Sessão local")
                    .into(),
                fetched_at: now_ms(),
                windows,
                working: false,
            })
        }
        Err(error) => Some(ProviderUsage {
            id: "grok".into(),
            name: "Grok".into(),
            status: if matches!(&error, ureq::Error::Status(401 | 403, _)) {
                "needsAuth".into()
            } else {
                "error".into()
            },
            note: http_note(&error),
            ..Default::default()
        }),
    }
}

#[derive(Debug)]
struct OpenCodeCredential {
    token: String,
    oauth: bool,
    org: Option<String>,
}

fn non_empty(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

fn opencode_credential(value: &Value) -> Option<OpenCodeCredential> {
    if let Some(token) = non_empty(Some(value)) {
        return Some(OpenCodeCredential {
            token,
            oauth: false,
            org: None,
        });
    }
    let oauth = value.get("type").and_then(Value::as_str) == Some("oauth");
    let token = if oauth {
        non_empty(value.get("access"))?
    } else {
        ["key", "apiKey", "api_key", "token", "accessToken"]
            .iter()
            .find_map(|field| non_empty(value.get(*field)))?
    };
    let org = non_empty(value.pointer("/metadata/orgID"));
    Some(OpenCodeCredential { token, oauth, org })
}

fn read_opencode() -> Option<ProviderUsage> {
    let root = home_dir()?.join(".local").join("share").join("opencode");
    let auth_path = root.join("auth.json");
    let database = root.join("opencode.db");
    if !auth_path.is_file() && !database.is_file() {
        return None;
    }
    let auth: Option<Value> = fs::read_to_string(&auth_path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok());
    let mut credential = auth
        .as_ref()
        .and_then(|value| value.get("opencode-go"))
        .and_then(opencode_credential);
    if credential.is_none() {
        credential = auth
            .as_ref()
            .and_then(|value| value.get("opencode"))
            .and_then(opencode_credential);
    }
    let Some(credential) = credential else {
        return Some(ProviderUsage {
            id: "opencode".into(),
            name: "OpenCode".into(),
            status: "needsAuth".into(),
            note: "Execute opencode auth login".into(),
            ..Default::default()
        });
    };
    let url = if credential.oauth {
        "https://opencode.ai/inference/go/v1/usage"
    } else {
        "https://opencode.ai/zen/go/v1/usage"
    };
    let mut request = ureq::get(url)
        .set("Authorization", &format!("Bearer {}", credential.token))
        .set("Accept", "application/json")
        .set("User-Agent", "willow/1.0 Windows")
        .timeout(HTTP_TIMEOUT);
    if let Some(org) = &credential.org {
        request = request.set("x-opencode-org-id", org);
    }
    match request.call() {
        Ok(response) => {
            let value: Value = response.into_json().ok()?;
            let mut windows = Vec::new();
            for (id, label) in [
                ("rolling", "Limite de 5 h"),
                ("weekly", "Limite semanal"),
                ("monthly", "Limite mensal"),
            ] {
                let Some(item) = value.pointer(&format!("/usage/{id}")) else {
                    continue;
                };
                if let Some(used) = percent(item.get("percent")) {
                    windows.push(UsageWindow {
                        id: id.into(),
                        label: label.into(),
                        used,
                        resets_at: parse_iso(item.get("resetsAt")),
                    });
                }
            }
            Some(ProviderUsage {
                id: "opencode".into(),
                name: "OpenCode".into(),
                status: if windows.is_empty() {
                    "none".into()
                } else {
                    "ok".into()
                },
                note: if windows.is_empty() {
                    "Nenhuma assinatura Go encontrada".into()
                } else {
                    "Plano Go".into()
                },
                fetched_at: now_ms(),
                windows,
                working: modified_recently(&database, 30),
            })
        }
        Err(error) => Some(ProviderUsage {
            id: "opencode".into(),
            name: "OpenCode".into(),
            status: if matches!(&error, ureq::Error::Status(401 | 403, _)) {
                "needsAuth".into()
            } else {
                "error".into()
            },
            note: http_note(&error),
            ..Default::default()
        }),
    }
}

fn detected_only(id: &str, name: &str, paths: &[PathBuf]) -> Option<ProviderUsage> {
    let present = paths.iter().any(|path| path.exists());
    present.then(|| ProviderUsage {
        id: id.into(),
        name: name.into(),
        status: "detected".into(),
        note: "Detectado no computador. O limite não foi informado pela instalação local".into(),
        working: paths.iter().any(|path| modified_recently(path, 30)),
        ..Default::default()
    })
}

#[tauri::command]
pub async fn get_ai_usage() -> Vec<ProviderUsage> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut providers = Vec::new();
        for provider in [
            read_codex(),
            read_claude(),
            read_cursor(),
            read_grok(),
            read_opencode(),
        ]
        .into_iter()
        .flatten()
        {
            providers.push(provider);
        }

        if let Some(home) = home_dir() {
            if let Some(provider) = detected_only(
                "antigravity",
                "Antigravity",
                &[
                    dirs::data_local_dir()
                        .unwrap_or_default()
                        .join("agy")
                        .join("bin")
                        .join("agy.exe"),
                    home.join(".gemini"),
                ],
            ) {
                providers.push(provider);
            }
            if let Some(provider) = detected_only(
                "glm",
                "GLM",
                &[home.join(".zai"), home.join(".config").join("zai")],
            ) {
                providers.push(provider);
            }
        }
        providers
    })
    .await
    .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_codex_windows() {
        let value = serde_json::json!({
            "rate_limit": {
                "primary_window": {"used_percent": 20.0, "limit_window_seconds": 18000, "reset_after_seconds": 30},
                "secondary_window": {"used_percent": 50.0, "window_minutes": 10080, "reset_after_seconds": 60}
            }
        });
        let windows = codex_windows(&value);
        assert_eq!(windows.len(), 2);
        assert!((windows[0].used - 0.2).abs() < f64::EPSILON);
    }

    #[test]
    fn parses_claude_fallback_shape() {
        let value = serde_json::json!({
            "five_hour": {"utilization": 10.0, "resets_at": "2026-09-27T00:00:00Z"},
            "seven_day": {"utilization": 30.0, "resets_at": "2026-10-02T00:00:00Z"}
        });
        assert_eq!(claude_windows(&value).len(), 2);
    }
}
