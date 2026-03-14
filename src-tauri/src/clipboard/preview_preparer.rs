use std::{collections::BTreeMap, fs, io::Read, path::Path, time::Duration};

use regex::Regex;
use reqwest::{blocking::Client, Url};
use serde::Serialize;
use zip::ZipArchive;

use crate::{
    clipboard::query::{DocumentKind, PreviewRenderer, PreviewStatus},
    error::AppError,
};

const DOCUMENT_TEXT_MAX_CHARS: usize = 12_000;
const LINK_CONTENT_MAX_CHARS: usize = 1_000;
const HTTP_TIMEOUT_SECS: u64 = 4;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedPreviewAsset {
    pub asset_role: String,
    pub storage_path: Option<String>,
    pub text_content: Option<String>,
    pub mime_type: Option<String>,
    pub byte_size: i64,
    pub status: PreviewStatus,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedPreview {
    pub renderer: PreviewRenderer,
    pub status: PreviewStatus,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub assets: Vec<PreparedPreviewAsset>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
struct DocumentOutlinePayload {
    document_kind: String,
    page_count: Option<i64>,
    sheet_names: Option<Vec<String>>,
    slide_count: Option<i64>,
    html_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
struct LinkPreviewPayload {
    url: String,
    title: Option<String>,
    site_name: Option<String>,
    description: Option<String>,
    cover_image: Option<String>,
    content_text: Option<String>,
    fetched_at: Option<i64>,
}

pub fn prepare_document_preview(path: &str) -> PreparedPreview {
    let source_path = Path::new(path);
    if !source_path.exists() {
        return failed_preview(
            PreviewRenderer::Document,
            "DOCUMENT_FILE_NOT_FOUND",
            "文稿源文件不存在或已被移除。",
        );
    }

    let Some(extension) = source_path
        .extension()
        .map(|value| value.to_string_lossy().to_ascii_lowercase())
    else {
        return unsupported_preview(
            PreviewRenderer::Document,
            "DOCUMENT_EXTENSION_UNKNOWN",
            "当前文稿缺少可识别扩展名，暂时无法生成结构化预览。",
        );
    };

    match extension.as_str() {
        "pdf" => PreparedPreview {
            renderer: PreviewRenderer::Pdf,
            status: PreviewStatus::Ready,
            error_code: None,
            error_message: None,
            assets: Vec::new(),
        },
        "docx" => build_docx_preview(source_path),
        "xlsx" => build_xlsx_preview(source_path),
        "pptx" => build_pptx_preview(source_path),
        "doc" | "xls" | "ppt" => unsupported_preview(
            PreviewRenderer::Document,
            "LEGACY_OFFICE_UNSUPPORTED",
            "当前版本暂不引入 LibreOffice，旧版 Office 文稿仅提供降级展示。",
        ),
        _ => unsupported_preview(
            PreviewRenderer::Document,
            "DOCUMENT_TYPE_UNSUPPORTED",
            "当前文稿类型暂不支持结构化预览。",
        ),
    }
}

pub fn prepare_link_preview(url: &str, fetched_at: i64) -> PreparedPreview {
    let Ok(parsed_url) = Url::parse(url.trim()) else {
        return failed_preview(
            PreviewRenderer::Link,
            "LINK_URL_INVALID",
            "链接地址格式无效，无法生成摘要预览。",
        );
    };

    if parsed_url.scheme() != "http" && parsed_url.scheme() != "https" {
        return unsupported_preview(
            PreviewRenderer::Link,
            "LINK_SCHEME_UNSUPPORTED",
            "当前仅支持 HTTP / HTTPS 链接的内容级预览。",
        );
    }

    let client = match Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .user_agent("ParrotClipboard/1.0")
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            return failed_preview(
                PreviewRenderer::Link,
                "LINK_CLIENT_INIT_FAILED",
                &format!("初始化链接预览请求器失败：{error}"),
            );
        }
    };

    let response = match client.get(parsed_url.clone()).send() {
        Ok(response) => response,
        Err(error) => {
            return failed_preview(
                PreviewRenderer::Link,
                "LINK_FETCH_FAILED",
                &format!("链接内容抓取失败：{error}"),
            );
        }
    };

    if !response.status().is_success() {
        return failed_preview(
            PreviewRenderer::Link,
            "LINK_FETCH_FAILED",
            &format!("链接抓取返回异常状态：{}", response.status()),
        );
    }

    let final_url = response.url().clone();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if !(content_type.contains("text/html")
        || content_type.contains("application/xhtml+xml")
        || content_type.is_empty())
    {
        return unsupported_preview(
            PreviewRenderer::Link,
            "LINK_CONTENT_UNSUPPORTED",
            "目标链接返回的内容类型暂不支持摘要预览。",
        );
    }

    let html = match response.text() {
        Ok(body) => body,
        Err(error) => {
            return failed_preview(
                PreviewRenderer::Link,
                "LINK_BODY_READ_FAILED",
                &format!("读取链接响应内容失败：{error}"),
            );
        }
    };

    let title = extract_meta_content(&html, "property", "og:title")
        .or_else(|| extract_meta_content(&html, "name", "twitter:title"))
        .or_else(|| extract_title(&html));
    let description = extract_meta_content(&html, "name", "description")
        .or_else(|| extract_meta_content(&html, "property", "og:description"))
        .or_else(|| extract_meta_content(&html, "name", "twitter:description"));
    let site_name = extract_meta_content(&html, "property", "og:site_name")
        .or_else(|| final_url.host_str().map(str::to_string));
    let cover_image = extract_meta_content(&html, "property", "og:image")
        .or_else(|| extract_meta_content(&html, "name", "twitter:image"))
        .and_then(|value| {
            final_url
                .join(value.trim())
                .ok()
                .map(|joined| joined.to_string())
        })
        .or_else(|| {
            extract_meta_content(&html, "property", "og:image")
                .or_else(|| extract_meta_content(&html, "name", "twitter:image"))
        });

    let mut content_text = strip_html_to_text(&html);
    if content_text.is_empty() {
        content_text = description.clone().unwrap_or_default();
    }
    let content_text = truncate_text(&content_text, LINK_CONTENT_MAX_CHARS);

    let payload = LinkPreviewPayload {
        url: final_url.to_string(),
        title: title.clone(),
        site_name: site_name.clone(),
        description: description.clone(),
        cover_image: cover_image.clone(),
        content_text: (!content_text.is_empty()).then_some(content_text.clone()),
        fetched_at: Some(fetched_at),
    };

    let payload_json = match serde_json::to_string(&payload) {
        Ok(payload_json) => payload_json,
        Err(error) => {
            return failed_preview(
                PreviewRenderer::Link,
                "LINK_SUMMARY_SERIALIZE_FAILED",
                &format!("序列化链接预览结果失败：{error}"),
            );
        }
    };

    PreparedPreview {
        renderer: PreviewRenderer::Link,
        status: PreviewStatus::Ready,
        error_code: None,
        error_message: None,
        assets: vec![PreparedPreviewAsset {
            asset_role: "link_summary".to_string(),
            storage_path: None,
            mime_type: Some("application/json".to_string()),
            byte_size: payload_json.len() as i64,
            text_content: Some(payload_json),
            status: PreviewStatus::Ready,
        }],
    }
}

fn build_docx_preview(source_path: &Path) -> PreparedPreview {
    match read_zip_entry_string(source_path, "word/document.xml").and_then(|xml| {
        let text = extract_wordprocessing_text(&xml);
        build_document_ready_preview(DocumentKind::Docx, text, None, None, None)
    }) {
        Ok(preview) => preview,
        Err(error) => failed_preview(
            PreviewRenderer::Document,
            "DOCX_PARSE_FAILED",
            &format!("DOCX 结构化预览生成失败：{error}"),
        ),
    }
}

fn build_xlsx_preview(source_path: &Path) -> PreparedPreview {
    match extract_xlsx_preview(source_path).and_then(|preview| {
        build_document_ready_preview(
            DocumentKind::Xlsx,
            preview.text_content,
            None,
            Some(preview.sheet_names),
            None,
        )
    }) {
        Ok(preview) => preview,
        Err(error) => failed_preview(
            PreviewRenderer::Document,
            "XLSX_PARSE_FAILED",
            &format!("XLSX 结构化预览生成失败：{error}"),
        ),
    }
}

fn build_pptx_preview(source_path: &Path) -> PreparedPreview {
    match extract_pptx_preview(source_path).and_then(|preview| {
        build_document_ready_preview(
            DocumentKind::Pptx,
            preview.text_content,
            None,
            None,
            Some(preview.slide_count),
        )
    }) {
        Ok(preview) => preview,
        Err(error) => failed_preview(
            PreviewRenderer::Document,
            "PPTX_PARSE_FAILED",
            &format!("PPTX 结构化预览生成失败：{error}"),
        ),
    }
}

fn build_document_ready_preview(
    kind: DocumentKind,
    text_content: String,
    page_count: Option<i64>,
    sheet_names: Option<Vec<String>>,
    slide_count: Option<i64>,
) -> Result<PreparedPreview, AppError> {
    let truncated_text = truncate_text(text_content.trim(), DOCUMENT_TEXT_MAX_CHARS);
    let outline = DocumentOutlinePayload {
        document_kind: kind.as_str().to_string(),
        page_count,
        sheet_names,
        slide_count,
        html_path: None,
    };
    let outline_json = serde_json::to_string(&outline).map_err(|error| {
        AppError::Internal(format!("serialize document outline failed: {error}"))
    })?;

    let mut assets = vec![PreparedPreviewAsset {
        asset_role: "document_outline".to_string(),
        storage_path: None,
        mime_type: Some("application/json".to_string()),
        byte_size: outline_json.len() as i64,
        text_content: Some(outline_json),
        status: PreviewStatus::Ready,
    }];

    if !truncated_text.is_empty() {
        assets.push(PreparedPreviewAsset {
            asset_role: "document_text".to_string(),
            storage_path: None,
            mime_type: Some("text/plain".to_string()),
            byte_size: truncated_text.len() as i64,
            text_content: Some(truncated_text),
            status: PreviewStatus::Ready,
        });
    }

    Ok(PreparedPreview {
        renderer: PreviewRenderer::Document,
        status: PreviewStatus::Ready,
        error_code: None,
        error_message: None,
        assets,
    })
}

fn unsupported_preview(renderer: PreviewRenderer, code: &str, message: &str) -> PreparedPreview {
    PreparedPreview {
        renderer,
        status: PreviewStatus::Unsupported,
        error_code: Some(code.to_string()),
        error_message: Some(message.to_string()),
        assets: Vec::new(),
    }
}

fn failed_preview(renderer: PreviewRenderer, code: &str, message: &str) -> PreparedPreview {
    PreparedPreview {
        renderer,
        status: PreviewStatus::Failed,
        error_code: Some(code.to_string()),
        error_message: Some(message.to_string()),
        assets: Vec::new(),
    }
}

fn read_zip_entry_string(source_path: &Path, entry_name: &str) -> Result<String, AppError> {
    let file = fs::File::open(source_path).map_err(|error| {
        AppError::FileAccess(format!(
            "open archive `{}` failed: {error}",
            source_path.display()
        ))
    })?;
    let mut archive = ZipArchive::new(file).map_err(|error| {
        AppError::FileAccess(format!(
            "open office archive `{}` failed: {error}",
            source_path.display()
        ))
    })?;
    let mut entry = archive.by_name(entry_name).map_err(|error| {
        AppError::FileAccess(format!(
            "read archive entry `{entry_name}` from `{}` failed: {error}",
            source_path.display()
        ))
    })?;

    let mut content = String::new();
    entry.read_to_string(&mut content).map_err(|error| {
        AppError::FileAccess(format!(
            "read archive entry `{entry_name}` content failed: {error}"
        ))
    })?;
    Ok(content)
}

fn list_zip_entries(source_path: &Path, prefix: &str) -> Result<Vec<String>, AppError> {
    let file = fs::File::open(source_path).map_err(|error| {
        AppError::FileAccess(format!(
            "open archive `{}` failed: {error}",
            source_path.display()
        ))
    })?;
    let mut archive = ZipArchive::new(file).map_err(|error| {
        AppError::FileAccess(format!(
            "open office archive `{}` failed: {error}",
            source_path.display()
        ))
    })?;
    let mut entries = Vec::new();

    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|error| {
            AppError::FileAccess(format!(
                "read archive entry by index from `{}` failed: {error}",
                source_path.display()
            ))
        })?;
        let name = entry.name().to_string();
        if name.starts_with(prefix) {
            entries.push(name);
        }
    }

    Ok(entries)
}

