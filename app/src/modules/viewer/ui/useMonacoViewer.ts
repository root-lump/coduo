// Monaco エディタのライフサイクル管理。
// エディタ実体・デコレーション・注釈アンカー位置の追従をここに閉じ込め、
// CodeViewer（view）は表示だけを担う。
import { useCallback, useEffect, useRef, useState } from "react";
import type { editor } from "monaco-editor";
import type { OnMount } from "@monaco-editor/react";
import type { CodeAnnotation, CodeTarget } from "../../review";
import type { ChangedLine } from "../../workspace";
import type { SymbolIndex } from "../../../shared/snapshot/SymbolIndex";
import type { AnnotationAnchor } from "../codeAnnotations";
import { annotationAtPosition } from "../codeAnnotations";
import {
  annotationDecorations,
  focusDecoration,
  focusRange,
  gitDecorations,
} from "../decorations";
import { monaco } from "../monacoEnvironment";
import type { FileContent } from "../../workspace";
import { installCodeNavigation } from "./monacoCodeNavigation";

type Disposable = { dispose(): void };

type AnnotationEventSource = {
  onDidChangeModel(listener: () => void): Disposable;
  onDidLayoutChange(listener: () => void): Disposable;
  onDidScrollChange(listener: () => void): Disposable;
};

export function subscribeToAnnotationEvents(
  source: AnnotationEventSource,
  onUpdate: () => void,
): Disposable {
  const listeners = [
    source.onDidScrollChange(onUpdate),
    source.onDidLayoutChange(onUpdate),
    source.onDidChangeModel(onUpdate),
  ];
  return { dispose: () => listeners.forEach((listener) => listener.dispose()) };
}

type UseMonacoViewerArgs = {
  annotations: CodeAnnotation[];
  changedLines: ChangedLine[];
  filePath?: string;
  focus?: CodeTarget;
  focusToken: number;
  navigationFiles: FileContent[];
  symbolIndex: SymbolIndex | null;
  onOpenLocation(target: CodeTarget): void;
  jumpTarget?: CodeTarget;
  jumpToken: number;
};

