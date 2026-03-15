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

export const LinkPreview = ({ detail }: LinkPreviewProps) => {
  const linkDetail = detail.link_detail;
  const url = linkDetail?.url ?? detail.primary_uri ?? detail.preview_text;
  const title = linkDetail?.title ?? detail.preview_text;
  const siteName = linkDetail?.site_name ?? resolveHost(url);
  const canEmbed = isEmbeddableUrl(url);
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

  return (
    <section className="flex h-full w-full flex-col overflow-hidden px-5 py-5">
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
          {canEmbed ? (
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
              className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 px-6 text-center"
              data-testid="preview-link-fallback"
            >
              <div className="text-base font-medium text-slate-100">当前网址无法直接嵌入预览</div>
              <div className="max-w-xl text-sm leading-6 text-slate-400">
                仅支持在预览窗口内直接打开 HTTP / HTTPS 页面，你仍可以使用上方按钮在默认浏览器中打开。
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
