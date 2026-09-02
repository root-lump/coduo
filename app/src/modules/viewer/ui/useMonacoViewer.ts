// Monaco エディタのライフサイクル管理。
// エディタ実体・デコレーション・注釈アンカー位置の追従をここに閉じ込め、
// CodeViewer（view）は表示だけを担う。対象はコードエディタと、差分エディタの
// modified 側（変更後）のどちらでもよい。Tour の行番号は変更後のファイルを指す
// ため、original 側には何も付けない。
import { useCallback, useEffect, useRef, useState } from "react";
import type { editor } from "monaco-editor";
import type { DiffOnMount, OnMount } from "@monaco-editor/react";
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

type AttachOptions = {
  /** 注釈・装飾・reveal の対象。 */
  editorInstance: editor.ICodeEditor;
  /**
   * 注釈レイヤの幅の基準。差分の並べて表示では modified 側の layout 幅が
   * 右半分しか返さないため、差分エディタ全体の DOM を渡す。
   */
  surface: HTMLElement | null;
  /** エディタ標準の scroll / layout / model 以外で位置の再計算が要るイベント。 */
  extraListeners: Disposable[];
  /** 変更行ガター装飾を出すか。差分モードでは Monaco の差分色と重なるので出さない。 */
  paintChangedLines: boolean;
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
  const editorRef = useRef<editor.ICodeEditor | undefined>(undefined);
  const surfaceRef = useRef<HTMLElement | null>(null);
  const paintChangedLinesRef = useRef(true);
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
  // エディタ実体が入れ替わった（コード ⇄ 差分の切り替え）合図。
  // 新しいエディタにも装飾とフォーカス位置を付け直すため、効果の依存に加える。
  const [mountToken, setMountToken] = useState(0);

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
    const width = surfaceRef.current?.clientWidth ?? layout.width;
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
      current.height === layout.height && current.width === width
        ? current
        : { height: layout.height, width },
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
    gitDecorationsRef.current?.set(
      paintChangedLinesRef.current
        ? gitDecorations(changedLines, lineCount)
        : [],
    );
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

  // 選択を先に動かしてから reveal する。差分エディタの折り畳まれた未変更領域は
  // modified 側の選択が動いたときに展開されるため、逆順だと隠れた行への reveal が
  // 空振りする。
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
        editorInstance.setSelection(range);
        editorInstance.revealRangeInCenterIfOutsideViewport(
          range,
          monaco.editor.ScrollType.Smooth,
        );
      }
    },
    [annotations],
  );

  const attachEditor = ({
    editorInstance,
    surface,
    extraListeners,
    paintChangedLines,
  }: AttachOptions) => {
    editorRef.current = editorInstance;
    surfaceRef.current = surface;
    paintChangedLinesRef.current = paintChangedLines;
    editorListenersRef.current?.dispose();
    mouseListenerRef.current?.dispose();
    const standardListeners = subscribeToAnnotationEvents(
      editorInstance,
      schedulePositionUpdate,
    );
    editorListenersRef.current = {
      dispose: () => {
        standardListeners.dispose();
        extraListeners.forEach((listener) => listener.dispose());
      },
    };
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
    applyDecorations();
    setIsEditorMounted(true);
    setMountToken((current) => current + 1);
  };

  const handleMount: OnMount = (editorInstance) => {
    attachEditor({
      editorInstance,
      surface: editorInstance.getDomNode(),
      extraListeners: [],
      paintChangedLines: true,
    });
  };

  const handleDiffMount: DiffOnMount = (diffEditor) => {
    const modified = diffEditor.getModifiedEditor();
    attachEditor({
      editorInstance: modified,
      surface: diffEditor.getContainerDomNode(),
      // 差分計算の完了と未変更領域の折り畳み変化で行の位置が動く。
      extraListeners: [
        diffEditor.onDidUpdateDiff(schedulePositionUpdate),
        modified.onDidChangeHiddenAreas(schedulePositionUpdate),
      ],
      paintChangedLines: false,
    });
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
      editorInstance.setSelection(range);
      editorInstance.revealRangeInCenter(range, monaco.editor.ScrollType.Smooth);
    }
  }, [filePath, jumpTarget, jumpToken]);

  useEffect(() => {
    setSelectedAnnotationId(annotations[0]?.id);
  }, [focusToken, annotations]);
  useEffect(() => {
    applyDecorations();
  }, [applyDecorations, filePath, focusToken, mountToken]);
  useEffect(() => {
    const editorInstance = editorRef.current;
    const model = editorInstance?.getModel();
    const range = model ? focusRange(focus, model.getLineCount()) : undefined;
    if (editorInstance && range) {
      editorInstance.setSelection(range);
      editorInstance.revealRangeInCenter(
        range,
        monaco.editor.ScrollType.Smooth,
      );
    }
  }, [filePath, focus, focusToken, mountToken]);
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
    handleDiffMount,
    handleMount,
    selectAnnotation,
    selectedAnnotationId,
    viewport,
  };
}
