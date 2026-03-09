import { describe, expect, it } from "vitest";

import { buildCardContextMenuActions } from "../../components/MainPanel/contextMenuActions";
import { buildFileRecord, buildImageRecord, buildRecord } from "../fixtures/clipboardRecords";

describe("contextMenuActions", () => {
  it("UT-CONTEXT-201 文本卡片动作顺序与可用态正确", () => {
    const actions = buildCardContextMenuActions(buildRecord(1, "正文", 1000));

    expect(actions).toEqual([
      { key: "preview", label: "预览完整内容", disabled: false },
      { key: "paste", label: "直接粘贴", disabled: false },
      { key: "paste_plain_text", label: "纯文本粘贴", disabled: false },
      { key: "delete", label: "删除记录", disabled: false, danger: true, separated: true },
    ]);
  });

  it("UT-CONTEXT-202 图片与文件卡片会禁用纯文本粘贴", () => {
    const imageActions = buildCardContextMenuActions(buildImageRecord(2, "截图", 1000));
    const fileActions = buildCardContextMenuActions(buildFileRecord(3, "需求文档.md", 1000));

    expect(imageActions.find((action) => action.key === "paste_plain_text")?.disabled).toBe(true);
    expect(fileActions.find((action) => action.key === "paste_plain_text")?.disabled).toBe(true);
  });
});
