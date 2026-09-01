// コードビューアの view。Monaco のライフサイクルは useMonacoViewer が持ち、
// ここでは placeholder / エディタ / 注釈レイヤの表示だけを組み立てる。
import Editor from "@monaco-editor/react";
import { useState } from "react";
import { CodeAnnotationLayer } from "./CodeAnnotationLayer";
import type { CodeAnnotation, CodeTarget } from "../../review";
import type { ChangedLine, FileContent } from "../../workspace";
import type { SymbolIndex } from "../../../shared/snapshot/SymbolIndex";
import { languageFromPath } from "../language";
import { unavailableMessageFor } from "../unavailableMessage";
import { useMonacoViewer } from "./useMonacoViewer";

type CodeViewerProps = {
  annotations: CodeAnnotation[];
  changedLines: ChangedLine[];
  file?: FileContent;
  focus?: CodeTarget;
  focusToken: number;
  isLoading: boolean;
  navigationFiles: FileContent[];
  symbolIndex: SymbolIndex | null;
  onOpenLocation(target: CodeTarget): void;
  jumpTarget?: CodeTarget;
  jumpToken: number;
};

type AnnotationRenderState = {
  annotationCount: number;
  dismissedFocusToken?: number;
  focusToken: number;
  hasViewport: boolean;
};

export function shouldRenderCodeAnnotations({
  annotationCount,
  dismissedFocusToken,
  focusToken,
  hasViewport,
}: AnnotationRenderState): boolean {
  return (
    annotationCount > 0 && hasViewport && dismissedFocusToken !== focusToken
  );
}

export function CodeViewer({
  annotations,
  changedLines,
  file,
  focus,
  focusToken,
  isLoading,
  navigationFiles,
  symbolIndex,
  onOpenLocation,
  jumpTarget,
  jumpToken,
}: CodeViewerProps) {
  const [dismissedFocusToken, setDismissedFocusToken] = useState<number>();
  const {
    anchors,
    handleMount,
    selectAnnotation,
    selectedAnnotationId,
    viewport,
  } = useMonacoViewer({
    annotations,
    changedLines,
    filePath: file?.path,
    focus,
    focusToken,
    navigationFiles,
    symbolIndex,
    onOpenLocation,
    jumpTarget,
    jumpToken,
  });

  if (!file) {
    return (
      <div className="viewer-placeholder">
        <span className="placeholder-glyph" aria-hidden="true">
          ⌘
        </span>
        <strong>
          {isLoading ? "ファイルを開いています…" : "ファイルを選択してください"}
        </strong>
        <span>Coduoではソース全体を確認できます。</span>
      </div>
    );
  }
  if (file.unavailableReason || file.content.length === 0) {
    const message = unavailableMessageFor(file);
    return (
      <div className="viewer-placeholder" role="status">
        <span className="placeholder-glyph" aria-hidden="true">
          ◇
        </span>
        <strong>{file.path}</strong>
        <span>{message}</span>
      </div>
    );
  }

  const showAnnotations = shouldRenderCodeAnnotations({
    annotationCount: annotations.length,
    dismissedFocusToken,
    focusToken,
    hasViewport: viewport.height > 0 && viewport.width > 0,
  });

  return (
    <div
      className={`code-viewer${showAnnotations ? " has-code-annotations" : ""}`}
      data-testid="code-viewer"
    >
      <div className="code-editor-surface">
        <Editor
          height="100%"
          path={`file://${file.path}`}
          value={file.content}
          language={file.language || languageFromPath(file.path)}
          theme="coduo-dark"
          loading={
            <div className="viewer-loading">エディタを準備しています…</div>
          }
          onMount={handleMount}
          options={{
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
            minimap: {
              enabled: !showAnnotations,
              scale: 1,
              showSlider: "mouseover",
              maxColumn: 80,
            },
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
          }}
        />
      </div>
      {showAnnotations && (
        <CodeAnnotationLayer
          anchors={anchors}
          annotations={annotations}
          height={viewport.height}
          onClose={() => setDismissedFocusToken(focusToken)}
          onSelect={(id) => selectAnnotation(id, true)}
          selectedId={selectedAnnotationId}
          width={viewport.width}
        />
      )}
    </div>
  );
}
