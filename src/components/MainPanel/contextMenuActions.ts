import type { ClipboardRecord } from "../../types/clipboard";
import { isFileRecord, isImageRecord, isTextRecord } from "../../types/clipboard";
import type { ContextMenuActionState } from "../../stores/useUIStore";

const supportsPlainTextPaste = (record: ClipboardRecord): boolean => {
  return isTextRecord(record) || isFileRecord(record) || isImageRecord(record);
};

export const buildCardContextMenuActions = (record: ClipboardRecord): ContextMenuActionState[] => [
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
    disabled: !supportsPlainTextPaste(record),
  },
  {
    key: "delete",
    label: "删除记录",
    disabled: false,
    danger: true,
    separated: true,
  },
];
