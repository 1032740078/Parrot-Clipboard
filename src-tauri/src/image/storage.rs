use std::{
    collections::{HashMap, VecDeque},
    fs,
    fs::File,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use image::{
    codecs::png::{CompressionType, FilterType as PngFilterType, PngEncoder},
    ColorType, ImageEncoder, ImageReader, RgbaImage,
};
use tauri::{AppHandle, Manager};

use crate::{
    clipboard::payload::ClipboardImageData, error::AppError,
    persistence::sqlite::ImageAssetCleanupPaths,
};

const DEFAULT_ORIGINAL_CACHE_MAX_ENTRIES: usize = 32;
const DEFAULT_ORIGINAL_CACHE_MAX_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct SavedImageAsset {
    pub original_path: String,
    pub mime_type: String,
    pub pixel_width: i64,
    pub pixel_height: i64,
    pub byte_size: i64,
}

#[derive(Debug, Clone)]
pub struct ImageStorageService {
    original_dir: PathBuf,
    thumbnail_dir: PathBuf,
    original_cache: Arc<Mutex<OriginalImageCache>>,
}

#[derive(Debug)]
struct OriginalImageCache {
    entries: HashMap<String, CachedOriginalImage>,
    usage_order: VecDeque<String>,
    current_bytes: usize,
    max_entries: usize,
    max_bytes: usize,
}

#[derive(Debug, Clone)]
struct CachedOriginalImage {
    image: ClipboardImageData,
    byte_size: usize,
}

impl OriginalImageCache {
    fn new(max_entries: usize, max_bytes: usize) -> Self {
        Self {
            entries: HashMap::new(),
            usage_order: VecDeque::new(),
            current_bytes: 0,
            max_entries: max_entries.max(1),
            max_bytes: max_bytes.max(1),
        }
    }

    fn get(&mut self, original_path: &str) -> Option<ClipboardImageData> {
        let image = self.entries.get(original_path)?.image.clone();
        self.mark_recently_used(original_path);
        Some(image)
    }

    fn insert(&mut self, original_path: String, image: ClipboardImageData) {
        let byte_size = image.bytes.len();
        self.remove(&original_path);
        self.current_bytes = self.current_bytes.saturating_add(byte_size);
        self.entries.insert(
            original_path.clone(),
            CachedOriginalImage { image, byte_size },
        );
        self.mark_recently_used(&original_path);
        self.evict_if_needed();
    }

    fn remove(&mut self, original_path: &str) {
        if let Some(entry) = self.entries.remove(original_path) {
            self.current_bytes = self.current_bytes.saturating_sub(entry.byte_size);
        }
        self.remove_usage_record(original_path);
    }

    fn mark_recently_used(&mut self, original_path: &str) {
        self.remove_usage_record(original_path);
        self.usage_order.push_back(original_path.to_string());
    }

    fn remove_usage_record(&mut self, original_path: &str) {
        if let Some(index) = self
            .usage_order
            .iter()
            .position(|cached_path| cached_path == original_path)
        {
            self.usage_order.remove(index);
        }
    }

    fn evict_if_needed(&mut self) {
        while !self.usage_order.is_empty()
            && (self.entries.len() > self.max_entries || self.current_bytes > self.max_bytes)
        {
            let original_path = self
                .usage_order
                .pop_front()
                .expect("image cache usage order should not be empty");
            if let Some(entry) = self.entries.remove(&original_path) {
                self.current_bytes = self.current_bytes.saturating_sub(entry.byte_size);
                tracing::debug!(
                    original_path = %original_path,
                    cache_entries = self.entries.len(),
                    cache_bytes = self.current_bytes,
                    "image original cache evicted"
                );
            }
        }
    }
}

impl ImageStorageService {
    pub fn initialize(app_handle: &AppHandle) -> Result<Self, AppError> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|error| AppError::Db(format!("resolve image app data dir failed: {error}")))?;
        Self::initialize_at(
            app_data_dir.join("images/original"),
            app_data_dir.join("images/thumbs"),
        )
    }

    pub fn initialize_at(original_dir: PathBuf, thumbnail_dir: PathBuf) -> Result<Self, AppError> {
        Self::initialize_with_cache_config(
            original_dir,
            thumbnail_dir,
            DEFAULT_ORIGINAL_CACHE_MAX_ENTRIES,
            DEFAULT_ORIGINAL_CACHE_MAX_BYTES,
        )
    }

    fn initialize_with_cache_config(
        original_dir: PathBuf,
        thumbnail_dir: PathBuf,
        cache_max_entries: usize,
        cache_max_bytes: usize,
    ) -> Result<Self, AppError> {
        fs::create_dir_all(&original_dir).map_err(|error| {
            AppError::Db(format!(
                "create image original directory `{}` failed: {error}",
                original_dir.display()
            ))
        })?;
        fs::create_dir_all(&thumbnail_dir).map_err(|error| {
            AppError::Db(format!(
                "create image thumbnail directory `{}` failed: {error}",
                thumbnail_dir.display()
            ))
        })?;

        Ok(Self {
            original_dir,
            thumbnail_dir,
            original_cache: Arc::new(Mutex::new(OriginalImageCache::new(
                cache_max_entries,
                cache_max_bytes,
            ))),
        })
    }

    pub fn original_dir(&self) -> &Path {
        &self.original_dir
    }

    pub fn thumbnail_dir(&self) -> &Path {
        &self.thumbnail_dir
    }

    pub fn save_original(
        &self,
        hash: &str,
        image: &ClipboardImageData,
    ) -> Result<SavedImageAsset, AppError> {
        let original_path = self.original_dir.join(format!("{hash}.png"));
        write_png(&original_path, image)?;
        let byte_size = fs::metadata(&original_path)
            .map_err(|error| {
                AppError::Db(format!(
                    "read image metadata `{}` failed: {error}",
                    original_path.display()
                ))
            })?
            .len() as i64;

        Ok(SavedImageAsset {
            original_path: original_path.display().to_string(),
            mime_type: "image/png".to_string(),
            pixel_width: image.width as i64,
            pixel_height: image.height as i64,
            byte_size,
        })
    }

    pub fn generate_thumbnail(&self, hash: &str, original_path: &str) -> Result<String, AppError> {
        let thumbnail_path = self.thumbnail_dir.join(format!("{hash}.png"));
        let image = ImageReader::open(original_path)
            .map_err(|error| {
                AppError::Db(format!(
                    "open original image `{original_path}` failed: {error}"
                ))
            })?
            .decode()
            .map_err(|error| {
                AppError::Db(format!(
                    "decode original image `{original_path}` failed: {error}"
                ))
            })?;
        let thumbnail = image.thumbnail(200, 200).into_rgba8();
        write_png_rgba(&thumbnail_path, &thumbnail)?;
        Ok(thumbnail_path.display().to_string())
    }

    pub fn load_original(&self, original_path: &str) -> Result<ClipboardImageData, AppError> {
        if let Some(image) = self
            .original_cache
            .lock()
            .expect("image cache lock poisoned")
            .get(original_path)
        {
            tracing::debug!(original_path = %original_path, "image original cache hit");
            return Ok(image);
        }

        let image = load_original_from_disk(original_path)?;
        self.original_cache
            .lock()
            .expect("image cache lock poisoned")
            .insert(original_path.to_string(), image.clone());
        tracing::debug!(original_path = %original_path, "image original cache miss");

        Ok(image)
    }

    pub fn remove_assets(&self, assets: &[ImageAssetCleanupPaths]) {
        {
            let mut original_cache = self
                .original_cache
                .lock()
                .expect("image cache lock poisoned");
            for asset in assets {
                original_cache.remove(&asset.original_path);
            }
        }

        for asset in assets {
            remove_file_if_exists(Path::new(&asset.original_path));
            if let Some(thumbnail_path) = &asset.thumbnail_path {
                remove_file_if_exists(Path::new(thumbnail_path));
            }
        }
    }
}

