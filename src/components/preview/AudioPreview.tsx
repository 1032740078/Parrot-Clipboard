import { useMemo, useState } from "react";

import type { ClipboardRecordDetail } from "../../types/clipboard";
import type { PreviewStatus } from "../../api/types";
import { toPreviewSrc } from "../MainPanel/previewAsset";

interface AudioPreviewProps {
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

const formatByteSize = (byteSize?: number | null): string => {
  if (!byteSize || byteSize <= 0) {
    return "大小未知";
  }

  if (byteSize < 1024) {
    return `${byteSize} B`;
  }

  if (byteSize < 1024 * 1024) {
    return `${(byteSize / 1024).toFixed(1)} KB`;
  }

  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
};

const buildFallbackMessage = (
  previewStatus: PreviewStatus,
  previewErrorMessage?: string | null,
  playbackError?: string | null,
  hasSource = true
): string => {
  if (previewErrorMessage) {
    return previewErrorMessage;
  }

  if (!hasSource) {
    return "找不到可播放的音频源文件。";
  }

  if (playbackError) {
    return playbackError;
  }

  switch (previewStatus) {
    case "pending":
      return "正在准备音频预览，请稍候。";
    case "unsupported":
      return "当前音频格式暂不支持直接预览。";
    case "failed":
      return "音频预览准备失败，请稍后重试。";
    default:
      return "无法预览当前音频。";
  }
};

export const AudioPreview = ({ detail }: AudioPreviewProps) => {
  const previewStatus = detail.preview_status ?? "pending";
  const sourcePath =
    detail.audio_detail?.src ?? detail.primary_uri ?? detail.files_detail?.items[0]?.path ?? null;
  const playerSrc = useMemo(() => toPreviewSrc(sourcePath), [sourcePath]);
  const [resolvedDurationMs, setResolvedDurationMs] = useState<number | null>(
    detail.audio_detail?.duration_ms ?? null
  );
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const fileName = detail.files_meta?.primary_name ?? detail.preview_text;
  const mimeType = detail.audio_detail?.mime_type ?? "audio/*";
  const byteSizeLabel = formatByteSize(detail.audio_detail?.byte_size ?? null);
  const durationLabel = formatDuration(resolvedDurationMs ?? detail.audio_detail?.duration_ms);
  const sourcePathLabel = detail.files_detail?.items[0]?.path ?? sourcePath ?? "路径未知";
  const canPlay = previewStatus === "ready" && Boolean(playerSrc) && !playbackError;
  const fallbackMessage = buildFallbackMessage(
    previewStatus,
    detail.preview_error_message,
    playbackError,
    Boolean(sourcePath)
  );

  return (
    <section className="flex h-full w-full items-center justify-center overflow-y-auto px-6 py-6">
      <div className="w-full max-w-[760px] space-y-4">
        <header className="rounded-[24px] border border-white/10 bg-white/[0.04] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-200/80">
                音频
              </div>
              <h2 className="mt-2 truncate text-lg font-semibold text-slate-50">{fileName}</h2>
            </div>
            <div className="flex flex-wrap justify-end gap-2 text-xs text-slate-300">
              <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1">
                {mimeType}
              </span>
              <span
                className="rounded-full border border-white/10 bg-white/6 px-3 py-1"
                data-testid="preview-audio-duration"
              >
                {durationLabel}
              </span>
              <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1">
                {byteSizeLabel}
              </span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-emerald-100">
                自动播放
              </span>
            </div>
          </div>
        </header>

        <div className="rounded-[26px] border border-white/10 bg-[#07101f]/95 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        {canPlay ? (
          <audio
            autoPlay
            className="w-full"
            controls
            data-preview-allows-space="true"
            data-testid="preview-audio-player"
            onError={() => {
              setPlaybackError("音频源不可用或当前环境无法解码。");
            }}
            onLoadedMetadata={(event) => {
              const durationSeconds = event.currentTarget.duration;
              if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
                return;
              }

              setResolvedDurationMs(Math.round(durationSeconds * 1000));
            }}
            preload="auto"
            src={playerSrc ?? undefined}
          >
            你的环境暂不支持音频播放器。
          </audio>
        ) : (
          <div
            className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 text-center"
            data-testid="preview-audio-fallback"
          >
            <div className="text-base font-medium text-slate-100">
              {previewStatus === "pending" ? "音频预览准备中" : "无法预览当前音频"}
            </div>
            <div className="max-w-xl text-sm leading-6 text-slate-400">{fallbackMessage}</div>
          </div>
        )}
        </div>

        <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-3 text-xs text-slate-400">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="uppercase tracking-[0.18em] text-slate-500">文件路径</div>
              <div className="mt-1 break-all text-slate-200" data-testid="preview-audio-path">
                {sourcePathLabel}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="uppercase tracking-[0.18em] text-slate-500">状态</div>
              <div className="mt-1 text-slate-200">
                {previewStatus === "ready"
                  ? "可播放"
                  : previewStatus === "pending"
                    ? "准备中"
                    : previewStatus === "unsupported"
                      ? "暂不支持"
                      : "准备失败"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
