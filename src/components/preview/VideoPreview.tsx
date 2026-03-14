import { useMemo, useState } from "react";

import type { ClipboardRecordDetail } from "../../types/clipboard";
import { toPreviewSrc } from "../MainPanel/previewAsset";

interface VideoPreviewProps {
  detail: ClipboardRecordDetail;
}

const formatDuration = (durationMs?: number | null): string => {
  if (!durationMs || durationMs <= 0) {
    return "未知时长";
  }

  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

const formatResolution = (width?: number | null, height?: number | null): string => {
  if (!width || !height || width <= 0 || height <= 0) {
    return "分辨率未知";
  }

  return `${width} × ${height}`;
};

const buildFallbackMessage = (
  previewStatus: string,
  previewErrorMessage?: string | null,
  playbackError?: string | null,
  hasSource = true
): string => {
  if (previewErrorMessage) {
    return previewErrorMessage;
  }

  if (!hasSource) {
    return "找不到可播放的视频源文件。";
  }

  if (playbackError) {
    return playbackError;
  }

  switch (previewStatus) {
    case "pending":
      return "正在准备视频预览，请稍候。";
    case "unsupported":
      return "当前视频格式暂不支持直接预览。";
    case "failed":
      return "视频预览准备失败，请稍后重试。";
    default:
      return "无法预览当前视频。";
  }
};

export const VideoPreview = ({ detail }: VideoPreviewProps) => {
  const previewStatus = detail.preview_status ?? "pending";
  const sourcePath =
    detail.video_detail?.src ?? detail.primary_uri ?? detail.files_detail?.items[0]?.path ?? null;
  const playerSrc = useMemo(() => toPreviewSrc(sourcePath), [sourcePath]);
  const posterSrc = useMemo(
    () => toPreviewSrc(detail.video_detail?.poster_path ?? null),
    [detail.video_detail?.poster_path]
  );
  const [resolvedDurationMs, setResolvedDurationMs] = useState<number | null>(
    detail.video_detail?.duration_ms ?? null
  );
  const [resolvedResolution, setResolvedResolution] = useState<{
    width: number | null;
    height: number | null;
  }>({
    width: detail.video_detail?.pixel_width ?? null,
    height: detail.video_detail?.pixel_height ?? null,
  });
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const fileName = detail.files_meta?.primary_name ?? detail.preview_text;
  const mimeType = detail.video_detail?.mime_type ?? "video/*";
  const durationLabel = formatDuration(resolvedDurationMs ?? detail.video_detail?.duration_ms);
  const resolutionLabel = formatResolution(
    resolvedResolution.width ?? detail.video_detail?.pixel_width,
    resolvedResolution.height ?? detail.video_detail?.pixel_height
  );
  const sourcePathLabel = detail.files_detail?.items[0]?.path ?? sourcePath ?? "路径未知";
  const canPlay = previewStatus === "ready" && Boolean(playerSrc) && !playbackError;
  const fallbackMessage = buildFallbackMessage(
    previewStatus,
    detail.preview_error_message,
    playbackError,
    Boolean(sourcePath)
  );

  return (
    <section className="flex h-full w-full flex-col gap-6 overflow-y-auto px-8 py-8">
      <header className="rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-5">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-200/80">
          视频预览
        </div>
        <h2 className="mt-3 break-all text-2xl font-semibold text-slate-50">{fileName}</h2>
        <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-300">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            {mimeType}
          </span>
          <span
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1"
            data-testid="preview-video-duration"
          >
            {durationLabel}
          </span>
          <span
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1"
            data-testid="preview-video-resolution"
          >
            {resolutionLabel}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            {posterSrc ? "封面已就绪" : "封面待生成"}
          </span>
        </div>
      </header>

      <div className="rounded-[28px] border border-white/10 bg-[#020617] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        {canPlay ? (
          <video
            className="max-h-[62vh] w-full rounded-[24px] bg-black/90"
            controls
            data-preview-allows-space="true"
            data-testid="preview-video-player"
            onError={() => {
              setPlaybackError("视频源不可用或当前环境无法解码。");
            }}
            onLoadedMetadata={(event) => {
              const { duration, videoHeight, videoWidth } = event.currentTarget;

              if (Number.isFinite(duration) && duration > 0) {
                setResolvedDurationMs(Math.round(duration * 1000));
              }

              if (videoWidth > 0 && videoHeight > 0) {
                setResolvedResolution({
                  width: videoWidth,
                  height: videoHeight,
                });
              }
            }}
            poster={posterSrc ?? undefined}
            preload="metadata"
            src={playerSrc ?? undefined}
          >
            你的环境暂不支持视频播放器。
          </video>
        ) : (
          <div
            className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 text-center"
            data-testid="preview-video-fallback"
          >
            <div className="text-base font-medium text-slate-100">
              {previewStatus === "pending" ? "视频预览准备中" : "无法预览当前视频"}
            </div>
            <div className="max-w-xl text-sm leading-6 text-slate-400">{fallbackMessage}</div>
          </div>
        )}
      </div>

      <dl className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-5 text-sm text-slate-300">
        <div>
          <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">文件路径</dt>
          <dd className="mt-2 break-all text-slate-100" data-testid="preview-video-path">
            {sourcePathLabel}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">预览状态</dt>
          <dd className="mt-2 text-slate-100">
            {previewStatus === "ready"
              ? "可播放"
              : previewStatus === "pending"
                ? "准备中"
                : previewStatus === "unsupported"
                  ? "暂不支持"
                  : "准备失败"}
          </dd>
        </div>
      </dl>
    </section>
  );
};