fn load_original_from_disk(original_path: &str) -> Result<ClipboardImageData, AppError> {
    let image = ImageReader::open(original_path)
        .map_err(|error| AppError::ClipboardRead(format!("open original image failed: {error}")))?
        .decode()
        .map_err(|error| {
            AppError::ClipboardRead(format!("decode original image failed: {error}"))
        })?;
    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();
    Ok(ClipboardImageData {
        width: width as usize,
        height: height as usize,
        bytes: rgba.into_raw(),
    })
}

fn write_png(path: &Path, image: &ClipboardImageData) -> Result<(), AppError> {
    let rgba = RgbaImage::from_raw(image.width as u32, image.height as u32, image.bytes.clone())
        .ok_or_else(|| AppError::Db("create rgba image buffer failed".to_string()))?;
    write_png_rgba(path, &rgba)
}

fn write_png_rgba(path: &Path, image: &RgbaImage) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            AppError::Db(format!(
                "create image directory `{}` failed: {error}",
                parent.display()
            ))
        })?;
    }

    let file = File::create(path).map_err(|error| {
        AppError::Db(format!(
            "create image file `{}` failed: {error}",
            path.display()
        ))
    })?;
    let encoder =
        PngEncoder::new_with_quality(file, CompressionType::Fast, PngFilterType::NoFilter);
    encoder
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            ColorType::Rgba8.into(),
        )
        .map_err(|error| {
            AppError::Db(format!(
                "write image file `{}` failed: {error}",
                path.display()
            ))
        })
}

