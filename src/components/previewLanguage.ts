import type { Extension } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";

const LANG_PATTERNS: Array<{ test: RegExp; ext: () => Extension }> = [
  { test: /^\s*\{[\s\S]*\}\s*$|^\s*\[[\s\S]*\]\s*$/, ext: () => json() },
  { test: /^\s*<!doctype\s+html|^\s*<html[\s>]/i, ext: () => html() },
  { test: /^\s*<\?xml|^\s*<svg[\s>]/i, ext: () => html() },
  { test: /^#!.*\bpython|^\s*(import\s+\w+|from\s+\w+\s+import|def\s+\w+\s*\(|class\s+\w+[:(])/m, ext: () => python() },
  { test: /^\s*(import\s+.*from\s+['"]|export\s+(default\s+)?|const\s+\w+\s*=|function\s+\w+\s*\(|=>\s*\{)/m, ext: () => javascript({ typescript: true, jsx: true }) },
  { test: /^\s*(var\s+\w+|let\s+\w+|console\.\w+|document\.\w+|window\.\w+)/m, ext: () => javascript() },
  { test: /^\s*(@import|@media|@keyframes|\.\w+\s*\{|#\w+\s*\{|\w+\s*\{[^}]*:\s*[^}]+\})/m, ext: () => css() },
  { test: /^\s*(#{1,6}\s+|\*\*\w|```|>\s+\w|- \[[ x]\])/m, ext: () => markdown() },
];

export const guessLanguageExtension = (text: string): Extension | null => {
  const sample = text.slice(0, 2000);

  for (const { test, ext } of LANG_PATTERNS) {
    if (test.test(sample)) {
      return ext();
    }
  }

  return null;
};
