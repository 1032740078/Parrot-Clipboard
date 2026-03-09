import { convertFileSrc } from "@tauri-apps/api/core";

export const toPreviewSrc = (path?: string | null): string | null => {
  if (!path) {
    return null;
  }

  try {
    return convertFileSrc(path);
  } catch {
    return path;
  }
};
