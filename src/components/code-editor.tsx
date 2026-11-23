"use client";

import Editor, { loader, type BeforeMount, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useSyncExternalStore } from "react";

// Load Monaco from this app (public/monaco, see scripts/copy-monaco.mjs), not a CDN.
loader.config({ paths: { vs: "/monaco/vs" } });

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeToScheme(onChange: () => void) {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function usePrefersDark() {
  return useSyncExternalStore(
    subscribeToScheme,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
}

// Match the page's zinc palette instead of Monaco's default greys.
const defineThemes: BeforeMount = (monaco) => {
  monaco.editor.defineTheme("contest-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: { "editor.background": "#18181b", "editorGutter.background": "#18181b" },
  });
  monaco.editor.defineTheme("contest-light", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: { "editor.background": "#fafafa", "editorGutter.background": "#fafafa" },
  });
};

export function CodeEditor({
  value,
  onChange,
  language,
  onSubmitShortcut,
}: {
  value: string;
  onChange: (value: string) => void;
  language: string;
  onSubmitShortcut?: () => void;
}) {
  const dark = usePrefersDark();
  const submitRef = useRef(onSubmitShortcut);
  useEffect(() => {
    submitRef.current = onSubmitShortcut;
  }, [onSubmitShortcut]);

  const onMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => submitRef.current?.());
  };

  return (
    <div className="overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-700">
      <Editor
        height="28rem"
        language={language}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        theme={dark ? "contest-dark" : "contest-light"}
        beforeMount={defineThemes}
        onMount={onMount}
        loading={<div className="text-sm text-zinc-500">Loading editor…</div>}
        options={{
          fontSize: 13,
          tabSize: 4,
          insertSpaces: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          fixedOverflowWidgets: true,
          padding: { top: 12, bottom: 12 },
          renderLineHighlight: "line",
          bracketPairColorization: { enabled: true },
          stickyScroll: { enabled: false },
        }}
      />
    </div>
  );
}
