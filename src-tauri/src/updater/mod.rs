use std::{
    env,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use reqwest::blocking::Client;
use semver::Version;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::AppError;

const UPDATE_FEED_URL_ENV: &str = "CLIPBOARD_UPDATE_FEED_URL";
const UPDATE_REQUEST_TIMEOUT_SECS: u64 = 8;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum UpdateCheckStatus {
    Available,
    Latest,
    Failed,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct UpdateCheckResult {
    pub status: UpdateCheckStatus,
    pub checked_at: i64,
    pub current_version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_notes_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone)]
struct ReleaseDescriptor {
    latest_version: String,
    release_notes_url: Option<String>,
    download_url: Option<String>,
    message: Option<String>,
}

trait ReleaseManifestSource {
    fn fetch(&self, url: &str) -> Result<Value, AppError>;
}

struct HttpReleaseManifestSource {
    client: Client,
}

impl HttpReleaseManifestSource {
    fn new() -> Result<Self, AppError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(UPDATE_REQUEST_TIMEOUT_SECS))
            .build()
            .map_err(|error| {
                AppError::Internal(format!("build update http client failed: {error}"))
            })?;

        Ok(Self { client })
    }
}

impl ReleaseManifestSource for HttpReleaseManifestSource {
    fn fetch(&self, url: &str) -> Result<Value, AppError> {
        let response =
            self.client.get(url).send().map_err(|error| {
                AppError::Internal(format!("request update feed failed: {error}"))
            })?;
        let response = response.error_for_status().map_err(|error| {
            AppError::Internal(format!("update feed returned invalid status: {error}"))
        })?;

        response
            .json::<Value>()
            .map_err(|error| AppError::Internal(format!("parse update feed failed: {error}")))
    }
}

#[derive(Debug, Deserialize)]
struct GenericReleaseManifest {
    latest_version: Option<String>,
    release_notes_url: Option<String>,
    download_url: Option<String>,
    message: Option<String>,
    tag_name: Option<String>,
    html_url: Option<String>,
    assets: Option<Vec<GenericReleaseAsset>>,
}

#[derive(Debug, Deserialize)]
struct GenericReleaseAsset {
    browser_download_url: Option<String>,
}

pub async fn check_for_updates(current_version: String) -> UpdateCheckResult {
    let feed_url = env::var(UPDATE_FEED_URL_ENV).ok();
    let current_version_for_error = current_version.clone();

    match tauri::async_runtime::spawn_blocking(move || {
        let source = match HttpReleaseManifestSource::new() {
            Ok(source) => source,
            Err(error) => {
                tracing::error!(error = %error, "build update source failed");
                return failed_result(
                    &current_version,
                    "更新检查初始化失败，请稍后重试",
                    Some(error.to_string()),
                );
            }
        };

        check_with_source(&current_version, feed_url, &source)
    })
    .await
    {
        Ok(result) => result,
        Err(error) => {
            tracing::error!(error = %error, "update check join failed");
            failed_result(
                &current_version_for_error,
                "检查更新失败，请稍后重试",
                Some(error.to_string()),
            )
        }
    }
}

fn check_with_source(
    current_version: &str,
    feed_url: Option<String>,
    source: &dyn ReleaseManifestSource,
) -> UpdateCheckResult {
    let checked_at = now_ms();
    let Some(feed_url) = feed_url.filter(|value| !value.trim().is_empty()) else {
        return failed_result(
            current_version,
            "当前构建未配置更新源，请稍后从发布页确认新版本",
            None,
        );
    };

    let current = match parse_version(current_version) {
        Ok(version) => version,
        Err(message) => {
            return failed_result(current_version, &message, None);
        }
    };

    let manifest = match source.fetch(&feed_url) {
        Ok(payload) => payload,
        Err(error) => {
            tracing::warn!(error = %error, feed_url, "update feed request failed");
            return failed_result(
                current_version,
                "检查更新失败，请稍后重试",
                Some(error.to_string()),
            );
        }
    };

    let release = match parse_release_descriptor(manifest) {
        Ok(release) => release,
        Err(message) => {
            tracing::warn!(feed_url, message, "update feed payload invalid");
            return failed_result(current_version, &message, None);
        }
    };

    let latest = match parse_version(&release.latest_version) {
        Ok(version) => version,
        Err(message) => {
            tracing::warn!(feed_url, latest_version = %release.latest_version, message, "update feed version invalid");
            return failed_result(current_version, &message, None);
        }
    };

    if latest > current {
        return UpdateCheckResult {
            status: UpdateCheckStatus::Available,
            checked_at,
            current_version: current_version.to_string(),
            latest_version: Some(release.latest_version),
            release_notes_url: release.release_notes_url,
            download_url: release.download_url,
            message: Some(
                release
                    .message
                    .unwrap_or_else(|| format!("发现新版本 {}", latest)),
            ),
        };
    }

    UpdateCheckResult {
        status: UpdateCheckStatus::Latest,
        checked_at,
        current_version: current_version.to_string(),
        latest_version: Some(current_version.to_string()),
        release_notes_url: release.release_notes_url,
        download_url: release.download_url,
        message: Some(
            release
                .message
                .unwrap_or_else(|| "当前已是最新版本".to_string()),
        ),
    }
}

