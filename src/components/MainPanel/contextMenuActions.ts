import type { ClipboardRecord } from "../../types/clipboard";
import { isTextRecord } from "../../types/clipboard";
import type { ContextMenuActionState } from "../../stores/useUIStore";

export const buildCardContextMenuActions = (
  record: ClipboardRecord
): ContextMenuActionState[] => [
  {
    key: "preview",
    label: "预览完整内容",
    disabled: false,
  },
  {
    key: "paste",
    label: "直接粘贴",
    disabled: false,
  },
  {
    key: "paste_plain_text",
    label: "纯文本粘贴",
    disabled: !isTextRecord(record),
  },
  {
    key: "delete",
    label: "删除记录",
    disabled: false,
    danger: true,
    separated: true,
  },
];