fn remove_file_if_exists(path: &Path) {
    if !path.exists() {
        return;
    }

    if let Err(error) = fs::remove_file(path) {
        tracing::warn!(path = %path.display(), error = %error, "remove image asset failed");
    }
}

#[cfg(test)]
mod tests {
    use std::{
        env, fs,
        path::PathBuf,
        time::{Duration, Instant, SystemTime, UNIX_EPOCH},
    };

    use image::GenericImageView;

    use crate::{
        clipboard::payload::ClipboardImageData, persistence::sqlite::ImageAssetCleanupPaths,
    };

    use super::ImageStorageService;

    #[test]
    fn generate_thumbnail_keeps_image_within_200_bounds() {
        let context = TestContext::new("generate-thumbnail");
        let service = context.service();
        let saved = service
            .save_original("sample-image", &sample_image(400, 100))
            .expect("original image should be saved");

        let thumbnail_path = service
            .generate_thumbnail("sample-image", &saved.original_path)
            .expect("thumbnail should be generated");
        let thumbnail = image::ImageReader::open(&thumbnail_path)
            .expect("thumbnail should open")
            .decode()
            .expect("thumbnail should decode");

        assert_eq!(thumbnail.dimensions(), (200, 50));
    }

    #[test]
    fn generate_thumbnail_for_common_screenshot_stays_within_ci_budget() {
        let context = TestContext::new("generate-thumbnail-performance");
        let service = context.service();
        let saved = service
            .save_original("performance-image", &sample_screenshot_image(800, 450))
            .expect("original image should be saved");

        let started_at = Instant::now();
        let thumbnail_path = service
            .generate_thumbnail("performance-image", &saved.original_path)
            .expect("thumbnail should be generated");
        let elapsed = started_at.elapsed();

        assert!(PathBuf::from(&thumbnail_path).exists());
        let budget_ms = if std::env::var_os("CI").is_some() {
            600
        } else {
            500
        };
        assert!(
            elapsed < Duration::from_millis(budget_ms),
            "thumbnail generation took {:?}, expected < {}ms",
            elapsed,
            budget_ms
        );
    }

    #[test]
    fn load_original_uses_cached_copy_after_disk_file_removed() {
        let context = TestContext::new("load-original-cache-hit");
        let service = context.service();
        let saved = service
            .save_original("cached-image", &sample_image(64, 64))
            .expect("original image should be saved");

        let first = service
            .load_original(&saved.original_path)
            .expect("first load should decode from disk");
        fs::remove_file(&saved.original_path).expect("original image file should be removed");

        let second = service
            .load_original(&saved.original_path)
            .expect("second load should hit cache");

        assert_eq!(second, first);
    }

