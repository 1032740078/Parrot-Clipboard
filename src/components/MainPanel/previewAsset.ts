import { convertFileSrc } from "@tauri-apps/api/core";

export const toPreviewSrc = (path?: string | null): string | null => {
  if (!path) {
    return null;
  }

  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("data:") ||
    path.startsWith("blob:") ||
    path.startsWith("asset://")
  ) {
    return path;
  }

  try {
    return convertFileSrc(path);
  } catch {
    return path;
  }
};
