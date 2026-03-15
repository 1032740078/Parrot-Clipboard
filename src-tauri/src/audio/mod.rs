use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::OnceLock,
};

use crate::error::AppError;

const COPY_CAPTURED_MP3: &[u8] = include_bytes!("../../../src/assets/sounds/copy-notification.mp3");
const PASTE_COMPLETED_MP3: &[u8] =
    include_bytes!("../../../src/assets/sounds/paste-notification.mp3");

static COPY_CAPTURED_PATH: OnceLock<PathBuf> = OnceLock::new();
static PASTE_COMPLETED_PATH: OnceLock<PathBuf> = OnceLock::new();

#[derive(Debug, Clone, Copy)]
pub enum SoundEffectCue {
    CopyCaptured,
    PasteCompleted,
}

impl SoundEffectCue {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::CopyCaptured => "copy_captured",
            Self::PasteCompleted => "paste_completed",
        }
    }

    fn file_name(&self) -> &'static str {
        match self {
            Self::CopyCaptured => "copy-notification.mp3",
            Self::PasteCompleted => "paste-notification.mp3",
        }
    }

    fn bytes(&self) -> &'static [u8] {
        match self {
            Self::CopyCaptured => COPY_CAPTURED_MP3,
            Self::PasteCompleted => PASTE_COMPLETED_MP3,
        }
    }

    fn path_cache(&self) -> &'static OnceLock<PathBuf> {
        match self {
            Self::CopyCaptured => &COPY_CAPTURED_PATH,
            Self::PasteCompleted => &PASTE_COMPLETED_PATH,
        }
    }
}

pub fn play_sound_effect(cue: SoundEffectCue) -> Result<(), AppError> {
    if cfg!(test) {
        tracing::debug!(sound_cue = cue.as_str(), "skip native sound playback in tests");
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        let sound_path = ensure_sound_file(cue)?;
        Command::new("/usr/bin/afplay")
            .arg(&sound_path)
            .spawn()
            .map_err(|error| {
                AppError::Internal(format!(
                    "spawn native sound player for `{}` failed: {error}",
                    cue.as_str()
                ))
            })?;

        tracing::debug!(
            sound_cue = cue.as_str(),
            path = %sound_path.display(),
            "native sound playback spawned"
        );
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err(AppError::UnsupportedPlatformFeature(
        "native sound playback is only implemented for macOS".to_string(),
    ))
}

#[cfg(target_os = "macos")]
fn ensure_sound_file(cue: SoundEffectCue) -> Result<PathBuf, AppError> {
    if let Some(existing) = cue.path_cache().get() {
        return Ok(existing.clone());
    }

    let sound_dir = sound_cache_dir();
    fs::create_dir_all(&sound_dir).map_err(|error| {
        AppError::FileAccess(format!(
            "create native sound cache dir `{}` failed: {error}",
            sound_dir.display()
        ))
    })?;

    let sound_path = sound_dir.join(cue.file_name());
    ensure_sound_file_bytes(&sound_path, cue.bytes())?;
    let _ = cue.path_cache().set(sound_path.clone());

    Ok(sound_path)
}

#[cfg(target_os = "macos")]
fn sound_cache_dir() -> PathBuf {
    std::env::temp_dir().join("parrot-clipboard").join("sounds")
}

#[cfg(target_os = "macos")]
fn ensure_sound_file_bytes(path: &Path, bytes: &[u8]) -> Result<(), AppError> {
    let should_write = match fs::metadata(path) {
        Ok(metadata) => metadata.len() != bytes.len() as u64,
        Err(_) => true,
    };

    if !should_write {
        return Ok(());
    }

    fs::write(path, bytes).map_err(|error| {
        AppError::FileAccess(format!(
            "write native sound asset `{}` failed: {error}",
            path.display()
        ))
    })
}
