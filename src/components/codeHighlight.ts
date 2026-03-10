import hljs from "highlight.js/lib/common";

const HIGHLIGHT_LANGUAGES = [
  "bash",
  "c",
  "cpp",
  "csharp",
  "css",
  "diff",
  "go",
  "graphql",
  "ini",
  "java",
  "javascript",
  "json",
  "kotlin",
  "lua",
  "makefile",
  "objectivec",
  "perl",
  "php",
  "python",
  "ruby",
  "rust",
  "shell",
  "sql",
  "swift",
  "typescript",
  "wasm",
  "xml",
  "yaml",
] as const;

const CODE_STRUCTURE_PATTERN =
  /(```[\s\S]*```|=>|::|->|<\/?[A-Za-z][^>]*>|[{[\]}();=]|#include|#!\/|SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+|DELETE\s+FROM|\b(function|const|let|var|class|interface|type|enum|import|export|def|class|from|fn|impl|struct|trait|match|package|public|private|protected|func|SELECT|FROM|WHERE|BEGIN|END)\b)/m;

const LANGUAGE_HINTS: Array<{ language: (typeof HIGHLIGHT_LANGUAGES)[number]; test: RegExp }> = [
  {
    language: "rust",
    test: /\b(fn\s+\w+|let\s+mut|println!|impl\s+\w+|struct\s+\w+|enum\s+\w+|trait\s+\w+|match\s+\w+|use\s+[A-Za-z0-9_:]+)/m,
  },
  {
    language: "sql",
    test: /\b(SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|ORDER\s+BY|GROUP\s+BY|LEFT\s+JOIN|INNER\s+JOIN)\b/im,
  },
  {
    language: "bash",
    test: /(^#!\/bin\/(?:ba)?sh|^\s*(echo|export|if \[|fi$|grep\s+|sed\s+|awk\s+|pnpm\s+|npm\s+|cargo\s+|cd\s+))/m,
  },
  {
    language: "python",
    test: /(^#!.*python|^\s*(def\s+\w+\s*\(|class\s+\w+[:(]|from\s+\w+\s+import|import\s+\w+))/m,
  },
  {
    language: "typescript",
    test: /\b(interface\s+\w+|type\s+\w+\s*=|enum\s+\w+|import\s+type\s+|as\s+const\b|:\s*[A-Z][A-Za-z0-9_<>[\]|]+(?:\s*[=;,)])?)/m,
  },
  {
    language: "javascript",
    test: /\b(import\s+.+from\s+['"]|export\s+(default|const|function|class)|const\s+\w+\s*=|let\s+\w+\s*=|function\s+\w+\s*\(|console\.\w+\(|document\.\w+|window\.\w+)\b/m,
  },
  {
    language: "json",
    test: /^\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*$/m,
  },
  {
    language: "xml",
    test: /^\s*(<!doctype\s+html|<html[\s>]|<\?xml|<svg[\s>]|<[A-Za-z][^>]*>)/im,
  },
  {
    language: "yaml",
    test: /^(\s*[A-Za-z0-9_.-]+\s*:\s*.+\n?){2,}/m,
  },
  {
    language: "css",
    test: /^\s*(@media|@import|@keyframes|[.#]?[A-Za-z][\w-]*\s*\{[^}]*:\s*[^}]+\})/m,
  },
  {
    language: "go",
    test: /\b(package\s+\w+|func\s+\w+\s*\(|fmt\.\w+\(|import\s+\(|type\s+\w+\s+struct)\b/m,
  },
  {
    language: "java",
    test: /\b(public\s+(class|interface|enum)|private\s+\w+|System\.out\.println|package\s+[a-z0-9_.]+;)\b/m,
  },
  {
    language: "cpp",
    test: /\b(#include\s+[<"]|std::|int\s+main\s*\(|cout\s*<<|cin\s*>>)\b/m,
  },
];

export interface HighlightedCodeResult {
  html: string;
  language: string;
  relevance: number;
}

const getRelevanceThreshold = (sample: string): number => {
  return sample.includes("\n") ? 3 : 4;
};

export const detectHighlightedCode = (text: string): HighlightedCodeResult | null => {
  const sample = text.trim().slice(0, 8000);
  if (!sample) {
    return null;
  }

  if (!CODE_STRUCTURE_PATTERN.test(sample)) {
    return null;
  }

  const hinted = LANGUAGE_HINTS.find(({ test }) => test.test(sample));
  if (hinted) {
    const result = hljs.highlight(sample, { language: hinted.language });
    return {
      html: result.value,
      language: hinted.language,
      relevance: result.relevance,
    };
  }

  const result = hljs.highlightAuto(sample, [...HIGHLIGHT_LANGUAGES]);
  if (!result.language || result.language === "plaintext") {
    return null;
  }

  if (result.relevance < getRelevanceThreshold(sample)) {
    return null;
  }

  return {
    html: result.value,
    language: result.language,
    relevance: result.relevance,
  };
};
