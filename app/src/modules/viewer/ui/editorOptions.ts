/** コードモード・差分モード・分割表示の上段で見た目を揃えるための共通オプション。 */
export const SHARED_EDITOR_OPTIONS = {
  readOnly: true,
  domReadOnly: true,
  automaticLayout: true,
  smoothScrolling: true,
  cursorSmoothCaretAnimation: "on",
  fontFamily:
    '"SFMono-Regular", "SF Mono", Menlo, Monaco, Consolas, monospace',
  fontSize: 14,
  lineHeight: 23,
  fontLigatures: true,
  glyphMargin: false,
  folding: true,
  padding: { top: 23, bottom: 30 },
  renderLineHighlight: "line",
  roundedSelection: false,
  scrollBeyondLastLine: false,
  scrollbar: {
    verticalScrollbarSize: 13,
    horizontalScrollbarSize: 13,
  },
  stickyScroll: { enabled: true },
  wordWrap: "off",
  overviewRulerBorder: false,
  overviewRulerLanes: 3,
  contextmenu: true,
} as const;