    #[test]
    fn load_original_evicts_least_recently_used_entry_when_budget_exceeded() {
        let context = TestContext::new("load-original-lru-eviction");
        let image = sample_image(8, 8);
        let cache_budget = image.bytes.len() * 2;
        let service = context.service_with_cache_limits(8, cache_budget);

        let first = service
            .save_original("cache-first", &image)
            .expect("first original image should be saved");
        let second = service
            .save_original("cache-second", &image)
            .expect("second original image should be saved");
        let third = service
            .save_original("cache-third", &image)
            .expect("third original image should be saved");

        service
            .load_original(&first.original_path)
            .expect("first image should load");
        service
            .load_original(&second.original_path)
            .expect("second image should load");
        service
            .load_original(&first.original_path)
            .expect("first image should become most recently used");
        service
            .load_original(&third.original_path)
            .expect("third image should trigger eviction");

        fs::remove_file(&first.original_path).expect("first image file should be removed");
        fs::remove_file(&second.original_path).expect("second image file should be removed");

        service
            .load_original(&first.original_path)
            .expect("first image should still be cached");
        assert!(
            service.load_original(&second.original_path).is_err(),
            "second image should be evicted from cache"
        );
    }

    #[test]
    fn remove_assets_deletes_original_and_thumbnail_files() {
        let context = TestContext::new("remove-assets");
        let service = context.service();
        let saved = service
            .save_original("cleanup-image", &sample_image(100, 100))
            .expect("original image should be saved");
        let thumbnail_path = service
            .generate_thumbnail("cleanup-image", &saved.original_path)
            .expect("thumbnail should be generated");
        service
            .load_original(&saved.original_path)
            .expect("original image should be cached before removal");

        service.remove_assets(&[ImageAssetCleanupPaths {
            original_path: saved.original_path.clone(),
            thumbnail_path: Some(thumbnail_path.clone()),
        }]);

        assert!(!PathBuf::from(&saved.original_path).exists());
        assert!(!PathBuf::from(&thumbnail_path).exists());
        assert!(
            service.load_original(&saved.original_path).is_err(),
            "removed image should not remain in cache"
        );
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
                "clipboard-manager-image-storage-test-{suffix}-{nanos}"
            ));
            fs::create_dir_all(&root_dir).expect("image storage test dir should be created");
            Self { root_dir }
        }

        fn service(&self) -> ImageStorageService {
            self.service_with_cache_limits(32, 64 * 1024 * 1024)
        }

        fn service_with_cache_limits(
            &self,
            cache_max_entries: usize,
            cache_max_bytes: usize,
        ) -> ImageStorageService {
            ImageStorageService::initialize_with_cache_config(
                self.root_dir.join("original"),
                self.root_dir.join("thumbs"),
                cache_max_entries,
                cache_max_bytes,
            )
            .expect("image storage should initialize")
        }
    }

    impl Drop for TestContext {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root_dir);
        }
    }

    fn sample_image(width: usize, height: usize) -> ClipboardImageData {
        let mut bytes = Vec::with_capacity(width * height * 4);
        for _ in 0..(width * height) {
            bytes.extend_from_slice(&[12, 34, 56, 255]);
        }
        ClipboardImageData {
            width,
            height,
            bytes,
        }
    }

    fn sample_screenshot_image(width: usize, height: usize) -> ClipboardImageData {
        let mut bytes = Vec::with_capacity(width * height * 4);
        let toolbar_height = (height / 12).max(48);
        let sidebar_width = width / 4;

        for y in 0..height {
            for x in 0..width {
                let (mut red, mut green, mut blue) = if y < toolbar_height {
                    (28_u8, 30_u8, 36_u8)
                } else if x < sidebar_width {
                    if (y / 40) % 2 == 0 {
                        (44_u8, 48_u8, 56_u8)
                    } else {
                        (39_u8, 43_u8, 50_u8)
                    }
                } else {
                    let card_x = ((x - sidebar_width) / 180) % 4;
                    let card_y = ((y - toolbar_height) / 140) % 3;
                    match (card_x + card_y) % 4 {
                        0 => (245_u8, 247_u8, 250_u8),
                        1 => (236_u8, 241_u8, 248_u8),
                        2 => (242_u8, 238_u8, 250_u8),
                        _ => (239_u8, 245_u8, 239_u8),
                    }
                };

                if y == toolbar_height
                    || (x > sidebar_width && (x - sidebar_width).is_multiple_of(180))
                {
                    red = red.saturating_sub(18);
                    green = green.saturating_sub(18);
                    blue = blue.saturating_sub(18);
                }

                bytes.extend_from_slice(&[red, green, blue, 255]);
            }
        }
        ClipboardImageData {
            width,
            height,
            bytes,
        }
    }
}
