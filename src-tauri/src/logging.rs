use std::{
    backtrace::Backtrace,
    fs,
    path::PathBuf,
    sync::{Arc, OnceLock},
};

use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

static PANIC_HOOK_INSTALLED: OnceLock<()> = OnceLock::new();

pub struct LoggingState {
    pub _guard: Arc<WorkerGuard>,
    pub log_directory: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClientLogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

pub fn init_logging(app_handle: &AppHandle) -> Result<LoggingState, String> {
    let log_dir = resolve_log_directory(app_handle)?;
    fs::create_dir_all(&log_dir)
        .map_err(|error| format!("create log directory failed: {error}"))?;

    let file_appender = tracing_appender::rolling::daily(&log_dir, "clipboard-manager.log");
    let (file_writer, guard) = tracing_appender::non_blocking(file_appender);

    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,tauri_app_lib=debug,frontend=debug"));

    let console_layer = tracing_subscriber::fmt::layer()
        .with_target(true)
        .with_ansi(true)
        .with_thread_ids(true);

    let file_layer = tracing_subscriber::fmt::layer()
        .with_target(true)
        .with_ansi(false)
        .with_thread_ids(true)
        .with_writer(file_writer);

    tracing_subscriber::registry()
        .with(env_filter)
        .with(console_layer)
        .with(file_layer)
        .try_init()
        .map_err(|error| format!("initialize tracing subscriber failed: {error}"))?;

    install_panic_hook();

    let log_directory = log_dir.display().to_string();
    tracing::info!(log_directory = %log_directory, "logging initialized");

    Ok(LoggingState {
        _guard: Arc::new(guard),
        log_directory,
    })
}

pub fn write_client_log(level: ClientLogLevel, message: String, context: Option<Value>) {
    match level {
        ClientLogLevel::Debug => tracing::debug!(
            target: "frontend",
            message = %message,
            context = context_as_string(&context),
            "frontend log"
        ),
        ClientLogLevel::Info => tracing::info!(
            target: "frontend",
            message = %message,
            context = context_as_string(&context),
            "frontend log"
        ),
        ClientLogLevel::Warn => tracing::warn!(
            target: "frontend",
            message = %message,
            context = context_as_string(&context),
            "frontend log"
        ),
        ClientLogLevel::Error => tracing::error!(
            target: "frontend",
            message = %message,
            context = context_as_string(&context),
            "frontend log"
        ),
    }
}

fn resolve_log_directory(app_handle: &AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .app_log_dir()
        .map_err(|error| format!("resolve app log directory failed: {error}"))
}

fn install_panic_hook() {
    if PANIC_HOOK_INSTALLED.set(()).is_err() {
        return;
    }

    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info| {
        let location = panic_info
            .location()
            .map(|loc| format!("{}:{}", loc.file(), loc.line()))
            .unwrap_or_else(|| "unknown".to_string());
        let message = panic_payload_to_string(panic_info.payload());
        let backtrace = Backtrace::force_capture().to_string();

        tracing::error!(
            target: "panic",
            location = %location,
            message = %message,
            backtrace = %backtrace,
            "application panic captured"
        );

        default_hook(panic_info);
    }));
}

fn panic_payload_to_string(payload: &(dyn std::any::Any + Send)) -> String {
    if let Some(message) = payload.downcast_ref::<&str>() {
        return (*message).to_string();
    }

    if let Some(message) = payload.downcast_ref::<String>() {
        return message.clone();
    }

    "unknown panic payload".to_string()
}

fn context_as_string(context: &Option<Value>) -> String {
    context
        .as_ref()
        .map(ToString::to_string)
        .unwrap_or_else(|| "{}".to_string())
}
