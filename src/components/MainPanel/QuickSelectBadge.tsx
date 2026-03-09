interface QuickSelectBadgeProps {
  slot?: number | null;
}

export const QuickSelectBadge = ({ slot }: QuickSelectBadgeProps) => {
  if (!slot || slot > 9) {
    return null;
  }

  return (
    <span
      className="absolute right-3 top-[2px] z-10 inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-white/15 bg-slate-950/75 px-2 text-[11px] font-semibold text-slate-100"
      data-testid="quick-select-badge"
    >
      {slot}
    </span>
  );
};
