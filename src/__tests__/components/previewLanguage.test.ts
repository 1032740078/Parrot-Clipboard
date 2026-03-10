import { describe, expect, it } from "vitest";

import { guessLanguageExtension } from "../../components/previewLanguage";

describe("guessLanguageExtension", () => {
  it("JSON 对象返回语言扩展", () => {
    expect(guessLanguageExtension('{ "key": "value" }')).not.toBeNull();
  });

  it("JSON 数组返回语言扩展", () => {
    expect(guessLanguageExtension('[1, 2, 3]')).not.toBeNull();
  });

  it("HTML doctype 返回语言扩展", () => {
    expect(guessLanguageExtension("<!doctype html><html></html>")).not.toBeNull();
  });

  it("HTML 标签返回语言扩展", () => {
    expect(guessLanguageExtension("<html>\n<body></body>\n</html>")).not.toBeNull();
  });

  it("XML/SVG 返回语言扩展", () => {
    expect(guessLanguageExtension('<?xml version="1.0"?>')).not.toBeNull();
    expect(guessLanguageExtension("<svg></svg>")).not.toBeNull();
  });

  it("Python 代码返回语言扩展", () => {
    expect(guessLanguageExtension("import os\nprint('hello')")).not.toBeNull();
    expect(guessLanguageExtension("def foo():\n  pass")).not.toBeNull();
    expect(guessLanguageExtension("from sys import argv")).not.toBeNull();
    expect(guessLanguageExtension("class MyClass:")).not.toBeNull();
  });

  it("JavaScript/TypeScript 代码返回语言扩展", () => {
    expect(guessLanguageExtension("import React from 'react'")).not.toBeNull();
    expect(guessLanguageExtension("export default function App() {}")).not.toBeNull();
    expect(guessLanguageExtension("const x = 1")).not.toBeNull();
    expect(guessLanguageExtension("function hello() {}")).not.toBeNull();
  });

  it("旧式 JS 代码返回语言扩展", () => {
    expect(guessLanguageExtension("var x = 1")).not.toBeNull();
    expect(guessLanguageExtension("console.log('hi')")).not.toBeNull();
    expect(guessLanguageExtension("document.getElementById('x')")).not.toBeNull();
  });

  it("CSS 代码返回语言扩展", () => {
    expect(guessLanguageExtension("@import 'reset.css';")).not.toBeNull();
    expect(guessLanguageExtension("@media (max-width: 768px) {}")).not.toBeNull();
    expect(guessLanguageExtension(".container { display: flex; }")).not.toBeNull();
  });

  it("Markdown 代码返回语言扩展", () => {
    expect(guessLanguageExtension("# Title\n\nSome text")).not.toBeNull();
    expect(guessLanguageExtension("```js\ncode\n```")).not.toBeNull();
    expect(guessLanguageExtension("> blockquote text")).not.toBeNull();
    expect(guessLanguageExtension("- [x] done")).not.toBeNull();
  });

  it("普通文本返回 null", () => {
    expect(guessLanguageExtension("hello world")).toBeNull();
  });

  it("空字符串返回 null", () => {
    expect(guessLanguageExtension("")).toBeNull();
  });

  it("超长文本只检测前 2000 字符", () => {
    const longPlain = "a".repeat(3000);
    expect(guessLanguageExtension(longPlain)).toBeNull();
  });
});
