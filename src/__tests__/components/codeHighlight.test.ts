import { describe, expect, it } from "vitest";

import { detectHighlightedCode } from "../../components/codeHighlight";

describe("detectHighlightedCode", () => {
  it("能识别 Rust 代码片段", () => {
    const result = detectHighlightedCode("fn main() {\n    println!(\"hello\");\n}");

    expect(result).not.toBeNull();
    expect(result?.language).toBe("rust");
    expect(result?.html).toContain("println");
  });

  it("能识别 SQL 代码片段", () => {
    const result = detectHighlightedCode("SELECT id, name FROM clipboard_items WHERE id = 1;");

    expect(result).not.toBeNull();
    expect(result?.language).toBe("sql");
  });

  it("能识别 Bash 代码片段", () => {
    const result = detectHighlightedCode("#!/bin/bash\npnpm run test");

    expect(result).not.toBeNull();
    expect(result?.language).toBe("bash");
  });

  it("普通文本不会被误判为代码", () => {
    expect(detectHighlightedCode("明天下午三点开会，记得带上评审文档。")).toBeNull();
  });
});

