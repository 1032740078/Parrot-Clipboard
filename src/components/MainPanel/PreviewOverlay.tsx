import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";

import { usePreviewOverlay } from "../../hooks/usePreviewOverlay";
import { isFileRecord, isImageRecord, isTextRecord } from "../../types/clipboard";
import { prefersReducedMotion } from "./motion";
import { toPreviewSrc } from "./previewAsset";
import { formatRelativeTime } from "./time";

const overlayMotion = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.16 } },
  exit: { opacity: 0, transition: { duration: 0.12 } },
} as const;

const cardMotion = {
  hidden: { opacity: 0, scale: 0.97, y: 16 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: 8,
    transition: { duration: 0.12, ease: [0.4, 0, 1, 1] },
  },
} as const;

const contentTypeLabelMap = {
  text: "文本",
  image: "图片",
  files: "文件",
} as const;

export const PreviewOverlay = () => {
  const { previewOverlay, record, detail, errorMessage, closePreview } = usePreviewOverlay();
  const reducedMotion = prefersReducedMotion();
  const [brokenImageRecordId, setBrokenImageRecordId] = useState<number | null>(null);

  const imageSrc = useMemo(() => {
    if (!record || !isImageRecord(record)) {
      return null;
    }

    return toPreviewSrc(detail?.image_detail?.original_path ?? record.image_meta?.thumbnail_path ?? null);
  }, [detail?.image_detail?.original_path, record]);

  if (!previewOverlay || !record) {
    return null;
  }

  const imageBroken = brokenImageRecordId === previewOverlay.recordId;

  const overlayVariants = reducedMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0.01 } },
        exit: { opacity: 0, transition: { duration: 0.01 } },
      }
    : overlayMotion;

  const cardVariants = reducedMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0.01 } },
        exit: { opacity: 0, transition: { duration: 0.01 } },
      }
    : cardMotion;

  const title = record.preview_text;
  const typeLabel = contentTypeLabelMap[record.content_type];
  const sourceApp = record.source_app ?? "未知来源";

  return (
    <AnimatePresence>
      <motion.div
        animate="visible"
        className="fixed inset-0 z-[65] flex items-center justify-center px-6 py-10"
        data-testid="preview-overlay"
        exit="exit"
        initial="hidden"
        key={`preview-${previewOverlay.recordId}`}
        variants={overlayVariants}
      >
        <button
          aria-label="关闭预览"
          className="absolute inset-0 cursor-default bg-slate-950/48 backdrop-blur-[2px]"
          data-testid="preview-overlay-mask"
          onClick={() => {
            closePreview("click_mask");
          }}
          type="button"
        />

        <motion.section
          aria-modal="true"
          className="glass-floating-surface relative z-[66] flex w-full max-w-4xl flex-col overflow-hidden rounded-[28px] backdrop-blur-2xl"
          data-testid="preview-overlay-card"
          onClick={(event) => {
            event.stopPropagation();
          }}
          role="dialog"
          variants={cardVariants}
        >
          <header className="border-b border-white/10 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-medium tracking-[0.2em] text-cyan-200/80">
                  {typeLabel}预览
                </div>
                <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
                  <span>来源：{sourceApp}</span>
                  <span>{formatRelativeTime(record.created_at)}</span>
                </div>
              </div>
              <div className="text-right text-xs text-slate-400">
                <div>空格 / Esc / 点击遮罩关闭</div>
                <div className="mt-1 text-slate-500">已从列表摘要切换到完整内容确认</div>
              </div>
            </div>
          </header>

          <div className="max-h-[68vh] min-h-[320px] overflow-y-auto px-6 py-6">
            {previewOverlay.status === "loading" ? (
              <div
                className="flex min-h-[260px] items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/5 text-sm text-slate-300"
                data-testid="preview-overlay-loading"
              >
                正在加载完整内容…
              </div>
            ) : null}

            {previewOverlay.status === "error" ? (
              <div
                className="flex min-h-[260px] flex-col items-center justify-center rounded-3xl border border-rose-400/25 bg-rose-500/10 px-6 text-center"
                data-testid="preview-overlay-error"
              >
                <div className="text-base font-medium text-rose-100">预览内容加载失败</div>
                <div className="mt-2 text-sm text-rose-100/80">
                  {errorMessage ?? "请稍后重试"}
                </div>
              </div>
            ) : null}

            {previewOverlay.status === "ready" && isTextRecord(record) ? (
              <div
                className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-[15px] leading-7 text-slate-100 whitespace-pre-wrap break-words"
                data-testid="preview-overlay-text-content"
              >
                {detail?.text_content ?? record.text_content ?? record.preview_text}
              </div>
            ) : null}

            {previewOverlay.status === "ready" && isImageRecord(record) ? (
              <div
                className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/90"
                data-testid="preview-overlay-image-content"
              >
                {imageSrc && !imageBroken ? (
                  <img
                    alt={title}
                    className="max-h-[60vh] w-full object-contain"
                    data-testid="preview-overlay-image"
                    onError={() => {
                      setBrokenImageRecordId(previewOverlay.recordId);
                    }}
                    src={imageSrc}
                  />
                ) : (
                  <div
                    className="flex min-h-[320px] flex-col items-center justify-center gap-2 text-sm text-slate-300"
                    data-testid="preview-overlay-image-placeholder"
                  >
                    <span className="text-3xl">🖼️</span>
                    <span>预览不可用</span>
                  </div>
                )}

                <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 px-5 py-4 text-sm text-slate-300">
                  <span>{detail?.image_detail?.mime_type ?? record.image_meta?.mime_type ?? "image/*"}</span>
                  <span>
                    {(detail?.image_detail?.pixel_width ?? record.image_meta?.pixel_width ?? 0).toString()}
                    ×
                    {(detail?.image_detail?.pixel_height ?? record.image_meta?.pixel_height ?? 0).toString()}
                  </span>
                  {detail?.image_detail?.byte_size ? <span>{detail.image_detail.byte_size} bytes</span> : null}
                </div>
              </div>
            ) : null}

            {previewOverlay.status === "ready" && isFileRecord(record) ? (
              <div
                className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]"
                data-testid="preview-overlay-file-content"
              >
                <div className="border-b border-white/10 px-5 py-4 text-sm text-slate-300">
                  共 {detail?.files_detail?.items.length ?? record.files_meta?.count ?? 0} 项
                </div>
                <ul className="divide-y divide-white/8" data-testid="preview-overlay-file-list">
                  {(detail?.files_detail?.items ?? []).map((item) => (
                    <li className="px-5 py-4" data-testid="preview-overlay-file-item" key={item.path}>
                      <div className="text-sm font-medium text-white">{item.display_name}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.path}</div>
                    </li>
                  ))}
                  {detail?.files_detail?.items.length ? null : (
                    <li className="px-5 py-6 text-sm text-slate-300">暂无可展示的文件明细</li>
                  )}
                </ul>
              </div>
            ) : null}
          </div>
        </motion.section>
      </motion.div>
    </AnimatePresence>
  );
};
