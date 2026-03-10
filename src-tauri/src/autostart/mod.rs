use std::{fs, path::PathBuf, sync::Arc};

pub mod linux;
pub mod windows;

use tauri::{process::current_binary, AppHandle, Manager};

use crate::error::AppError;

pub trait AutostartControl: Send + Sync {
    fn is_enabled(&self) -> Result<bool, AppError>;
    fn set_enabled(&self, enabled: bool) -> Result<bool, AppError>;
    fn reconcile(&self, enabled: bool) -> Result<bool, AppError>;
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub struct UnavailableAutostartService {
    message: String,
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
impl UnavailableAutostartService {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl AutostartControl for UnavailableAutostartService {
    fn is_enabled(&self) -> Result<bool, AppError> {
        Ok(false)
    }

    fn set_enabled(&self, enabled: bool) -> Result<bool, AppError> {
        if enabled {
            return Err(AppError::Autostart(self.message.clone()));
        }

        Ok(false)
    }

    fn reconcile(&self, enabled: bool) -> Result<bool, AppError> {
        if enabled {
            return Err(AppError::Autostart(self.message.clone()));
        }

        Ok(false)
    }
}

pub fn create_autostart_service(
    app_handle: &AppHandle,
) -> Result<Arc<dyn AutostartControl>, AppError> {
    #[cfg(target_os = "macos")]
    {
        Ok(LaunchAgentService::initialize(app_handle)?)
    }

    #[cfg(target_os = "windows")]
    {
        return Ok(WindowsAutostartService::initialize(app_handle)?);
    }

    #[cfg(target_os = "linux")]
    {
        return Ok(linux::LinuxAutostartService::initialize(app_handle)?);
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = app_handle;
        Ok(Arc::new(UnavailableAutostartService::new(
            "current platform autostart support is pending",
        )))
    }
}

pub struct LaunchAgentService {
    plist_path: PathBuf,
    label: String,
    executable_path: PathBuf,
}

impl LaunchAgentService {
    const DEFAULT_LABEL: &'static str = "com.robin.parrot-clipboard";

    pub fn initialize(app_handle: &AppHandle) -> Result<Arc<Self>, AppError> {
        let agent_dir = resolve_launch_agent_dir(app_handle)?;
        let executable_path = current_binary(&app_handle.env()).map_err(|error| {
            AppError::Autostart(format!("resolve current executable failed: {error}"))
        })?;

        Ok(Arc::new(Self {
            plist_path: agent_dir.join(format!("{}.plist", Self::DEFAULT_LABEL)),
            label: Self::DEFAULT_LABEL.to_string(),
            executable_path,
        }))
    }

    #[cfg(test)]
    pub fn initialize_with_paths(
        agent_dir: PathBuf,
        label: impl Into<String>,
        executable_path: PathBuf,
    ) -> Arc<Self> {
        let label = label.into();
        Arc::new(Self {
            plist_path: agent_dir.join(format!("{label}.plist")),
            label,
            executable_path,
        })
    }

    fn ensure_parent_dir(&self) -> Result<(), AppError> {
        let Some(parent) = self.plist_path.parent() else {
            return Err(AppError::Autostart(format!(
                "launch agent parent path missing for `{}`",
                self.plist_path.display()
            )));
        };

        fs::create_dir_all(parent).map_err(|error| {
            AppError::Autostart(format!(
                "create launch agents directory `{}` failed: {error}",
                parent.display()
            ))
        })
    }

    fn plist_contents(&self) -> String {
        let label = escape_xml(&self.label);
        let executable = escape_xml(&self.executable_path.display().to_string());

        format!(
            concat!(
                r#"<?xml version="1.0" encoding="UTF-8"?>"#,
                "\n",
                r#"<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">"#,
                "\n",
                r#"<plist version="1.0">"#,
                "\n",
                "<dict>\n",
                "  <key>Label</key>\n",
                "  <string>{label}</string>\n",
                "  <key>ProgramArguments</key>\n",
                "  <array>\n",
                "    <string>{executable}</string>\n",
                "  </array>\n",
                "  <key>RunAtLoad</key>\n",
                "  <true/>\n",
                "  <key>KeepAlive</key>\n",
                "  <false/>\n",
                "  <key>ProcessType</key>\n",
                "  <string>Interactive</string>\n",
                "</dict>\n",
                "</plist>\n"
            ),
            label = label,
            executable = executable,
        )
    }

    fn enable(&self) -> Result<bool, AppError> {
        self.ensure_parent_dir()?;
        fs::write(&self.plist_path, self.plist_contents()).map_err(|error| {
            AppError::Autostart(format!(
                "write launch agent plist `{}` failed: {error}",
                self.plist_path.display()
            ))
        })?;
        Ok(true)
    }

    fn disable(&self) -> Result<bool, AppError> {
        if self.plist_path.exists() {
            fs::remove_file(&self.plist_path).map_err(|error| {
                AppError::Autostart(format!(
                    "remove launch agent plist `{}` failed: {error}",
                    self.plist_path.display()
                ))
            })?;
        }
        Ok(false)
    }
}

#[cfg(test)]
impl LaunchAgentService {
    fn plist_path(&self) -> PathBuf {
        self.plist_path.clone()
    }
}

impl AutostartControl for LaunchAgentService {
    fn is_enabled(&self) -> Result<bool, AppError> {
        Ok(self.plist_path.exists())
    }

    fn set_enabled(&self, enabled: bool) -> Result<bool, AppError> {
        if enabled {
            self.enable()
        } else {
            self.disable()
        }
    }

    fn reconcile(&self, enabled: bool) -> Result<bool, AppError> {
        let current = self.is_enabled()?;
        if current == enabled {
            return Ok(current);
        }

        self.set_enabled(enabled)
    }
}

fn resolve_launch_agent_dir(app_handle: &AppHandle) -> Result<PathBuf, AppError> {
    let home_dir = app_handle
        .path()
        .home_dir()
        .map_err(|error| AppError::Autostart(format!("resolve home directory failed: {error}")))?;

    Ok(home_dir.join("Library/LaunchAgents"))
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use std::{
        env, fs,
        path::PathBuf,
        sync::Arc,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{AutostartControl, LaunchAgentService};

    #[test]
    fn enable_writes_valid_launch_agent_plist() {
        let context = TestContext::new("enable");
        let service = context.service();

        let enabled = service.set_enabled(true).expect("enable should succeed");
        let saved = fs::read_to_string(service.plist_path()).expect("plist should exist");

        assert!(enabled);
        assert!(saved.contains("<key>Label</key>"));
        assert!(saved.contains("com.robin.parrot-clipboard.test"));
        assert!(saved.contains("/mock/Clipboard Manager.app/Contents/MacOS/clipboard-manager"));
        assert!(service.is_enabled().expect("query should succeed"));
    }

    #[test]
    fn disable_removes_existing_plist() {
        let context = TestContext::new("disable");
        let service = context.service();
        service.set_enabled(true).expect("enable should succeed");

        let enabled = service.set_enabled(false).expect("disable should succeed");

        assert!(!enabled);
        assert!(!service.plist_path().exists());
        assert!(!service.is_enabled().expect("query should succeed"));
    }

    #[test]
    fn repeated_enable_and_disable_are_idempotent() {
        let context = TestContext::new("idempotent");
        let service = context.service();

        service
            .set_enabled(true)
            .expect("first enable should succeed");
        service
            .set_enabled(true)
            .expect("second enable should succeed");
        service
            .set_enabled(false)
            .expect("first disable should succeed");
        service
            .set_enabled(false)
            .expect("second disable should succeed");

        assert!(!service.plist_path().exists());
    }

    #[test]
    fn reconcile_repairs_missing_or_stale_plist() {
        let context = TestContext::new("reconcile");
        let service = context.service();

        assert!(service
            .reconcile(true)
            .expect("reconcile enable should succeed"));
        assert!(service.plist_path().exists());

        assert!(!service
            .reconcile(false)
            .expect("reconcile disable should succeed"));
        assert!(!service.plist_path().exists());
    }

    #[test]
    fn enable_escapes_xml_special_characters() {
        let context = TestContext::new("escape");
        let service = LaunchAgentService::initialize_with_paths(
            context.root_dir.join("LaunchAgents"),
            "com.robin.clipboard<&>'\"manager",
            PathBuf::from("/mock/Clipboard<&>'\" Manager.app/Contents/MacOS/clipboard-manager"),
        );

        service.set_enabled(true).expect("enable should succeed");
        let saved = fs::read_to_string(service.plist_path()).expect("plist should exist");

        assert!(saved.contains("com.robin.clipboard&lt;&amp;&gt;&apos;&quot;manager"));
        assert!(saved.contains(
            "/mock/Clipboard&lt;&amp;&gt;&apos;&quot; Manager.app/Contents/MacOS/clipboard-manager"
        ));
    }

    struct TestContext {
        root_dir: PathBuf,
    }

    impl TestContext {
        fn new(suffix: &str) -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time should be after unix epoch")
                .as_nanos();
            let root_dir = env::temp_dir().join(format!(
                "clipboard-manager-launch-agent-test-{suffix}-{nanos}"
            ));
            fs::create_dir_all(&root_dir).expect("test root dir should be created");
            Self { root_dir }
        }

        fn service(&self) -> Arc<LaunchAgentService> {
            LaunchAgentService::initialize_with_paths(
                self.root_dir.join("LaunchAgents"),
                "com.robin.parrot-clipboard.test",
                PathBuf::from("/mock/Clipboard Manager.app/Contents/MacOS/clipboard-manager"),
            )
        }
    }

    impl Drop for TestContext {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root_dir);
        }
    }
}
