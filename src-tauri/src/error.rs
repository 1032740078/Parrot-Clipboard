use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ErrorPayload {
    pub code: &'static str,
    pub message: String,
}

#[derive(Debug)]
#[allow(dead_code)]
pub enum AppError {
    InvalidParam(String),
    RecordNotFound(u64),
    ClipboardRead(String),
    ClipboardWrite(String),
    KeySimulation(String),
    ImageProcess(String),
    FileAccess(String),
    Db(String),
    Window(String),
    MonitorControl(String),
    Autostart(String),
    Tray(String),
    Internal(String),
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.payload().message)
    }
}

impl std::error::Error for AppError {}

impl AppError {
    pub fn payload(&self) -> ErrorPayload {
        match self {
            Self::InvalidParam(message) => ErrorPayload {
                code: "INVALID_PARAM",
                message: message.clone(),
            },
            Self::RecordNotFound(id) => ErrorPayload {
                code: "RECORD_NOT_FOUND",
                message: format!("Record with id {} not found", id),
            },
            Self::ClipboardRead(message) => ErrorPayload {
                code: "CLIPBOARD_READ_ERROR",
                message: message.clone(),
            },
            Self::ClipboardWrite(message) => ErrorPayload {
                code: "CLIPBOARD_WRITE_ERROR",
                message: message.clone(),
            },
            Self::KeySimulation(message) => ErrorPayload {
                code: "KEY_SIM_ERROR",
                message: message.clone(),
            },
            Self::ImageProcess(message) => ErrorPayload {
                code: "IMAGE_PROCESS_ERROR",
                message: message.clone(),
            },
            Self::FileAccess(message) => ErrorPayload {
                code: "FILE_ACCESS_ERROR",
                message: message.clone(),
            },
            Self::Db(message) => ErrorPayload {
                code: "DB_ERROR",
                message: message.clone(),
            },
            Self::Window(message) => ErrorPayload {
                code: "WINDOW_ERROR",
                message: message.clone(),
            },
            Self::MonitorControl(message) => ErrorPayload {
                code: "MONITOR_CONTROL_ERROR",
                message: message.clone(),
            },
            Self::Autostart(message) => ErrorPayload {
                code: "AUTOSTART_ERROR",
                message: message.clone(),
            },
            Self::Tray(message) => ErrorPayload {
                code: "TRAY_ERROR",
                message: message.clone(),
            },
            Self::Internal(message) => ErrorPayload {
                code: "INTERNAL",
                message: message.clone(),
            },
        }
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.payload().serialize(serializer)
    }
}
