use std::{
    fs,
    fs::File,
    path::{Path, PathBuf},
};

use image::{
    codecs::png::PngEncoder, imageops::FilterType, ColorType, ImageEncoder, ImageReader, RgbaImage,
};
use tauri::{AppHandle, Manager};

use crate::{
    clipboard::payload::ClipboardImageData, error::AppError,
    persistence::sqlite::ImageAssetCleanupPaths,
};

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
        })
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
        let thumbnail = image.resize(200, 200, FilterType::Triangle).into_rgba8();
        write_png_rgba(&thumbnail_path, &thumbnail)?;
        Ok(thumbnail_path.display().to_string())
    }

    pub fn load_original(&self, original_path: &str) -> Result<ClipboardImageData, AppError> {
        let image = ImageReader::open(original_path)
            .map_err(|error| {
                AppError::ClipboardRead(format!("open original image failed: {error}"))
            })?
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

    pub fn remove_assets(&self, assets: &[ImageAssetCleanupPaths]) {
        for asset in assets {
            remove_file_if_exists(Path::new(&asset.original_path));
            if let Some(thumbnail_path) = &asset.thumbnail_path {
                remove_file_if_exists(Path::new(thumbnail_path));
            }
        }
    }
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
    let encoder = PngEncoder::new(file);
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
        time::{SystemTime, UNIX_EPOCH},
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
    fn remove_assets_deletes_original_and_thumbnail_files() {
        let context = TestContext::new("remove-assets");
        let service = context.service();
        let saved = service
            .save_original("cleanup-image", &sample_image(100, 100))
            .expect("original image should be saved");
        let thumbnail_path = service
            .generate_thumbnail("cleanup-image", &saved.original_path)
            .expect("thumbnail should be generated");

        service.remove_assets(&[ImageAssetCleanupPaths {
            original_path: saved.original_path.clone(),
            thumbnail_path: Some(thumbnail_path.clone()),
        }]);

        assert!(!PathBuf::from(saved.original_path).exists());
        assert!(!PathBuf::from(thumbnail_path).exists());
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
            ImageStorageService::initialize_at(
                self.root_dir.join("original"),
                self.root_dir.join("thumbs"),
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
}