export function useMonacoViewer({
  annotations,
  changedLines,
  filePath,
  focus,
  focusToken,
  navigationFiles,
  symbolIndex,
  onOpenLocation,
  jumpTarget,
  jumpToken,
}: UseMonacoViewerArgs) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | undefined>(undefined);
  const editorListenersRef = useRef<Disposable | undefined>(undefined);
  const mouseListenerRef = useRef<Disposable | undefined>(undefined);
  const gitDecorationsRef = useRef<
    editor.IEditorDecorationsCollection | undefined
  >(undefined);
  const focusDecorationsRef = useRef<
    editor.IEditorDecorationsCollection | undefined
  >(undefined);
  const annotationDecorationsRef = useRef<
    editor.IEditorDecorationsCollection | undefined
  >(undefined);
  const updateRef = useRef<() => void>(() => undefined);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const [anchors, setAnchors] = useState<AnnotationAnchor[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string>();
  const [viewport, setViewport] = useState({ height: 0, width: 0 });
  const [isEditorMounted, setIsEditorMounted] = useState(false);

  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const onOpenLocationRef = useRef(onOpenLocation);
  onOpenLocationRef.current = onOpenLocation;

  const updateAnnotationPositions = useCallback(() => {
    const editorInstance = editorRef.current;
    const model = editorInstance?.getModel();
    if (!editorInstance || !model) {
      setAnchors([]);
      return;
    }
    const layout = editorInstance.getLayoutInfo();
    const firstVisibleLine =
      editorInstance.getVisibleRanges()[0]?.startLineNumber ?? 1;
    const nextAnchors = annotations.map((annotation) => {
      const range = focusRange(annotation.target, model.getLineCount());
      const lineNumber = range
        ? Math.floor((range.startLineNumber + range.endLineNumber) / 2)
        : 1;
      const position = editorInstance.getScrolledVisiblePosition({
        lineNumber,
        column: 1,
      });
      return {
        id: annotation.id,
        top: position
          ? position.top + position.height / 2
          : lineNumber < firstVisibleLine
            ? 4
            : layout.height - 4,
        visible: Boolean(position),
      };
    });
    setViewport((current) =>
      current.height === layout.height && current.width === layout.width
        ? current
        : { height: layout.height, width: layout.width },
    );
    setAnchors(nextAnchors);
  }, [annotations]);
  updateRef.current = updateAnnotationPositions;

  const schedulePositionUpdate = useCallback(() => {
    if (animationFrameRef.current !== undefined)
      window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = undefined;
      updateRef.current();
    });
  }, []);

  const applyDecorations = useCallback(() => {
    const editorInstance = editorRef.current;
    const model = editorInstance?.getModel();
    if (!editorInstance || !model) return;
    const lineCount = model.getLineCount();
    gitDecorationsRef.current?.set(gitDecorations(changedLines, lineCount));
    focusDecorationsRef.current?.set(focusDecoration(focus, lineCount));
    annotationDecorationsRef.current?.set(
      annotationDecorations(annotations, selectedAnnotationId, lineCount),
    );
    schedulePositionUpdate();
  }, [
    annotations,
    changedLines,
    focus,
    schedulePositionUpdate,
    selectedAnnotationId,
  ]);

  const selectAnnotation = useCallback(
    (id: string, reveal: boolean) => {
      setSelectedAnnotationId(id);
      if (!reveal) return;
      const editorInstance = editorRef.current;
      const model = editorInstance?.getModel();
      const annotation = annotations.find((candidate) => candidate.id === id);
      if (!editorInstance || !model || !annotation) return;
      const range = focusRange(annotation.target, model.getLineCount());
      if (range) {
        editorInstance.revealRangeInCenterIfOutsideViewport(
          range,
          monaco.editor.ScrollType.Smooth,
        );
        editorInstance.setSelection(range);
      }
    },
    [annotations],
  );

  const handleMount: OnMount = (editorInstance) => {
    editorRef.current = editorInstance;
    editorListenersRef.current?.dispose();
    mouseListenerRef.current?.dispose();
    editorListenersRef.current = subscribeToAnnotationEvents(
      editorInstance,
      schedulePositionUpdate,
    );
    mouseListenerRef.current = editorInstance.onMouseDown((event) => {
      const position = event.target.position;
      if (!position) return;
      const annotation = annotationAtPosition(
        annotationsRef.current,
        position.lineNumber,
        position.column,
      );
      if (annotation) selectAnnotation(annotation.id, false);
    });
    gitDecorationsRef.current = editorInstance.createDecorationsCollection();
    focusDecorationsRef.current = editorInstance.createDecorationsCollection();
    annotationDecorationsRef.current =
      editorInstance.createDecorationsCollection();
    monaco.editor.defineTheme("coduo-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "667085", fontStyle: "italic" },
        { token: "keyword", foreground: "C4B5FD" },
        { token: "string", foreground: "9DD274" },
        { token: "number", foreground: "F0B36D" },
        { token: "type", foreground: "78DCE8" },
      ],
      colors: {
        "editor.background": "#0d1017",
        "editor.foreground": "#c8ceda",
        "editorLineNumber.foreground": "#414756",
        "editorLineNumber.activeForeground": "#8d95a5",
        "editor.selectionBackground": "#6d5bd033",
        "editor.inactiveSelectionBackground": "#6d5bd018",
        "editor.lineHighlightBackground": "#ffffff05",
        "editorCursor.foreground": "#a99cf7",
        "editorIndentGuide.background1": "#252a35",
        "editorIndentGuide.activeBackground1": "#3f4655",
        "editorGutter.background": "#0d1017",
        "scrollbarSlider.background": "#8892a622",
        "scrollbarSlider.hoverBackground": "#8892a644",
      },
    });
    monaco.editor.setTheme("coduo-dark");
    applyDecorations();
    setIsEditorMounted(true);
  };

  // コードナビゲーションは Monaco 全体への登録なので、エディタ mount 後に
  // ファイル一覧と索引が揃った時点で 1 回だけ install する。
  useEffect(() => {
    if (!isEditorMounted || navigationFiles.length === 0 || !symbolIndex) {
      return;
    }
    const navigation = installCodeNavigation({
      files: navigationFiles,
      symbolIndex,
      onOpenLocation: (target) => onOpenLocationRef.current(target),
    });
    return () => navigation.dispose();
  }, [isEditorMounted, navigationFiles, symbolIndex]);

  // 定義ジャンプで別ファイルを開いたら、対象位置まで表示を移す
  // （review の focusDecoration は付けず、選択と表示位置だけを移す）。
  useEffect(() => {
    const editorInstance = editorRef.current;
    const model = editorInstance?.getModel();
    if (!editorInstance || !model || !jumpTarget) {
      return;
    }
    if (filePath !== jumpTarget.file) {
      return;
    }
    const range = focusRange(jumpTarget, model.getLineCount());
    if (range) {
      editorInstance.revealRangeInCenter(range, monaco.editor.ScrollType.Smooth);
      editorInstance.setSelection(range);
    }
  }, [filePath, jumpTarget, jumpToken]);

  useEffect(() => {
    setSelectedAnnotationId(annotations[0]?.id);
  }, [focusToken, annotations]);
  useEffect(() => {
    applyDecorations();
  }, [applyDecorations, filePath, focusToken]);
  useEffect(() => {
    const editorInstance = editorRef.current;
    const model = editorInstance?.getModel();
    const range = model ? focusRange(focus, model.getLineCount()) : undefined;
    if (editorInstance && range) {
      editorInstance.revealRangeInCenter(
        range,
        monaco.editor.ScrollType.Smooth,
      );
      editorInstance.setSelection(range);
    }
  }, [filePath, focus, focusToken]);
  useEffect(
    () => () => {
      editorListenersRef.current?.dispose();
      mouseListenerRef.current?.dispose();
      if (animationFrameRef.current !== undefined)
        window.cancelAnimationFrame(animationFrameRef.current);
      gitDecorationsRef.current?.clear();
      focusDecorationsRef.current?.clear();
      annotationDecorationsRef.current?.clear();
    },
    [],
  );

  return {
    anchors,
    handleMount,
    selectAnnotation,
    selectedAnnotationId,
    viewport,
  };
}
