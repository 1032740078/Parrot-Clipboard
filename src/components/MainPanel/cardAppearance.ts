export const CARD_HEADER_BASE_CLASS_NAME =
  "flex h-8 items-center px-3 text-[13px] font-semibold";

interface CardAppearanceOptions {
  isSelected: boolean;
  isPreviewing?: boolean;
}

export const getCardAppearanceClassName = ({
  isSelected,
  isPreviewing = false,
}: CardAppearanceOptions): string => {
  const baseClassName =
    "relative flex h-52 w-card shrink-0 flex-col overflow-hidden rounded-[8px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.04))] backdrop-blur-xl transition-[transform,border-color,box-shadow,background-color] duration-[140ms] ease-out motion-reduce:transition-none hover:-translate-y-0.5 hover:border-sky-300/35 hover:shadow-[0_18px_36px_rgba(15,23,42,0.24)]";
  const defaultClassName = "border-white/10 shadow-[0_14px_30px_rgba(15,23,42,0.18)]";
  const selectedClassName =
    "border-2 border-rose-400/85 shadow-[0_0_0_2px_rgba(251,113,133,0.34),0_22px_46px_rgba(127,29,29,0.3)]";
  const previewingClassName =
    "ring-1 ring-violet-300/45 shadow-[0_0_0_1px_rgba(196,181,253,0.3),0_0_32px_rgba(56,189,248,0.2)]";

  return [
    baseClassName,
    isSelected ? selectedClassName : defaultClassName,
    isPreviewing ? previewingClassName : "",
  ]
    .filter(Boolean)
    .join(" ");
};
