interface PreviewStateBadgeProps {
  visible: boolean;
}

const PreviewStateIcon = () => (
  <svg
    aria-hidden="true"
    className="preview-state-status-icon"
    fill="none"
    viewBox="0 0 24 24"
  >
    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
    <circle cx="12" cy="12" r="3.2" />
  </svg>
);

export const PreviewStateBadge = ({ visible }: PreviewStateBadgeProps) => {
  if (!visible) {
    return null;
  }

  return (
    <div
      className="preview-state-overlay absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
      data-testid="previewing-badge"
    >
      <span className="preview-state-status" data-testid="previewing-badge-pill">
        <span className="preview-state-status-icon-shell" data-testid="previewing-badge-icon">
          <PreviewStateIcon />
        </span>
        <span className="preview-state-status-text">预览中</span>
      </span>
    </div>
  );
};
