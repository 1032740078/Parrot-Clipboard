interface QuickSelectBadgeProps {
  slot?: number | null;
}

export const QuickSelectBadge = ({ slot }: QuickSelectBadgeProps) => {
  if (!slot || slot > 9) {
    return null;
  }

  return (
    <span
      className="mr-2 inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-white/15 bg-slate-950/75 px-1.5 text-[11px] font-semibold text-slate-100"
      data-testid="quick-select-badge"
    >
      {slot}
    </span>
  );
};
