use std::{
    env, fs,
    io::Write,
    path::{Path, PathBuf},
};

use sha2::{Digest, Sha256};

const OCR_RELEASE_VERSION: &str = "v1.4.2";

struct OcrSidecarAsset {
    target: &'static str,
    file_name: &'static str,
    sha256: &'static str,
}

const OCR_SIDECAR_ASSETS: &[OcrSidecarAsset] = &[
    OcrSidecarAsset {
        target: "aarch64-apple-darwin",
        file_name: "ocr-v5-macos-arm64",
        sha256: "001e095e3c4260396e927fc8e16f56644d13ecf97120ae89fa45a56da6f45971",
    },
    OcrSidecarAsset {
        target: "x86_64-apple-darwin",
        file_name: "ocr-v5-macos-amd64",
        sha256: "c780660570cb07410eb5f528b0f8985b45c84e4307f1c988cc06ddd31f72bb38",
    },
    OcrSidecarAsset {
        target: "x86_64-unknown-linux-gnu",
        file_name: "ocr-v5-linux-amd64",
        sha256: "9e33adf0e8699287e74ded50a90bb11349bee30f51b346c3d5631e58fe2f333b",
    },
    OcrSidecarAsset {
        target: "aarch64-unknown-linux-gnu",
        file_name: "ocr-v5-linux-arm64",
        sha256: "0d0429f3d69a147f46d4c9f3be82b54759986674f61c3d533b8643e3db52e754",
    },
];

fn main() {
    tauri_build::build();

    println!("cargo:rerun-if-env-changed=TARGET");

    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR should exist"));
    let generated_path = out_dir.join("embedded_ocr_sidecar.rs");
    let target = env::var("TARGET").expect("TARGET should exist");

    match resolve_sidecar_asset(&target) {
        Some(asset) => {
            let cached_dir = out_dir.join("ocr-sidecar");
            if let Err(error) = fs::create_dir_all(&cached_dir) {
                panic!(
                    "create OCR sidecar cache dir `{}` failed: {error}",
                    cached_dir.display()
                );
            }

            let cached_binary_path = cached_dir.join(asset.file_name);
            ensure_sidecar_binary(&cached_binary_path, asset);
            write_embedded_sidecar_source(&generated_path, Some((asset, &cached_binary_path)));
        }
        None => {
            write_embedded_sidecar_source(&generated_path, None);
        }
    }
}

fn resolve_sidecar_asset(target: &str) -> Option<&'static OcrSidecarAsset> {
    OCR_SIDECAR_ASSETS
        .iter()
        .find(|asset| asset.target == target)
}

fn ensure_sidecar_binary(path: &Path, asset: &OcrSidecarAsset) {
    if path.exists() {
        match fs::read(path) {
            Ok(bytes) if sha256_hex(&bytes) == asset.sha256 => return,
            Ok(_) | Err(_) => {
                let _ = fs::remove_file(path);
            }
        }
    }

    let url = format!(
        "https://github.com/zibo-chen/rust-paddle-ocr/releases/download/{}/{}",
        OCR_RELEASE_VERSION, asset.file_name
    );
    let response = reqwest::blocking::get(&url).unwrap_or_else(|error| {
        panic!("download OCR sidecar `{url}` failed: {error}");
    });
    let mut response = response.error_for_status().unwrap_or_else(|error| {
        panic!("download OCR sidecar `{url}` returned error status: {error}");
    });

    let mut bytes = Vec::new();
    response.copy_to(&mut bytes).unwrap_or_else(|error| {
        panic!("stream OCR sidecar response `{url}` failed: {error}");
    });

    let actual_sha256 = sha256_hex(&bytes);
    if actual_sha256 != asset.sha256 {
        panic!(
            "OCR sidecar `{}` sha256 mismatch: expected {}, got {}",
            asset.file_name, asset.sha256, actual_sha256
        );
    }

    let mut file = fs::File::create(path).unwrap_or_else(|error| {
        panic!(
            "create OCR sidecar cache file `{}` failed: {error}",
            path.display()
        );
    });
    file.write_all(&bytes).unwrap_or_else(|error| {
        panic!(
            "write OCR sidecar cache file `{}` failed: {error}",
            path.display()
        );
    });

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let permissions = fs::Permissions::from_mode(0o755);
        fs::set_permissions(path, permissions).unwrap_or_else(|error| {
            panic!(
                "set executable permission for OCR sidecar `{}` failed: {error}",
                path.display()
            );
        });
    }
}

fn write_embedded_sidecar_source(
    generated_path: &Path,
    embedded: Option<(&OcrSidecarAsset, &Path)>,
) {
    let source = match embedded {
        Some((asset, path)) => {
            let path_literal = path.display().to_string().replace('\\', "\\\\");
            format!(
            concat!(
                "pub struct EmbeddedOcrSidecar {{\n",
                "    pub file_name: &'static str,\n",
                "    pub sha256: &'static str,\n",
                "    pub bytes: &'static [u8],\n",
                "}}\n\n",
                "pub const EMBEDDED_OCR_SIDECAR: Option<EmbeddedOcrSidecar> = Some(EmbeddedOcrSidecar {{\n",
                "    file_name: {file_name:?},\n",
                "    sha256: {sha256:?},\n",
                "    bytes: include_bytes!(r#\"{path_literal}\"#),\n",
                "}});\n"
            ),
            file_name = asset.file_name,
            sha256 = asset.sha256,
            path_literal = path_literal,
        )
        }
        None => concat!(
            "pub struct EmbeddedOcrSidecar {\n",
            "    pub file_name: &'static str,\n",
            "    pub sha256: &'static str,\n",
            "    pub bytes: &'static [u8],\n",
            "}\n\n",
            "pub const EMBEDDED_OCR_SIDECAR: Option<EmbeddedOcrSidecar> = None;\n"
        )
        .to_string(),
    };

    fs::write(generated_path, source).unwrap_or_else(|error| {
        panic!(
            "write generated OCR sidecar source `{}` failed: {error}",
            generated_path.display()
        );
    });
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut output = String::with_capacity(digest.len() * 2);
    for byte in digest {
        output.push_str(&format!("{byte:02x}"));
    }
    output
}
