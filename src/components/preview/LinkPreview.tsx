import { useMemo, useState } from "react";

import { openUrl } from "@tauri-apps/plugin-opener";

import type { ClipboardRecordDetail, PreviewStatus } from "../../types/clipboard";
import { toPreviewSrc } from "../MainPanel/previewAsset";

interface LinkPreviewProps {
  detail: ClipboardRecordDetail;
}

const formatPreviewStatus = (previewStatus: PreviewStatus): string => {
  switch (previewStatus) {
    case "ready":
      return "已抓取";
    case "pending":
      return "准备中";
    case "unsupported":
      return "暂不支持";
    case "failed":
      return "抓取失败";
  }
};

const buildFallbackMessage = (
  previewStatus: PreviewStatus,
  previewErrorMessage?: string | null
): string => {
  if (previewErrorMessage) {
    return previewErrorMessage;
  }

  switch (previewStatus) {
    case "pending":
      return "正在抓取链接标题与摘要，请稍候。";
    case "unsupported":
      return "当前链接目标暂不支持内容级摘要预览。";
    case "failed":
      return "链接抓取失败，仍可直接在浏览器中打开。";
    default:
      return "暂时无法显示链接详情。";
  }
};

const formatFetchedAt = (timestamp?: number | null): string => {
  if (!timestamp) {
    return "未记录";
  }

  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
};

export const LinkPreview = ({ detail }: LinkPreviewProps) => {
  const previewStatus = detail.preview_status ?? "pending";
  const linkDetail = detail.link_detail;
  const url = linkDetail?.url ?? detail.primary_uri ?? detail.preview_text;
  const title = linkDetail?.title ?? detail.preview_text;
  const siteName = linkDetail?.site_name ?? "未知站点";
  const description = linkDetail?.description ?? "";
  const contentText = linkDetail?.content_text ?? "";
  const coverImageSrc = useMemo(
    () => toPreviewSrc(linkDetail?.cover_image ?? null),
    [linkDetail?.cover_image]
  );
  const fallbackMessage = buildFallbackMessage(previewStatus, detail.preview_error_message);
  const [openError, setOpenError] = useState<string | null>(null);

  const hasRichSummary =
    previewStatus === "ready" &&
    (Boolean(description) ||
      Boolean(contentText) ||
      Boolean(coverImageSrc) ||
      Boolean(linkDetail?.title));

  return (
    <section className="flex h-full w-full flex-col gap-6 overflow-y-auto px-8 py-8">
      <header className="rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-5">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-200/80">
          链接预览
        </div>
        <h2 className="mt-3 break-all text-2xl font-semibold text-slate-50">{title}</h2>
        <div className="mt-3 text-sm text-slate-400" data-testid="preview-link-url">
          {url}
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-300">
          <span
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1"
            data-testid="preview-link-site-name"
          >
            {siteName}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            {formatPreviewStatus(previewStatus)}
          </span>
        </div>
      </header>

      <div className="rounded-[28px] border border-white/10 bg-[#020617] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        {hasRichSummary ? (
          <div className="space-y-5">
            {coverImageSrc ? (
              <img
                alt={title}
                className="max-h-[320px] w-full rounded-[24px] border border-white/10 object-cover"
                data-testid="preview-link-cover-image"
                src={coverImageSrc}
              />
            ) : null}

            {description ? (
              <section
                className="rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-5 text-sm leading-7 text-slate-100"
                data-testid="preview-link-description"
              >
                {description}
              </section>
            ) : null}

            {contentText ? (
              <section
                className="rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-5 text-sm leading-7 text-slate-300 whitespace-pre-wrap"
                data-testid="preview-link-content-text"
              >
                {contentText}
              </section>
            ) : null}
          </div>
        ) : (
          <div
            className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 text-center"
            data-testid="preview-link-fallback"
          >
            <div className="text-base font-medium text-slate-100">
              {previewStatus === "pending" ? "链接预览准备中" : "暂时无法显示链接摘要"}
            </div>
            <div className="max-w-xl text-sm leading-6 text-slate-400">{fallbackMessage}</div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-400/20"
          data-testid="preview-link-open-button"
          onClick={() => {
            void openUrl(url)
              .then(() => {
                setOpenError(null);
              })
              .catch((error) => {
                setOpenError(error instanceof Error ? error.message : "打开浏览器失败");
              });
          }}
          type="button"
        >
          在默认浏览器打开
        </button>
        {openError ? <div className="text-sm text-rose-200">{openError}</div> : null}
      </div>

      <dl className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-5 text-sm text-slate-300">
        <div>
          <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">抓取时间</dt>
          <dd className="mt-2 text-slate-100" data-testid="preview-link-fetched-at">
            {formatFetchedAt(linkDetail?.fetched_at ?? null)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">原始 URL</dt>
          <dd className="mt-2 break-all text-slate-100">{url}</dd>
        </div>
      </dl>
    </section>
  );
};
