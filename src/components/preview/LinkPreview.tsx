import { useMemo, useState } from "react";

import { openUrl } from "@tauri-apps/plugin-opener";

import type { ClipboardRecordDetail } from "../../types/clipboard";

interface LinkPreviewProps {
  detail: ClipboardRecordDetail;
}

const resolveHost = (url: string): string => {
  try {
    return new URL(url).host || "未知站点";
  } catch {
    return "未知站点";
  }
};

const isEmbeddableUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const supportsInlineFrame = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    return (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "0.0.0.0"
    );
  } catch {
    return false;
  }
};

export const LinkPreview = ({ detail }: LinkPreviewProps) => {
  const linkDetail = detail.link_detail;
  const url = linkDetail?.url ?? detail.primary_uri ?? detail.preview_text;
  const title = linkDetail?.title ?? detail.preview_text;
  const siteName = linkDetail?.site_name ?? resolveHost(url);
  const canEmbed = isEmbeddableUrl(url);
  const canInlineFrame = supportsInlineFrame(url);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const compactTitle = useMemo(() => {
    const normalized = title.trim();
    if (normalized.length <= 0) {
      return "网页预览";
    }

    return normalized;
  }, [title]);
  const displayTitle = useMemo(() => {
    if (compactTitle === url.trim()) {
      return siteName;
    }

    return compactTitle;
  }, [compactTitle, siteName, url]);
  const description = linkDetail?.description?.trim() || null;
  const contentText = linkDetail?.content_text?.trim() || null;
  const coverImage = linkDetail?.cover_image ?? null;

  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-hidden px-5 py-5">
      <div className="flex h-full min-h-0 flex-col gap-4">
        <header className="rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex items-center gap-2">
            <span
              className="shrink-0 rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-[11px] text-slate-200"
              data-testid="preview-link-site-name"
              title={displayTitle}
            >
              {siteName}
            </span>
            <div
              className="min-w-0 flex-1 truncate rounded-[14px] border border-white/8 bg-black/20 px-3 py-2 text-sm text-slate-300"
              data-testid="preview-link-url"
              title={url}
            >
              {url}
            </div>
            <button
              className="shrink-0 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100 transition hover:bg-cyan-400/20"
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
          </div>

          {openError ? <div className="mt-2 text-sm text-rose-200">{openError}</div> : null}
        </header>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-[28px] border border-white/10 bg-[#030712] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          {canEmbed && canInlineFrame ? (
            <>
              <iframe
                className="h-full w-full bg-white"
                data-testid="preview-link-frame"
                onLoad={() => {
                  setFrameLoaded(true);
                }}
                referrerPolicy="no-referrer"
                src={url}
                title={compactTitle}
              />
              {!frameLoaded ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/72 text-sm text-slate-300">
                  正在加载网页内容...
                </div>
              ) : null}
            </>
          ) : (
            <div
              className="flex h-full min-h-[260px] flex-col overflow-y-auto px-6 py-6"
              data-testid="preview-link-summary"
            >
              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-200/80">
                  网页摘要
                </div>
                <h2
                  className="mt-3 text-xl font-semibold leading-8 text-slate-50"
                  data-testid="preview-link-title"
                >
                  {displayTitle}
                </h2>
                <div className="mt-2 text-sm leading-6 text-slate-400">
                  {canEmbed
                    ? "打包版对外部站点的 iframe 兼容性不稳定，默认展示网页摘要以避免黑屏；本地调试网址仍保留内嵌预览。"
                    : "当前链接不是可直接嵌入的 HTTP / HTTPS 页面，已回退为摘要预览。"}
                </div>

                {description ? (
                  <p
                    className="mt-4 rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm leading-6 text-slate-300"
                    data-testid="preview-link-description"
                  >
                    {description}
                  </p>
                ) : null}

                {coverImage ? (
                  <img
                    alt={displayTitle}
                    className="mt-4 max-h-[220px] w-full rounded-[20px] object-cover"
                    src={coverImage}
                  />
                ) : null}

                {contentText ? (
                  <div className="mt-4 rounded-[20px] border border-white/8 bg-black/20 px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      提取内容
                    </div>
                    <p
                      className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300"
                      data-testid="preview-link-content-text"
                    >
                      {contentText}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