fn parse_release_descriptor(value: Value) -> Result<ReleaseDescriptor, String> {
    let manifest: GenericReleaseManifest = serde_json::from_value(value)
        .map_err(|error| format!("更新源返回了无法识别的数据：{error}"))?;

    if let Some(latest_version) = manifest.latest_version {
        return Ok(ReleaseDescriptor {
            latest_version,
            release_notes_url: manifest.release_notes_url,
            download_url: manifest.download_url,
            message: manifest.message,
        });
    }

    if let Some(tag_name) = manifest.tag_name {
        let latest_version = normalize_version(tag_name.as_str());
        let download_url = manifest.download_url.or_else(|| {
            manifest.assets.and_then(|assets| {
                assets
                    .into_iter()
                    .find_map(|asset| asset.browser_download_url)
            })
        });

        return Ok(ReleaseDescriptor {
            latest_version,
            release_notes_url: manifest.release_notes_url.or(manifest.html_url),
            download_url,
            message: manifest.message,
        });
    }

    Err("更新源返回了无法识别的数据：缺少 latest_version 或 tag_name".to_string())
}

fn parse_version(value: &str) -> Result<Version, String> {
    Version::parse(normalize_version(value).as_str())
        .map_err(|_| format!("更新源返回了无法识别的版本号：{value}"))
}

fn normalize_version(value: &str) -> String {
    value.trim().trim_start_matches('v').to_string()
}

fn failed_result(
    current_version: &str,
    message: &str,
    reason: Option<String>,
) -> UpdateCheckResult {
    if let Some(reason) = reason {
        tracing::warn!(reason, message, "update check returned failed status");
    }

    UpdateCheckResult {
        status: UpdateCheckStatus::Failed,
        checked_at: now_ms(),
        current_version: current_version.to_string(),
        latest_version: None,
        release_notes_url: None,
        download_url: None,
        message: Some(message.to_string()),
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        check_with_source, parse_release_descriptor, ReleaseManifestSource, UpdateCheckStatus,
    };
    use crate::error::AppError;

    struct StaticReleaseManifestSource {
        payload: Result<serde_json::Value, String>,
    }

    impl StaticReleaseManifestSource {
        fn success(payload: serde_json::Value) -> Self {
            Self {
                payload: Ok(payload),
            }
        }

        fn failure(message: &str) -> Self {
            Self {
                payload: Err(message.to_string()),
            }
        }
    }

    impl ReleaseManifestSource for StaticReleaseManifestSource {
        fn fetch(&self, _url: &str) -> Result<serde_json::Value, AppError> {
            self.payload
                .clone()
                .map_err(|message| AppError::Internal(message.to_string()))
        }
    }

    #[test]
    fn update_check_returns_available_when_feed_has_higher_version() {
        let source = StaticReleaseManifestSource::success(json!({
            "latest_version": "1.0.1",
            "release_notes_url": "https://example.com/releases/1.0.1",
            "download_url": "https://example.com/downloads/1.0.1"
        }));

        let result = check_with_source(
            "1.0.0",
            Some("https://example.com/releases/latest.json".to_string()),
            &source,
        );

        assert_eq!(result.status, UpdateCheckStatus::Available);
        assert_eq!(result.latest_version.as_deref(), Some("1.0.1"));
        assert_eq!(
            result.download_url.as_deref(),
            Some("https://example.com/downloads/1.0.1")
        );
    }

    #[test]
    fn update_check_supports_github_latest_release_payload() {
        let descriptor = parse_release_descriptor(json!({
            "tag_name": "v1.0.0",
            "html_url": "https://example.com/releases/1.0.0",
            "assets": [
                { "browser_download_url": "https://example.com/downloads/1.0.0" }
            ]
        }))
        .expect("github release payload should parse");

        assert_eq!(descriptor.latest_version, "1.0.0");
        assert_eq!(
            descriptor.release_notes_url.as_deref(),
            Some("https://example.com/releases/1.0.0")
        );
        assert_eq!(
            descriptor.download_url.as_deref(),
            Some("https://example.com/downloads/1.0.0")
        );
    }

    #[test]
    fn update_check_returns_latest_when_current_version_is_up_to_date() {
        let source = StaticReleaseManifestSource::success(json!({
            "latest_version": "1.0.0",
            "release_notes_url": "https://example.com/releases/1.0.0"
        }));

        let result = check_with_source(
            "1.0.0",
            Some("https://example.com/releases/latest.json".to_string()),
            &source,
        );

        assert_eq!(result.status, UpdateCheckStatus::Latest);
        assert_eq!(result.latest_version.as_deref(), Some("1.0.0"));
        assert_eq!(result.message.as_deref(), Some("当前已是最新版本"));
    }

    #[test]
    fn update_check_returns_failed_when_feed_request_fails() {
        let source = StaticReleaseManifestSource::failure("timeout");

        let result = check_with_source(
            "1.0.0",
            Some("https://example.com/releases/latest.json".to_string()),
            &source,
        );

        assert_eq!(result.status, UpdateCheckStatus::Failed);
        assert_eq!(result.message.as_deref(), Some("检查更新失败，请稍后重试"));
    }
}
