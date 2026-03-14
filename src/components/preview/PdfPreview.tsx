import { useMemo } from "react";

import type { ClipboardRecordDetail } from "../../types/clipboard";
import { toPreviewSrc } from "../MainPanel/previewAsset";

interface PdfPreviewProps {
  detail: ClipboardRecordDetail;
}

const formatPageCount = (pageCount?: number | null): string => {
  if (!pageCount || pageCount <= 0) {
    return "页数未知";
  }

  return `共 ${pageCount} 页`;
};

const buildFallbackMessage = (
  previewStatus: string,
  previewErrorMessage?: string | null,
  hasSource = true
): string => {
  if (previewErrorMessage) {
    return previewErrorMessage;
  }

  if (!hasSource) {
    return "找不到可用于预览的 PDF 文件。";
  }

  switch (previewStatus) {
    case "pending":
      return "正在准备 PDF 预览，请稍候。";
    case "unsupported":
      return "当前环境暂不支持直接显示 PDF。";
    case "failed":
      return "PDF 预览准备失败，请稍后重试。";
    default:
      return "无法预览当前 PDF。";
  }
};

export const PdfPreview = ({ detail }: PdfPreviewProps) => {
  const sourcePath =
    detail.primary_uri ?? detail.files_detail?.items[0]?.path ?? detail.document_detail?.html_path ?? null;
  const pdfSrc = useMemo(() => toPreviewSrc(sourcePath), [sourcePath]);
  const previewStatus =
    detail.preview_status ?? (pdfSrc && detail.document_detail?.document_kind === "pdf" ? "ready" : "pending");
  const fileName = detail.files_meta?.primary_name ?? detail.preview_text;
  const pageCountLabel = formatPageCount(detail.document_detail?.page_count ?? null);
  const canRender = Boolean(pdfSrc) && (previewStatus === "ready" || previewStatus === "pending");
  const fallbackMessage = buildFallbackMessage(
    previewStatus,
    detail.preview_error_message,
    Boolean(sourcePath)
  );

  return (
    <section className="flex h-full w-full flex-col gap-6 overflow-y-auto px-8 py-8">
      <header className="rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-5">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-200/80">
          PDF 预览
        </div>
        <h2 className="mt-3 break-all text-2xl font-semibold text-slate-50">{fileName}</h2>
        <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-300">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            application/pdf
          </span>
          <span
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1"
            data-testid="preview-pdf-page-count"
          >
            {pageCountLabel}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            {previewStatus === "ready" ? "可阅读" : "准备中"}
          </span>
        </div>
      </header>

      <div className="rounded-[28px] border border-white/10 bg-[#020617] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        {canRender ? (
          <iframe
            className="h-[68vh] w-full rounded-[24px] border border-white/10 bg-white"
            data-testid="preview-pdf-frame"
            src={pdfSrc ?? undefined}
            title={`${fileName}-pdf-preview`}
          />
        ) : (
          <div
            className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 text-center"
            data-testid="preview-pdf-fallback"
          >
            <div className="text-base font-medium text-slate-100">
              {previewStatus === "pending" ? "PDF 预览准备中" : "无法预览当前 PDF"}
            </div>
            <div className="max-w-xl text-sm leading-6 text-slate-400">{fallbackMessage}</div>
          </div>
        )}
      </div>

      <dl className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-5 text-sm text-slate-300">
        <div>
          <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">文件路径</dt>
          <dd className="mt-2 break-all text-slate-100" data-testid="preview-pdf-path">
            {sourcePath ?? "路径未知"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">预览状态</dt>
          <dd className="mt-2 text-slate-100">
            {previewStatus === "ready"
              ? "可阅读"
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