fn extract_wordprocessing_text(xml: &str) -> String {
    extract_xml_text(
        xml,
        &[
            ("</w:p>", "\n\n"),
            ("<w:tab/>", "\t"),
            ("<w:br/>", "\n"),
            ("<w:cr/>", "\n"),
        ],
    )
}

fn extract_presentation_text(xml: &str) -> String {
    extract_xml_text(
        xml,
        &[("</a:p>", "\n\n"), ("<a:tab/>", "\t"), ("<a:br/>", "\n")],
    )
}

fn extract_xml_text(xml: &str, replacements: &[(&str, &str)]) -> String {
    let mut normalized = xml.to_string();
    for (pattern, replacement) in replacements {
        normalized = normalized.replace(pattern, replacement);
    }

    let no_tags = Regex::new(r"(?s)<[^>]+>")
        .expect("xml tag regex should compile")
        .replace_all(&normalized, " ")
        .to_string();
    normalize_multiline_text(&decode_xml_entities(&no_tags))
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct XlsxPreview {
    sheet_names: Vec<String>,
    text_content: String,
}

fn extract_xlsx_preview(source_path: &Path) -> Result<XlsxPreview, AppError> {
    let workbook_xml = read_zip_entry_string(source_path, "xl/workbook.xml")?;
    let sheet_names = Regex::new(r#"<sheet[^>]*name="([^"]+)""#)
        .expect("workbook sheet regex should compile")
        .captures_iter(&workbook_xml)
        .filter_map(|capture| {
            capture
                .get(1)
                .map(|value| decode_xml_entities(value.as_str().trim()))
        })
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();

    let shared_strings = read_zip_entry_string(source_path, "xl/sharedStrings.xml")
        .ok()
        .map(|xml| extract_shared_strings(&xml))
        .unwrap_or_default();

    let mut worksheet_entries = list_zip_entries(source_path, "xl/worksheets/")?
        .into_iter()
        .filter(|name| name.ends_with(".xml"))
        .collect::<Vec<_>>();
    worksheet_entries.sort_by_key(|name| extract_trailing_number(name).unwrap_or(usize::MAX));

    let mut sheet_samples = BTreeMap::new();
    for (index, entry_name) in worksheet_entries.iter().enumerate() {
        let xml = read_zip_entry_string(source_path, entry_name)?;
        let values = extract_sheet_values(&xml, &shared_strings);
        if values.is_empty() {
            continue;
        }

        let sheet_name = sheet_names
            .get(index)
            .cloned()
            .unwrap_or_else(|| format!("工作表 {}", index + 1));
        let preview_line = values.into_iter().take(10).collect::<Vec<_>>().join(" | ");
        if !preview_line.is_empty() {
            sheet_samples.insert(sheet_name, preview_line);
        }
    }

    let mut sections = Vec::new();
    for (sheet_name, preview_line) in &sheet_samples {
        sections.push(format!("工作表：{sheet_name}\n{preview_line}"));
    }

    if sections.is_empty() && !sheet_names.is_empty() {
        sections.push(format!("工作表：{}", sheet_names.join("、")));
    }

    Ok(XlsxPreview {
        sheet_names,
        text_content: sections.join("\n\n"),
    })
}

fn extract_shared_strings(xml: &str) -> Vec<String> {
    let item_regex =
        Regex::new(r"(?s)<si\b[^>]*>(.*?)</si>").expect("shared string regex should compile");
    let text_regex =
        Regex::new(r"(?s)<t\b[^>]*>(.*?)</t>").expect("shared string text regex should compile");

    item_regex
        .captures_iter(xml)
        .map(|capture| {
            let block = capture
                .get(1)
                .map(|value| value.as_str())
                .unwrap_or_default();
            let text = text_regex
                .captures_iter(block)
                .filter_map(|text_capture| {
                    text_capture
                        .get(1)
                        .map(|value| decode_xml_entities(value.as_str()))
                })
                .collect::<Vec<_>>()
                .join("");
            normalize_inline_text(&text)
        })
        .collect()
}

fn extract_sheet_values(xml: &str, shared_strings: &[String]) -> Vec<String> {
    let cell_regex =
        Regex::new(r#"(?s)<c\b([^>]*)>(.*?)</c>"#).expect("sheet cell regex should compile");
    let value_regex = Regex::new(r"(?s)<v>(.*?)</v>").expect("sheet value regex should compile");
    let inline_regex =
        Regex::new(r"(?s)<t\b[^>]*>(.*?)</t>").expect("sheet inline string regex should compile");
    let shared_string_regex =
        Regex::new(r#"t="s""#).expect("sheet shared string type regex should compile");
    let inline_string_regex =
        Regex::new(r#"t="inlineStr""#).expect("sheet inline string type regex should compile");

    let mut values = Vec::new();
    for capture in cell_regex.captures_iter(xml) {
        let attributes = capture
            .get(1)
            .map(|value| value.as_str())
            .unwrap_or_default();
        let body = capture
            .get(2)
            .map(|value| value.as_str())
            .unwrap_or_default();
        let value = if shared_string_regex.is_match(attributes) {
            value_regex
                .captures(body)
                .and_then(|value_capture| value_capture.get(1))
                .and_then(|index| index.as_str().trim().parse::<usize>().ok())
                .and_then(|index| shared_strings.get(index).cloned())
        } else if inline_string_regex.is_match(attributes) {
            let inline = inline_regex
                .captures_iter(body)
                .filter_map(|value_capture| {
                    value_capture
                        .get(1)
                        .map(|value| decode_xml_entities(value.as_str()))
                })
                .collect::<Vec<_>>()
                .join("");
            (!inline.trim().is_empty()).then_some(normalize_inline_text(&inline))
        } else {
            value_regex
                .captures(body)
                .and_then(|value_capture| value_capture.get(1))
                .map(|value| normalize_inline_text(&decode_xml_entities(value.as_str())))
        };

        if let Some(value) = value.filter(|value| !value.is_empty()) {
            values.push(value);
        }
    }

    values
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PptxPreview {
    slide_count: i64,
    text_content: String,
}

fn extract_pptx_preview(source_path: &Path) -> Result<PptxPreview, AppError> {
    let mut slide_entries = list_zip_entries(source_path, "ppt/slides/")?
        .into_iter()
        .filter(|name| name.ends_with(".xml"))
        .collect::<Vec<_>>();
    slide_entries.sort_by_key(|name| extract_trailing_number(name).unwrap_or(usize::MAX));

    let mut sections = Vec::new();
    for (index, entry_name) in slide_entries.iter().enumerate() {
        let xml = read_zip_entry_string(source_path, entry_name)?;
        let text = extract_presentation_text(&xml);
        if text.is_empty() {
            continue;
        }

        sections.push(format!(
            "第 {} 张幻灯片\n{}",
            index + 1,
            truncate_text(&text, 600)
        ));
    }

    Ok(PptxPreview {
        slide_count: slide_entries.len() as i64,
        text_content: sections.join("\n\n"),
    })
}

fn extract_title(html: &str) -> Option<String> {
    Regex::new(r"(?is)<title[^>]*>(.*?)</title>")
        .expect("title regex should compile")
        .captures(html)
        .and_then(|capture| capture.get(1))
        .map(|value| normalize_inline_text(&decode_html_entities(value.as_str())))
        .filter(|value| !value.is_empty())
}

fn extract_meta_content(html: &str, attribute_name: &str, attribute_value: &str) -> Option<String> {
    let escaped_value = regex::escape(attribute_value);
    let escaped_attr = regex::escape(attribute_name);
    let patterns = [
        format!(
            r#"(?is)<meta[^>]*{escaped_attr}\s*=\s*["']{escaped_value}["'][^>]*content\s*=\s*["'](.*?)["'][^>]*>"#
        ),
        format!(
            r#"(?is)<meta[^>]*content\s*=\s*["'](.*?)["'][^>]*{escaped_attr}\s*=\s*["']{escaped_value}["'][^>]*>"#
        ),
    ];

    patterns.iter().find_map(|pattern| {
        Regex::new(pattern)
            .ok()?
            .captures(html)
            .and_then(|capture| capture.get(1))
            .map(|value| normalize_inline_text(&decode_html_entities(value.as_str())))
            .filter(|value| !value.is_empty())
    })
}

fn strip_html_to_text(html: &str) -> String {
    let script_regex =
        Regex::new(r"(?is)<(script|style|noscript)[^>]*>.*?</(script|style|noscript)>")
            .expect("script strip regex should compile");
    let tag_regex = Regex::new(r"(?is)<[^>]+>").expect("html tag strip regex should compile");
    let no_scripts = script_regex.replace_all(html, " ");
    let no_tags = tag_regex.replace_all(&no_scripts, " ");
    normalize_inline_text(&decode_html_entities(&no_tags))
}

fn decode_xml_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}

fn decode_html_entities(value: &str) -> String {
    decode_xml_entities(value)
        .replace("&nbsp;", " ")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
}

fn normalize_inline_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn normalize_multiline_text(value: &str) -> String {
    value
        .lines()
        .map(normalize_inline_text)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn truncate_text(value: &str, max_chars: usize) -> String {
    let mut chars = value.chars();
    let truncated = chars.by_ref().take(max_chars).collect::<String>();
    if chars.next().is_some() {
        format!("{truncated}…")
    } else {
        truncated
    }
}

fn extract_trailing_number(value: &str) -> Option<usize> {
    let digits = value
        .chars()
        .rev()
        .skip_while(|ch| !ch.is_ascii_digit())
        .take_while(|ch| ch.is_ascii_digit())
        .collect::<String>();
    if digits.is_empty() {
        return None;
    }

    digits
        .chars()
        .rev()
        .collect::<String>()
        .parse::<usize>()
        .ok()
}

#[cfg(test)]
mod tests {
    use std::{
        env, fs,
        io::Write,
        net::TcpListener,
        path::{Path, PathBuf},
        thread,
        time::{SystemTime, UNIX_EPOCH},
    };

    use zip::write::SimpleFileOptions;

    use super::{prepare_document_preview, prepare_link_preview};
    use crate::clipboard::query::{PreviewRenderer, PreviewStatus};

    #[test]
    fn prepare_docx_preview_extracts_body_text() {
        let root_dir = unique_test_dir("docx-preview");
        fs::create_dir_all(&root_dir).expect("test root should exist");
        let file_path = root_dir.join("meeting.docx");
        write_zip_entries(
            &file_path,
            &[(
                "word/document.xml",
                r#"<w:document><w:body><w:p><w:r><w:t>第一段</w:t></w:r></w:p><w:p><w:r><w:t>第二段</w:t></w:r></w:p></w:body></w:document>"#,
            )],
        );

        let prepared = prepare_document_preview(file_path.to_string_lossy().as_ref());

        assert_eq!(prepared.renderer, PreviewRenderer::Document);
        assert_eq!(prepared.status, PreviewStatus::Ready);
        let document_text = prepared
            .assets
            .iter()
            .find(|asset| asset.asset_role == "document_text")
            .and_then(|asset| asset.text_content.as_deref())
            .expect("document_text asset should exist");
        assert!(document_text.contains("第一段"));
        assert!(document_text.contains("第二段"));

        let _ = fs::remove_dir_all(root_dir);
    }

    #[test]
    fn prepare_xlsx_preview_extracts_sheet_names_and_cells() {
        let root_dir = unique_test_dir("xlsx-preview");
        fs::create_dir_all(&root_dir).expect("test root should exist");
        let file_path = root_dir.join("sales.xlsx");
        write_zip_entries(
            &file_path,
            &[
                (
                    "xl/workbook.xml",
                    r#"<workbook><sheets><sheet name="概览"/><sheet name="明细"/></sheets></workbook>"#,
                ),
                (
                    "xl/sharedStrings.xml",
                    r#"<sst><si><t>收入</t></si><si><t>1200</t></si></sst>"#,
                ),
                (
                    "xl/worksheets/sheet1.xml",
                    r#"<worksheet><sheetData><row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row></sheetData></worksheet>"#,
                ),
                (
                    "xl/worksheets/sheet2.xml",
                    r#"<worksheet><sheetData><row><c t="inlineStr"><is><t>利润</t></is></c><c><v>320</v></c></row></sheetData></worksheet>"#,
                ),
            ],
        );

        let prepared = prepare_document_preview(file_path.to_string_lossy().as_ref());

        assert_eq!(prepared.status, PreviewStatus::Ready);
        let outline = prepared
            .assets
            .iter()
            .find(|asset| asset.asset_role == "document_outline")
            .and_then(|asset| asset.text_content.as_deref())
            .expect("document_outline asset should exist");
        assert!(outline.contains("概览"));
        assert!(outline.contains("明细"));

        let document_text = prepared
            .assets
            .iter()
            .find(|asset| asset.asset_role == "document_text")
            .and_then(|asset| asset.text_content.as_deref())
            .expect("document_text asset should exist");
        assert!(document_text.contains("工作表：概览"));
        assert!(document_text.contains("收入"));

        let _ = fs::remove_dir_all(root_dir);
    }

    #[test]
    fn prepare_pptx_preview_extracts_slide_text() {
        let root_dir = unique_test_dir("pptx-preview");
        fs::create_dir_all(&root_dir).expect("test root should exist");
        let file_path = root_dir.join("deck.pptx");
        write_zip_entries(
            &file_path,
            &[
                (
                    "ppt/slides/slide1.xml",
                    r#"<p:sld><a:p><a:r><a:t>封面标题</a:t></a:r></a:p></p:sld>"#,
                ),
                (
                    "ppt/slides/slide2.xml",
                    r#"<p:sld><a:p><a:r><a:t>关键结论</a:t></a:r></a:p></p:sld>"#,
                ),
            ],
        );

        let prepared = prepare_document_preview(file_path.to_string_lossy().as_ref());

        assert_eq!(prepared.status, PreviewStatus::Ready);
        let outline = prepared
            .assets
            .iter()
            .find(|asset| asset.asset_role == "document_outline")
            .and_then(|asset| asset.text_content.as_deref())
            .expect("document_outline asset should exist");
        assert!(outline.contains("\"slide_count\":2"));
        let document_text = prepared
            .assets
            .iter()
            .find(|asset| asset.asset_role == "document_text")
            .and_then(|asset| asset.text_content.as_deref())
            .expect("document_text asset should exist");
        assert!(document_text.contains("第 1 张幻灯片"));
        assert!(document_text.contains("关键结论"));

        let _ = fs::remove_dir_all(root_dir);
    }

    #[test]
    fn prepare_legacy_office_preview_returns_unsupported() {
        let root_dir = unique_test_dir("legacy-doc-preview");
        fs::create_dir_all(&root_dir).expect("test root should exist");
        let file_path = root_dir.join("legacy.doc");
        fs::write(&file_path, "legacy").expect("legacy doc should be created");
        let prepared = prepare_document_preview(file_path.to_string_lossy().as_ref());

        assert_eq!(prepared.renderer, PreviewRenderer::Document);
        assert_eq!(prepared.status, PreviewStatus::Unsupported);
        assert_eq!(
            prepared.error_code.as_deref(),
            Some("LEGACY_OFFICE_UNSUPPORTED")
        );

        let _ = fs::remove_dir_all(root_dir);
    }

    #[test]
    fn prepare_link_preview_extracts_metadata_from_html() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("listener should bind");
        let address = listener.local_addr().expect("listener addr should exist");
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("server should accept");
            let response = concat!(
                "HTTP/1.1 200 OK\r\n",
                "Content-Type: text/html; charset=utf-8\r\n",
                "Connection: close\r\n\r\n",
                "<html><head><title>原始标题</title>",
                "<meta property=\"og:title\" content=\"产品详情\" />",
                "<meta property=\"og:site_name\" content=\"示例站点\" />",
                "<meta name=\"description\" content=\"这是一段摘要\" />",
                "</head><body><main><h1>产品详情</h1><p>这是正文预览内容。</p></main></body></html>"
            );
            stream
                .write_all(response.as_bytes())
                .expect("response should be written");
        });

        let prepared = prepare_link_preview(&format!("http://{address}/demo"), 1_234);
        server.join().expect("server thread should join");

        assert_eq!(prepared.renderer, PreviewRenderer::Link);
        assert_eq!(prepared.status, PreviewStatus::Ready);
        let summary = prepared
            .assets
            .iter()
            .find(|asset| asset.asset_role == "link_summary")
            .and_then(|asset| asset.text_content.as_deref())
            .expect("link summary asset should exist");
        assert!(summary.contains("产品详情"));
        assert!(summary.contains("示例站点"));
        assert!(summary.contains("这是一段摘要"));
    }

    #[test]
    fn prepare_link_preview_returns_failed_for_unreachable_url() {
        let prepared = prepare_link_preview("http://127.0.0.1:9/unreachable", 1_234);

        assert_eq!(prepared.renderer, PreviewRenderer::Link);
        assert_eq!(prepared.status, PreviewStatus::Failed);
        assert_eq!(prepared.error_code.as_deref(), Some("LINK_FETCH_FAILED"));
    }

    fn write_zip_entries(path: &Path, entries: &[(&str, &str)]) {
        let file = fs::File::create(path).expect("zip file should be created");
        let mut writer = zip::ZipWriter::new(file);
        let options = SimpleFileOptions::default();

        for (entry_name, content) in entries {
            writer
                .start_file(*entry_name, options)
                .expect("zip entry should start");
            writer
                .write_all(content.as_bytes())
                .expect("zip entry should be written");
        }

        writer.finish().expect("zip writer should finish");
    }

    fn unique_test_dir(suffix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        env::temp_dir().join(format!("clipboard-preview-preparer-{suffix}-{nanos}"))
    }
}
