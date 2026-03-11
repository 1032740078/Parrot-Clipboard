use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use image::{
    codecs::bmp::BmpEncoder,
    imageops::{self, colorops::contrast_in_place, FilterType},
    ColorType, DynamicImage, GrayImage, ImageEncoder, RgbaImage,
};
use serde::Deserialize;
use tauri::{AppHandle, Manager};

use crate::{clipboard::payload::ClipboardImageData, error::AppError};

include!(concat!(env!("OUT_DIR"), "/embedded_ocr_sidecar.rs"));

pub trait ImageTextRecognizer: Send + Sync {
    fn recognize_image_text(&self, image: &ClipboardImageData) -> Result<String, AppError>;
}

pub struct OcrService {
    executable_path: Option<PathBuf>,
    temp_dir: PathBuf,
}

const MIN_OCR_TARGET_HEIGHT_PX: u32 = 384;
const MAX_OCR_UPSCALE_FACTOR: u32 = 4;

impl OcrService {
    pub fn initialize(app_handle: &AppHandle) -> Result<Self, AppError> {
        let executable_path = match EMBEDDED_OCR_SIDECAR.as_ref() {
            Some(sidecar) => Some(extract_embedded_sidecar(app_handle, sidecar)?),
            None => None,
        };
        let temp_dir = app_handle
            .path()
            .app_local_data_dir()
            .map_err(|error| AppError::FileAccess(format!("解析 OCR 缓存目录失败：{error}")))?
            .join("ocr-inputs");
        fs::create_dir_all(&temp_dir).map_err(|error| {
            AppError::FileAccess(format!(
                "创建 OCR 临时目录 `{}` 失败：{error}",
                temp_dir.display()
            ))
        })?;

        Ok(Self {
            executable_path,
            temp_dir,
        })
    }
}

impl ImageTextRecognizer for OcrService {
    fn recognize_image_text(&self, image: &ClipboardImageData) -> Result<String, AppError> {
        let executable_path = self.executable_path.as_ref().ok_or_else(|| {
            AppError::UnsupportedPlatformFeature("当前平台暂未内置 OCR 识别能力".to_string())
        })?;
        let variants = build_ocr_variants(image)?;
        let mut attempted_labels = Vec::with_capacity(variants.len());

        for variant in variants {
            attempted_labels.push(variant.label);
            let text = run_ocr_with_variant(executable_path, &self.temp_dir, &variant.image)?;
            if !text.is_empty() {
                tracing::info!(attempt = variant.label, "OCR image recognition succeeded");
                return Ok(text);
            }
        }

        tracing::warn!(attempts = ?attempted_labels, "OCR image recognition produced empty text");
        Err(AppError::InvalidParam(
            "图片中未识别到可粘贴文字".to_string(),
        ))
    }
}

#[derive(Debug, Clone)]
struct OcrVariant {
    label: &'static str,
    image: ClipboardImageData,
}

#[derive(Debug, Deserialize, Clone)]
struct OcrJsonBlock {
    text: String,
    position: OcrPosition,
}

#[derive(Debug, Deserialize, Clone)]
struct OcrPosition {
    left: i32,
    top: i32,
    width: i32,
    height: i32,
}

#[derive(Debug)]
struct OcrLine {
    segments: Vec<OcrJsonBlock>,
    top: i32,
    bottom: i32,
    total_center_y: i64,
}

impl OcrLine {
    fn new(segment: OcrJsonBlock) -> Self {
        let center_y = segment.position.top + segment.position.height / 2;
        let top = segment.position.top;
        let bottom = segment.position.top + segment.position.height;
        Self {
            segments: vec![segment],
            top,
            bottom,
            total_center_y: center_y as i64,
        }
    }

    fn push(&mut self, segment: OcrJsonBlock) {
        let center_y = segment.position.top + segment.position.height / 2;
        self.top = self.top.min(segment.position.top);
        self.bottom = self
            .bottom
            .max(segment.position.top + segment.position.height);
        self.total_center_y += center_y as i64;
        self.segments.push(segment);
    }

    fn average_center_y(&self) -> f64 {
        self.total_center_y as f64 / self.segments.len() as f64
    }

    fn average_height(&self) -> f64 {
        let total_height: i64 = self
            .segments
            .iter()
            .map(|segment| segment.position.height.max(1) as i64)
            .sum();
        total_height as f64 / self.segments.len() as f64
    }
}

struct TemporaryOcrInput {
    path: PathBuf,
}

