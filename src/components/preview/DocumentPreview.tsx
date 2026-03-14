import { useMemo } from "react";

import type { ClipboardRecordDetail, PreviewStatus } from "../../types/clipboard";
import { toPreviewSrc } from "../MainPanel/previewAsset";

interface DocumentPreviewProps {
  detail: ClipboardRecordDetail;
}

const DOCUMENT_KIND_LABELS: Record<string, string> = {
  doc: "Word 旧版文稿",
  docx: "Word 文稿",
  xls: "Excel 旧版表格",
  xlsx: "Excel 表格",
  pdf: "PDF 文稿",
  ppt: "PowerPoint 旧版演示文稿",
  pptx: "PowerPoint 演示文稿",
};

const buildFallbackMessage = (
  previewStatus: PreviewStatus,
  previewErrorMessage?: string | null,
  hasSource = true
): string => {
  if (previewErrorMessage) {
    return previewErrorMessage;
  }

  if (!hasSource) {
    return "找不到可用于预览的文稿源文件。";
  }

  switch (previewStatus) {
    case "pending":
      return "正在准备文稿结构化预览，请稍候。";
    case "unsupported":
      return "当前文稿格式暂不支持结构化预览，仍可保留文件路径用于降级查看。";
    case "failed":
      return "文稿解析失败，请稍后重试。";
    default:
      return "无法预览当前文稿。";
  }
};

const formatPreviewStatus = (previewStatus: PreviewStatus): string => {
  switch (previewStatus) {
    case "ready":
      return "可阅读";
    case "pending":
      return "准备中";
    case "unsupported":
      return "暂不支持";
    case "failed":
      return "准备失败";
  }
};

const formatSlideCount = (slideCount?: number | null): string => {
  if (!slideCount || slideCount <= 0) {
    return "幻灯片数未知";
  }

  return `共 ${slideCount} 张幻灯片`;
};

export const DocumentPreview = ({ detail }: DocumentPreviewProps) => {
  const documentDetail = detail.document_detail;
  const previewStatus = detail.preview_status ?? documentDetail?.preview_status ?? "pending";
  const sourcePath =
    detail.primary_uri ?? detail.files_detail?.items[0]?.path ?? documentDetail?.html_path ?? null;
  const htmlPreviewSrc = useMemo(
    () => toPreviewSrc(documentDetail?.html_path ?? null),
    [documentDetail?.html_path]
  );
  const fileName = detail.files_meta?.primary_name ?? detail.preview_text;
  const documentKind = documentDetail?.document_kind ?? "docx";
  const kindLabel = DOCUMENT_KIND_LABELS[documentKind] ?? "文稿";
  const fallbackMessage = buildFallbackMessage(
    previewStatus,
    detail.preview_error_message,
    Boolean(sourcePath)
  );
  const hasRenderableHtml = previewStatus === "ready" && Boolean(htmlPreviewSrc);
  const structuredText = documentDetail?.text_content?.trim() ?? "";
  const sheetNames = documentDetail?.sheet_names?.filter(Boolean) ?? [];
  const canShowStructuredContent =
    previewStatus === "ready" &&
    (hasRenderableHtml ||
      structuredText.length > 0 ||
      sheetNames.length > 0 ||
      documentDetail?.slide_count);

  return (
    <section className="flex h-full w-full flex-col gap-6 overflow-y-auto px-8 py-8">
      <header className="rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-5">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-200/80">
          文稿预览
        </div>
        <h2 className="mt-3 break-all text-2xl font-semibold text-slate-50">{fileName}</h2>
        <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-300">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            {kindLabel}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            {formatPreviewStatus(previewStatus)}
          </span>
          {sheetNames.length > 0 ? (
            <span
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1"
              data-testid="preview-document-sheet-count"
            >
              {sheetNames.length} 个工作表
            </span>
          ) : null}
          {documentDetail?.slide_count ? (
            <span
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1"
              data-testid="preview-document-slide-count"
            >
              {formatSlideCount(documentDetail.slide_count)}
            </span>
          ) : null}
        </div>
      </header>

      <div className="rounded-[28px] border border-white/10 bg-[#020617] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        {canShowStructuredContent ? (
          <div className="space-y-5">
            {hasRenderableHtml ? (
              <iframe
                className="h-[54vh] w-full rounded-[24px] border border-white/10 bg-white"
                data-testid="preview-document-frame"
                src={htmlPreviewSrc ?? undefined}
                title={`${fileName}-document-preview`}
              />
            ) : null}

            {structuredText ? (
              <article
                className="rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-5 text-sm leading-7 text-slate-100 whitespace-pre-wrap"
                data-testid="preview-document-text-content"
              >
                {structuredText}
              </article>
            ) : null}

            {sheetNames.length > 0 ? (
              <section
                className="rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-5"
                data-testid="preview-document-sheet-list"
              >
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">工作表</div>
                <ul className="mt-3 flex flex-wrap gap-3 text-sm text-slate-100">
                  {sheetNames.map((sheetName) => (
                    <li
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1"
                      key={sheetName}
                    >
                      {sheetName}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : (
          <div
            className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 text-center"
            data-testid="preview-document-fallback"
          >
            <div className="text-base font-medium text-slate-100">
              {previewStatus === "pending" ? "文稿预览准备中" : "无法预览当前文稿"}
            </div>
            <div className="max-w-xl text-sm leading-6 text-slate-400">{fallbackMessage}</div>
          </div>
        )}
      </div>

      <dl className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-5 text-sm text-slate-300">
        <div>
          <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">文件路径</dt>
          <dd className="mt-2 break-all text-slate-100" data-testid="preview-document-path">
            {sourcePath ?? "路径未知"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">文稿类型</dt>
          <dd className="mt-2 text-slate-100">{kindLabel}</dd>
        </div>
      </dl>
    </section>
  );
};
