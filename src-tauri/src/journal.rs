use chrono::{Datelike, Local};
use rusqlite::{params, Connection};
use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

const MAX_MONTH_BYTES: usize = 2 * 1024 * 1024;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalSummary {
    pub date: String,
    pub completed_habits: u32,
    pub total_habits: u32,
    pub has_diary: bool,
    pub sleep_hours: f64,
    pub note_count: u32,
}

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Não foi possível localizar os dados do Willow: {error}"))?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Não foi possível criar a pasta do Journal: {error}"))?;
    Ok(directory.join("willow-journal.sqlite3"))
}

fn open_database(app: &AppHandle) -> Result<Connection, String> {
    let connection = Connection::open(database_path(app)?)
        .map_err(|error| format!("Não foi possível abrir o banco local do Journal: {error}"))?;
    connection
        .execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             CREATE TABLE IF NOT EXISTS journal_months (
                 month TEXT PRIMARY KEY NOT NULL,
                 payload TEXT NOT NULL,
                 updated_at INTEGER NOT NULL
             );",
        )
        .map_err(|error| format!("Não foi possível preparar o Journal: {error}"))?;
    Ok(connection)
}

fn validate_month(month: &str) -> Result<(), String> {
    let valid = month.len() == 7
        && month.as_bytes()[4] == b'-'
        && month[..4]
            .chars()
            .all(|character| character.is_ascii_digit())
        && month[5..]
            .chars()
            .all(|character| character.is_ascii_digit())
        && month[5..]
            .parse::<u8>()
            .is_ok_and(|value| (1..=12).contains(&value));
    if valid {
        Ok(())
    } else {
        Err("Mês inválido".to_string())
    }
}

fn load_payload(app: &AppHandle, month: &str) -> Result<Option<Value>, String> {
    validate_month(month)?;
    let connection = open_database(app)?;
    let mut statement = connection
        .prepare("SELECT payload FROM journal_months WHERE month = ?1")
        .map_err(|error| error.to_string())?;
    let result = statement.query_row([month], |row| row.get::<_, String>(0));
    match result {
        Ok(payload) => serde_json::from_str(&payload)
            .map(Some)
            .map_err(|error| format!("Os dados locais do Journal estão corrompidos: {error}")),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(format!("Não foi possível ler o Journal: {error}")),
    }
}

fn summary_from_payload(date: &str, payload: Option<&Value>) -> JournalSummary {
    let day = date
        .rsplit('-')
        .next()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(1);
    let day_key = day.to_string();
    let empty = json!({});
    let payload = payload.unwrap_or(&empty);
    let habits = payload
        .get("habits")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let completed_habits = habits
        .iter()
        .filter(|habit| {
            habit
                .get("days")
                .and_then(|days| days.get(&day_key))
                .and_then(Value::as_bool)
                .unwrap_or(false)
        })
        .count() as u32;
    let diary = payload
        .get("diary")
        .and_then(|items| items.get(&day_key))
        .and_then(Value::as_str)
        .unwrap_or("");
    let note_count = payload
        .get("days")
        .and_then(|items| items.get(&day_key))
        .and_then(Value::as_str)
        .map(|note| note.lines().filter(|line| !line.trim().is_empty()).count() as u32)
        .unwrap_or(0);
    let sleep_hours = payload
        .get("sleep")
        .and_then(|items| items.get(&day_key))
        .and_then(Value::as_f64)
        .unwrap_or(0.0);

    JournalSummary {
        date: date.to_string(),
        completed_habits,
        total_habits: habits.len() as u32,
        has_diary: !diary.trim().is_empty(),
        sleep_hours,
        note_count,
    }
}

#[tauri::command]
pub fn open_journal_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("settings")
        .ok_or_else(|| "A janela de configurações não está disponível".to_string())?;
    let _ = window.set_size(tauri::LogicalSize::new(1180.0, 760.0));
    let _ = window.center();
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
    let _ = window.emit("journal-opened", ());
    let delayed_app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(160)).await;
        let _ = delayed_app.emit("journal-opened", ());
    });
    Ok(())
}

#[tauri::command]
pub fn close_journal_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        window
            .hide()
            .map_err(|error| format!("Não foi possível fechar o Journal: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn journal_load_month(app: AppHandle, month: String) -> Result<Option<Value>, String> {
    load_payload(&app, &month)
}

#[tauri::command]
pub fn journal_save_month(app: AppHandle, month: String, data: Value) -> Result<(), String> {
    validate_month(&month)?;
    if !data.is_object() {
        return Err("Os dados do Journal precisam ser um objeto".to_string());
    }
    let payload = serde_json::to_string(&data).map_err(|error| error.to_string())?;
    if payload.len() > MAX_MONTH_BYTES {
        return Err("Este mês ultrapassou o limite local de 2 MB".to_string());
    }
    let connection = open_database(&app)?;
    connection
        .execute(
            "INSERT INTO journal_months (month, payload, updated_at)
             VALUES (?1, ?2, unixepoch())
             ON CONFLICT(month) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
            params![month, payload],
        )
        .map_err(|error| format!("Não foi possível salvar o Journal: {error}"))?;

    let today = Local::now().date_naive();
    let today_month = format!("{:04}-{:02}", today.year(), today.month());
    if month == today_month {
        let date = format!("{}-{:02}", month, today.day());
        let summary = summary_from_payload(&date, Some(&data));
        let _ = app.emit("journal-summary-changed", summary);
    }
    Ok(())
}

#[tauri::command]
pub fn journal_get_today_summary(app: AppHandle) -> Result<JournalSummary, String> {
    let today = Local::now().date_naive();
    let month = format!("{:04}-{:02}", today.year(), today.month());
    let date = format!("{}-{:02}", month, today.day());
    let payload = load_payload(&app, &month)?;
    Ok(summary_from_payload(&date, payload.as_ref()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn month_validation_rejects_invalid_values() {
        assert!(validate_month("2026-09").is_ok());
        assert!(validate_month("2026-13").is_err());
        assert!(validate_month("26-09").is_err());
    }

    #[test]
    fn summary_reads_habits_diary_sleep_and_notes() {
        let payload = json!({
            "habits": [
                { "days": { "27": true } },
                { "days": { "27": false } }
            ],
            "diary": { "27": "Um registro" },
            "sleep": { "27": 7.5 },
            "days": { "27": "Primeira nota\nSegunda nota" }
        });
        let summary = summary_from_payload("2026-09-27", Some(&payload));
        assert_eq!(summary.completed_habits, 1);
        assert_eq!(summary.total_habits, 2);
        assert!(summary.has_diary);
        assert_eq!(summary.sleep_hours, 7.5);
        assert_eq!(summary.note_count, 2);
    }
}