impl TemporaryOcrInput {
    fn create(temp_dir: &Path, image: &ClipboardImageData) -> Result<Self, AppError> {
        let rgba = rgba_from_clipboard_image(image)?;
        let path = temp_dir.join(format!("ocr-input-{}.bmp", next_temp_input_suffix()));
        let mut file = fs::File::create(&path).map_err(|error| {
            AppError::FileAccess(format!(
                "创建 OCR 临时图片 `{}` 失败：{error}",
                path.display()
            ))
        })?;

        BmpEncoder::new(&mut file)
            .write_image(
                rgba.as_raw(),
                rgba.width(),
                rgba.height(),
                ColorType::Rgba8.into(),
            )
            .map_err(|error| {
                AppError::ImageProcess(format!(
                    "写入 OCR 临时图片 `{}` 失败：{error}",
                    path.display()
                ))
            })?;

        Ok(Self { path })
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TemporaryOcrInput {
    fn drop(&mut self) {
        if let Err(error) = fs::remove_file(&self.path) {
            tracing::debug!(
                path = %self.path.display(),
                error = %error,
                "remove OCR temporary input failed"
            );
        }
    }
}

fn build_ocr_variants(image: &ClipboardImageData) -> Result<Vec<OcrVariant>, AppError> {
    let base_rgba = rgba_from_clipboard_image(image)?;
    let upscaled = upscale_for_ocr(&base_rgba);
    let grayscale = build_contrast_grayscale(&upscaled);
    let binary = build_binary_image(&grayscale);
    let mut inverted_binary = binary.clone();
    imageops::invert(&mut inverted_binary);

    let mut variants = Vec::<OcrVariant>::new();
    let mut seen = std::collections::HashSet::<String>::new();

    push_ocr_variant(
        &mut variants,
        &mut seen,
        "original",
        clipboard_image_from_rgba(&base_rgba),
    );
    push_ocr_variant(
        &mut variants,
        &mut seen,
        "upscaled",
        clipboard_image_from_rgba(&upscaled),
    );
    push_ocr_variant(
        &mut variants,
        &mut seen,
        "grayscale_contrast",
        clipboard_image_from_rgba(&DynamicImage::ImageLuma8(grayscale).to_rgba8()),
    );
    push_ocr_variant(
        &mut variants,
        &mut seen,
        "binary",
        clipboard_image_from_rgba(&DynamicImage::ImageLuma8(binary).to_rgba8()),
    );
    push_ocr_variant(
        &mut variants,
        &mut seen,
        "binary_inverted",
        clipboard_image_from_rgba(&DynamicImage::ImageLuma8(inverted_binary).to_rgba8()),
    );

    Ok(variants)
}

fn push_ocr_variant(
    variants: &mut Vec<OcrVariant>,
    seen: &mut std::collections::HashSet<String>,
    label: &'static str,
    image: ClipboardImageData,
) {
    let signature = image.sha256_hex();
    if !seen.insert(signature) {
        return;
    }

    variants.push(OcrVariant { label, image });
}

fn run_ocr_with_variant(
    executable_path: &Path,
    temp_dir: &Path,
    image: &ClipboardImageData,
) -> Result<String, AppError> {
    let temp_input = TemporaryOcrInput::create(temp_dir, image)?;
    let output = Command::new(executable_path)
        .arg("--path")
        .arg(temp_input.path())
        .arg("--mode")
        .arg("json")
        .output()
        .map_err(|error| {
            AppError::Internal(format!(
                "启动 OCR 内置引擎失败：{}，路径：{}",
                error,
                executable_path.display()
            ))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(AppError::Internal(if stderr.is_empty() {
            "OCR 图片识别失败".to_string()
        } else {
            format!("OCR 图片识别失败：{stderr}")
        }));
    }

    let blocks = parse_ocr_blocks(&output.stdout)?;
    Ok(rebuild_text_from_blocks(&blocks))
}

fn rgba_from_clipboard_image(image: &ClipboardImageData) -> Result<RgbaImage, AppError> {
    if image.width == 0 || image.height == 0 {
        return Err(AppError::InvalidParam(
            "图片尺寸无效，无法执行 OCR".to_string(),
        ));
    }

    RgbaImage::from_raw(image.width as u32, image.height as u32, image.bytes.clone())
        .ok_or_else(|| AppError::ImageProcess("创建 OCR 原图缓冲区失败".to_string()))
}

fn clipboard_image_from_rgba(image: &RgbaImage) -> ClipboardImageData {
    ClipboardImageData {
        width: image.width() as usize,
        height: image.height() as usize,
        bytes: image.as_raw().clone(),
    }
}

fn upscale_for_ocr(image: &RgbaImage) -> RgbaImage {
    let target_scale = if image.height() >= MIN_OCR_TARGET_HEIGHT_PX {
        1
    } else {
        MIN_OCR_TARGET_HEIGHT_PX.div_ceil(image.height())
    }
    .clamp(1, MAX_OCR_UPSCALE_FACTOR);

    if target_scale <= 1 {
        return image.clone();
    }

    let target_width = image.width().saturating_mul(target_scale);
    let target_height = image.height().saturating_mul(target_scale);
    imageops::resize(image, target_width, target_height, FilterType::Lanczos3)
}

fn build_contrast_grayscale(image: &RgbaImage) -> GrayImage {
    let mut grayscale = DynamicImage::ImageRgba8(image.clone()).into_luma8();
    contrast_in_place(&mut grayscale, 45.0);
    grayscale
}

fn build_binary_image(image: &GrayImage) -> GrayImage {
    let threshold = dynamic_threshold(image);
    let mut binary = GrayImage::new(image.width(), image.height());

    for (x, y, pixel) in image.enumerate_pixels() {
        let level = if pixel[0] >= threshold { 255 } else { 0 };
        binary.put_pixel(x, y, image::Luma([level]));
    }

    binary
}

fn dynamic_threshold(image: &GrayImage) -> u8 {
    let mut total = 0u64;
    let mut count = 0u64;
    for pixel in image.pixels() {
        total += pixel[0] as u64;
        count += 1;
    }

    if count == 0 {
        return 160;
    }

    let average = (total / count) as i32;
    (average + 24).clamp(96, 192) as u8
}

fn parse_ocr_blocks(stdout: &[u8]) -> Result<Vec<OcrJsonBlock>, AppError> {
    serde_json::from_slice(stdout)
        .map_err(|error| AppError::Internal(format!("解析 OCR 结果失败：{error}")))
}

fn rebuild_text_from_blocks(blocks: &[OcrJsonBlock]) -> String {
    let mut ordered_blocks = blocks
        .iter()
        .filter_map(|block| {
            let normalized_text = normalize_segment_text(&block.text);
            if normalized_text.is_empty() {
                return None;
            }

            Some(OcrJsonBlock {
                text: normalized_text,
                position: block.position.clone(),
            })
        })
        .collect::<Vec<_>>();

    ordered_blocks.sort_by_key(|block| (block.position.top, block.position.left));

    let mut lines = Vec::<OcrLine>::new();
    for block in ordered_blocks {
        if let Some(line) = lines.last_mut() {
            if belongs_to_same_line(line, &block) {
                line.push(block);
                continue;
            }
        }

        lines.push(OcrLine::new(block));
    }

    lines
        .into_iter()
        .map(|mut line| {
            line.segments
                .sort_by_key(|segment| (segment.position.left, segment.position.top));
            rebuild_single_line(&line.segments)
        })
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn normalize_segment_text(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn belongs_to_same_line(line: &OcrLine, block: &OcrJsonBlock) -> bool {
    let block_top = block.position.top;
    let block_bottom = block.position.top + block.position.height;
    let overlap = (line.bottom.min(block_bottom) - line.top.max(block_top)).max(0) as f64;
    let min_height = line
        .average_height()
        .min(block.position.height.max(1) as f64)
        .max(1.0);
    let overlap_ratio = overlap / min_height;
    let block_center_y = (block.position.top + block.position.height / 2) as f64;
    let center_distance = (line.average_center_y() - block_center_y).abs();
    overlap_ratio >= 0.3
        || center_distance <= line.average_height().max(block.position.height as f64) * 0.6
}

fn rebuild_single_line(segments: &[OcrJsonBlock]) -> String {
    let mut line = String::new();

    for (index, segment) in segments.iter().enumerate() {
        if index > 0 {
            let previous = &segments[index - 1];
            if should_insert_space(previous, segment) {
                line.push(' ');
            }
        }
        line.push_str(&segment.text);
    }

    line.trim().to_string()
}

fn should_insert_space(previous: &OcrJsonBlock, current: &OcrJsonBlock) -> bool {
    let gap = current.position.left - (previous.position.left + previous.position.width);
    if gap <= 0 {
        return false;
    }

    let previous_last = previous.text.chars().last();
    let current_first = current.text.chars().next();
    let Some(previous_last) = previous_last else {
        return false;
    };
    let Some(current_first) = current_first else {
        return false;
    };

    if is_cjk(previous_last) || is_cjk(current_first) {
        return false;
    }

    gap as f64 >= previous.position.height.max(current.position.height) as f64 * 0.35
}

fn is_cjk(ch: char) -> bool {
    matches!(
        ch,
        '\u{3400}'..='\u{4DBF}'
            | '\u{4E00}'..='\u{9FFF}'
            | '\u{F900}'..='\u{FAFF}'
            | '\u{3040}'..='\u{30FF}'
            | '\u{AC00}'..='\u{D7AF}'
    )
}

fn next_temp_input_suffix() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default();
    let counter = COUNTER.fetch_add(1, Ordering::SeqCst);
    format!("{}-{}-{}", std::process::id(), timestamp, counter)
}

fn extract_embedded_sidecar(
    app_handle: &AppHandle,
    sidecar: &EmbeddedOcrSidecar,
) -> Result<PathBuf, AppError> {
    let app_local_data_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|error| AppError::FileAccess(format!("解析 OCR 缓存目录失败：{error}")))?;
    let sidecar_dir = app_local_data_dir.join("ocr-sidecar");
    fs::create_dir_all(&sidecar_dir).map_err(|error| {
        AppError::FileAccess(format!(
            "创建 OCR 缓存目录 `{}` 失败：{error}",
            sidecar_dir.display()
        ))
    })?;

    let executable_path = sidecar_dir.join(sidecar.file_name);
    let needs_refresh = match fs::read(&executable_path) {
        Ok(current) => sha256_hex(&current) != sidecar.sha256,
        Err(_) => true,
    };

    if needs_refresh {
        fs::write(&executable_path, sidecar.bytes).map_err(|error| {
            AppError::FileAccess(format!(
                "写入 OCR 可执行文件 `{}` 失败：{error}",
                executable_path.display()
            ))
        })?;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        fs::set_permissions(&executable_path, fs::Permissions::from_mode(0o755)).map_err(
            |error| {
                AppError::FileAccess(format!(
                    "设置 OCR 可执行权限 `{}` 失败：{error}",
                    executable_path.display()
                ))
            },
        )?;
    }

    Ok(executable_path)
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};

    let digest = Sha256::digest(bytes);
    let mut output = String::with_capacity(digest.len() * 2);
    for byte in digest {
        output.push_str(&format!("{byte:02x}"));
    }
    output
}

#[cfg(test)]
mod tests {
    use super::{rebuild_text_from_blocks, OcrJsonBlock, OcrPosition};

    #[test]
    fn rebuild_text_from_blocks_only_breaks_when_position_moves_to_new_line() {
        let blocks = vec![
            OcrJsonBlock {
                text: "第一段".to_string(),
                position: OcrPosition {
                    left: 10,
                    top: 10,
                    width: 60,
                    height: 20,
                },
            },
            OcrJsonBlock {
                text: "继续".to_string(),
                position: OcrPosition {
                    left: 90,
                    top: 12,
                    width: 40,
                    height: 20,
                },
            },
            OcrJsonBlock {
                text: "第二行".to_string(),
                position: OcrPosition {
                    left: 12,
                    top: 52,
                    width: 70,
                    height: 20,
                },
            },
        ];

        assert_eq!(rebuild_text_from_blocks(&blocks), "第一段继续\n第二行");
    }

    #[test]
    fn rebuild_text_from_blocks_inserts_space_for_separated_ascii_words() {
        let blocks = vec![
            OcrJsonBlock {
                text: "Hello".to_string(),
                position: OcrPosition {
                    left: 10,
                    top: 10,
                    width: 60,
                    height: 24,
                },
            },
            OcrJsonBlock {
                text: "world".to_string(),
                position: OcrPosition {
                    left: 90,
                    top: 11,
                    width: 70,
                    height: 24,
                },
            },
        ];

        assert_eq!(rebuild_text_from_blocks(&blocks), "Hello world");
    }

    #[test]
    fn rebuild_text_from_blocks_ignores_empty_and_whitespace_only_segments() {
        let blocks = vec![
            OcrJsonBlock {
                text: "  ".to_string(),
                position: OcrPosition {
                    left: 10,
                    top: 10,
                    width: 20,
                    height: 20,
                },
            },
            OcrJsonBlock {
                text: "A\nB".to_string(),
                position: OcrPosition {
                    left: 30,
                    top: 10,
                    width: 50,
                    height: 20,
                },
            },
        ];

        assert_eq!(rebuild_text_from_blocks(&blocks), "A B");
    }
}
