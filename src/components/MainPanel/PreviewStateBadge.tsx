interface PreviewStateBadgeProps {
  visible: boolean;
}

export const PreviewStateBadge = ({ visible }: PreviewStateBadgeProps) => {
  if (!visible) {
    return null;
  }

  return (
    <span
      className="absolute left-3 top-3 z-10 inline-flex h-6 items-center justify-center rounded-full border border-violet-300/35 bg-violet-400/12 px-2 text-[11px] font-semibold text-violet-100"
      data-testid="previewing-badge"
    >
      预览中
    </span>
  );
};
