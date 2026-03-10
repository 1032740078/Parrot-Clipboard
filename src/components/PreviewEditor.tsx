import { useEffect, useRef, useCallback } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap, openSearchPanel } from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";
import { guessLanguageExtension } from "./previewLanguage";

interface PreviewEditorProps {
  value: string;
  onChange?: (value: string) => void;
  recordId: number | null;
  readOnly?: boolean;
  showSearchButton?: boolean;
}

const baseTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "14px",
    backgroundColor: "transparent",
  },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
    lineHeight: "1.7",
    padding: "16px 0",
  },
  ".cm-content": {
    padding: "0 24px",
    caretColor: "#e4e4e7",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.2)",
    paddingLeft: "8px",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "rgba(255,255,255,0.5)",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "rgba(56,189,248,0.18) !important",
  },
  ".cm-panels": {
    backgroundColor: "rgba(15,23,42,0.85)",
    backdropFilter: "blur(12px)",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  ".cm-panels input": {
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#e4e4e7",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "6px",
    padding: "4px 8px",
    fontSize: "13px",
    outline: "none",
  },
  ".cm-panels input:focus": {
    borderColor: "rgba(56,189,248,0.5)",
  },
  ".cm-panels button": {
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#e4e4e7",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "6px",
    padding: "4px 10px",
    fontSize: "12px",
    cursor: "pointer",
  },
  ".cm-panels button:hover": {
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  ".cm-panels label": {
    color: "rgba(255,255,255,0.6)",
    fontSize: "12px",
  },
  ".cm-search .cm-button": {
    backgroundImage: "none",
  },
});

const supportsDrawSelection = (): boolean => {
  if (typeof document === "undefined" || typeof document.createRange !== "function") {
    return false;
  }

  return typeof document.createRange().getClientRects === "function";
};

export const PreviewEditor = ({
  value,
  onChange,
  recordId,
  readOnly = false,
  showSearchButton = true,
}: PreviewEditorProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const suppressNextUpdateRef = useRef(false);

  onChangeRef.current = onChange;

  const openSearch = useCallback(() => {
    if (viewRef.current) {
      openSearchPanel(viewRef.current);
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const langExt = guessLanguageExtension(value);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !suppressNextUpdateRef.current && onChangeRef.current) {
        onChangeRef.current(update.state.doc.toString());
      }
      suppressNextUpdateRef.current = false;
    });

    const extensions = [
      lineNumbers(),
      highlightActiveLine(),
      history(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        { key: "Mod-f", run: openSearchPanel },
      ]),
      oneDark,
      baseTheme,
      updateListener,
      EditorView.lineWrapping,
    ];

    if (supportsDrawSelection()) {
      extensions.push(drawSelection());
    }

    if (readOnly) {
      extensions.push(EditorState.readOnly.of(true), EditorView.editable.of(false));
    }

    if (langExt) {
      extensions.push(langExt);
    }

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only recreate editor when recordId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, recordId]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentDoc = view.state.doc.toString();
    if (currentDoc === value) return;

    suppressNextUpdateRef.current = true;
    view.dispatch({
      changes: {
        from: 0,
        to: currentDoc.length,
        insert: value,
      },
    });
  }, [value]);

  return (
    <div className="relative flex h-full w-full flex-col">
      {showSearchButton ? (
        <div className="flex h-8 shrink-0 items-center justify-end gap-2 border-b border-white/6 px-4">
          <button
            className="rounded px-2 py-0.5 text-[11px] text-slate-400 transition hover:bg-white/8 hover:text-white"
            onClick={openSearch}
            title={readOnly ? "搜索 (⌘F)" : "搜索与替换 (⌘F)"}
            type="button"
          >
            {readOnly ? "搜索" : "搜索/替换"}
          </button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden" ref={containerRef} />
    </div>
  );
};
