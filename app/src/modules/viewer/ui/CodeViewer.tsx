// コードビューアの view。Monaco のライフサイクルは useMonacoViewer が持ち、
// ここでは placeholder / エディタ / 注釈レイヤの表示だけを組み立てる。
// ジャンプを開いているときは、参照元（FlowOriginPane）を上段に積んで最大 3 段にする。
import Editor, { DiffEditor } from "@monaco-editor/react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useState,
  type CSSProperties,
} from "react";
import type { editor } from "monaco-editor";
import type {
  CodeAnnotation,
  CodeJump,
  CodeRange,
  CodeTarget,
  JumpKind,
} from "../../review";
import type { ChangedLine, FileContent, FileReference } from "../../workspace";
import type { SymbolIndex } from "../../../shared/snapshot/SymbolIndex";
import type { SymbolLocation } from "../codeNavigation";
import type { ViewMode } from "../diffView";
import { PANE_LABELS } from "../flowLabels";
import { pruneCollapsed, toggleCollapsed } from "../paneCollapse";
import {
  EMPTY_PANE_TRANSITION,
  PANE_TRANSITION_MS,
  renderedOrigins,
  settleLeaving,
  transitionPanes,
  type PaneTransition,
} from "../paneTransition";
import { languageFromPath } from "../language";
import { unavailableMessageFor } from "../unavailableMessage";
import { CODUO_THEME } from "../monacoEnvironment";
import {
  CodeAnnotationRail,
  shouldRenderCodeAnnotations,
} from "./CodeAnnotationRail";
import { SHARED_EDITOR_OPTIONS } from "./editorOptions";
import { FlowLink } from "./FlowConnector";
import { FlowOriginPane } from "./FlowOriginPane";
import { JumpPathBar } from "./JumpPathBar";
import { useAnnotationRailSizing } from "./useAnnotationRailSizing";
import { useMonacoViewer } from "./useMonacoViewer";

/**
 * 分割表示に出す上段の最大数。表示はステップの範囲 + 2 段のジャンプまで（下段を
 * 含めて 3 段）。Tour は深さ 3 まで入れ子にできるが、4 段を縦に積むと 1 段あたりの
 * 高さが読めないほど減るので、深さ 3 では最も古い段をパンくずだけに残す。
 */
export const MAX_VISIBLE_ORIGINS = 2;

// jumpView が無いときの上段の列。描画ごとに [] を作ると前回値との比較が毎回変化になる。
const NO_ORIGINS: JumpOriginView[] = [];

/** 分割表示の上段 1 つ分。下段の直上まで深さの昇順で並ぶ。 */
export type JumpOriginView = {
  /** この段の深さ。折りたたみのキーと、この段からジャンプを開くときの openJumpAt の引数。 */
  depth: number;
  file: FileContent;
  /** この段から 1 つ下の段を開いたジャンプの参照元の式。線の始点。 */
  from: CodeRange;
  kind: JumpKind;
  /** この段に保つ範囲（ステップの対象か、1 つ上のジャンプの飛び先）。 */
  focus: CodeTarget;
  annotations: CodeAnnotation[];
  jumps: CodeJump[];
  /** 変更行。この段のファイルが表示中ファイルと同じときだけ非空。 */
  changedLines: ChangedLine[];
  /** この段の定義の識別子（深さ 0 は無し）。1 つ上の段からの線の終点。 */
  anchor?: SymbolLocation;
};

/** 開いているジャンプの表示に要るもの。無ければ 1 面表示。 */
export type JumpView = {
  /** 開いているジャンプの列。末尾が今見ている定義。 */
  path: CodeJump[];
  /** 上段の列（最大 MAX_VISIBLE_ORIGINS 件）。 */
  origins: JumpOriginView[];
  /** 末尾のジャンプの種類。外枠の色に使う。 */
  kind: JumpKind;
  /** 下段の定義の識別子。末尾の線の終点。 */
  anchor?: SymbolLocation;
  /** パンくずの先頭（ステップの対象ファイルの表示名）。 */
  rootLabel: string;
};

/**
 * 分割表示の grid の行定義。パンくず 1 行と、段ごとに「ヘッダー + 本体」の 2 行。
 * 上段の本体は 45fr、下段は 55fr。畳んだ段の本体は 0fr（ヘッダーだけ残る）。
 * collapsedIndexes は段の並び順（0 始まり、末尾が下段）の集合。
 */
export function splitGridRows(
  paneCount: number,
  collapsedIndexes: ReadonlySet<number>,
): string {
  const rows = ["auto"];
  for (let index = 0; index < paneCount; index++) {
    const weight = index === paneCount - 1 ? 55 : 45;
    const body = collapsedIndexes.has(index) ? 0 : weight;
    rows.push("auto", `minmax(0, ${body}fr)`);
  }
  return rows.join(" ");
}

type PaneBarProps = {
  depth: number;
  path: string;
  label: string;
  /** 上段だけ。役割ラベルの色を、その段から出るジャンプの種類に合わせる。 */
  kind?: JumpKind;
  collapsed: boolean;
  /** 折りたたむ本体の要素の id。 */
  controls: string;
  onToggle(depth: number): void;
  /** 入退場中の段。ヘッダーの高さを 0 との間で伸縮させる。 */
  transition?: "entering" | "leaving";
};

/** 段のヘッダー。クリックでその段の本体を折りたたむ。 */
function PaneBar({
  depth,
  path,
  label,
  kind,
  collapsed,
  controls,
  onToggle,
  transition,
}: PaneBarProps) {
  const className = [
    "flow-pane-bar",
    kind ? `flow-pane-bar--origin flow-kind-${kind}` : "flow-pane-bar--target",
    collapsed ? "is-collapsed" : "",
    transition ? `is-${transition}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={className}
      aria-expanded={!collapsed}
      aria-controls={controls}
      // 退場中の段は消えるだけなので、畳む操作を受けない。
      onClick={() => {
        if (transition !== "leaving") onToggle(depth);
      }}
    >
      <span className="flow-pane-path">{path}</span>
      <span className="flow-pane-role">{label}</span>
    </button>
  );
}

type CodeViewerProps = {
  annotations: CodeAnnotation[];
  /** 差分モードで左側に出す変更前の全文。復元できていなければ undefined。 */
  baseText?: string;
  changedLines: ChangedLine[];
  file?: FileContent;
  focus?: CodeTarget;
  focusToken: number;
  isLoading: boolean;
  navigationFiles: FileContent[];
  symbolIndex: SymbolIndex | null;
  onOpenLocation(target: CodeTarget): void;
  /** 注釈本文のインラインコードをファイル参照として解釈する。 */
  resolveFileReference(text: string): FileReference | undefined;
  onOpenFileReference(reference: FileReference): void;
  jumpTarget?: CodeTarget;
  jumpToken: number;
  /** 差分モードで変更前後を左右に並べるか（false なら 1 画面に混ぜて出す）。 */
  renderSideBySide: boolean;
  viewMode: ViewMode;
  /** 今いる範囲のジャンプ（file 内の式）。クリックで定義へ飛ぶ印を出す。 */
  jumps: CodeJump[];
  onOpenJump(jump: CodeJump): void;
  jumpView?: JumpView;
  /** 深さ depth の上段のジャンプを開く。それより深い段がそれに置き換わる。 */
  onOpenOriginJump(depth: number, jump: CodeJump): void;
  onJumpBack(depth: number): void;
};

export { shouldRenderCodeAnnotations };

export function CodeViewer({
  annotations,
  baseText,
  changedLines,
  file,
  focus,
  focusToken,
  isLoading,
  navigationFiles,
  symbolIndex,
  onOpenLocation,
  resolveFileReference,
  onOpenFileReference,
  jumpTarget,
  jumpToken,
  renderSideBySide,
  viewMode,
  jumps,
  onOpenJump,
  jumpView,
  onOpenOriginJump,
  onJumpBack,
}: CodeViewerProps) {
  const [dismissedFocusToken, setDismissedFocusToken] = useState<number>();
  // 注釈レールの幅とレイアウトの基準。分割表示では下段のペインを指す。
  const [viewerElement, setViewerElement] = useState<HTMLDivElement | null>(
    null,
  );
  const [shellElement, setShellElement] = useState<HTMLDivElement | null>(
    null,
  );
  // 上段のエディタ実体を深さごとに持つ。連結線が隣り合う段の座標を引くのに使う。
  const [originEditors, setOriginEditors] = useState<
    ReadonlyMap<number, editor.ICodeEditor>
  >(new Map());
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(new Set());
  const jumpPath = jumpView?.path;
  const [prunedFor, setPrunedFor] = useState(jumpPath);
  // 長さでなく列そのものの変化で整理する。同じ深さで下段が置き換わったときも
  // 新しい定義を畳んだまま出さないため。effect で整理すると列が変わった最初の
  // 描画に古い折りたたみが 1 フレーム出るので、描画中に state を直す（React は
  // この描画結果を捨てて、確定前に描画し直す）。
  if (prunedFor !== jumpPath) {
    setPrunedFor(jumpPath);
    setCollapsed((current) => pruneCollapsed(current, jumpPath?.length ?? 0));
  }
  // 全部閉じた（jumpView が消えた）ときも上段が縮み終わるまで分割表示を保つため、
  // 最後に受け取った jumpView を持っておく。
  const [ghost, setGhost] = useState<JumpView>();
  if (jumpView && ghost !== jumpView) setGhost(jumpView);
  const originsNow = jumpView?.origins ?? NO_ORIGINS;
  const [previousOrigins, setPreviousOrigins] = useState(originsNow);
  const [transition, setTransition] = useState<PaneTransition<JumpOriginView>>(
    EMPTY_PANE_TRANSITION,
  );
  // 折りたたみの整理と同じく描画中に直す。effect で直すと、増減した段が 0fr を経ずに
  // 最初から本来の高さ（あるいは消えた状態）で 1 フレーム描かれ、transition が起きない。
  if (previousOrigins !== originsNow) {
    setPreviousOrigins(originsNow);
    setTransition((current) =>
      transitionPanes(previousOrigins, originsNow, current),
    );
  }
  // 入場中の段を 0fr で一度レイアウトさせてから本来の高さに戻す。スタイルを読んで
  // 0fr を確定させないと、ブラウザは 0fr を経ずに最終値だけを見て transition しない。
  // layout effect の更新は paint 前に同期で流れるので、0fr の段が画面に出ることはない。
  useLayoutEffect(() => {
    if (transition.entering.size === 0) return;
    shellElement?.getBoundingClientRect();
    setTransition((current) => ({ ...current, entering: new Set() }));
  }, [transition.entering, shellElement]);
  useEffect(() => {
    if (transition.leaving.size === 0) return;
    const timer = window.setTimeout(
      () => setTransition(settleLeaving),
      PANE_TRANSITION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [transition.leaving]);
  const view = jumpView ?? (transition.leaving.size > 0 ? ghost : undefined);
  const paneIdPrefix = useId();
  const paneIdOf = (depth: number) => `${paneIdPrefix}pane-${depth}`;
  const rail = useAnnotationRailSizing(viewerElement);
  const {
    anchors,
    editorInstance,
    handleDiffMount,
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
    jumps,
    definitionAnchor: jumpView?.anchor,
    onOpenJump,
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

  const language = file.language || languageFromPath(file.path);
  const showAnnotations = shouldRenderCodeAnnotations({
    annotationCount: annotations.length,
    dismissedFocusToken,
    focusToken,
    hasViewport: viewport.height > 0 && viewport.width > 0,
  });
  const viewerClassName = [
    "code-viewer",
    view ? "flow-pane flow-pane--target" : "",
    showAnnotations ? "has-code-annotations" : "",
    showAnnotations && rail.isNarrow ? "is-narrow-annotations" : "",
    rail.isResizing ? "is-resizing" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const viewerStyle = {
    "--annotation-rail-width": `${rail.width}px`,
  } as CSSProperties;
  const annotationLayer = showAnnotations ? (
    <CodeAnnotationRail
      anchors={anchors}
      annotations={annotations}
      viewport={viewport}
      selectedId={selectedAnnotationId}
      onSelect={(id) => selectAnnotation(id, true)}
      onClose={() => setDismissedFocusToken(focusToken)}
      onResizeStart={rail.startResize}
      resolveFileReference={resolveFileReference}
      onOpenFileReference={onOpenFileReference}
    />
  ) : null;

  // 差分モードでも注釈とフォーカス装飾は modified 側に付ける（useMonacoViewer）。
  // 変更行ガター装飾だけは Monaco の差分色と重なるため出さない。
  const editorElement =
    viewMode === "diff" && baseText !== undefined ? (
      <DiffEditor
        height="100%"
        original={baseText}
        modified={file.content}
        // 差分エディタは左右とも専用 URI のモデルを使い、コードモードの
        // モデルを共有しない。共有すると、モードを切り替えたときに片方の
        // unmount がもう片方の使っているモデルを破棄し、DiffEditorWidget が
        // 「reset 前に model が破棄された」と例外を投げる。
        originalModelPath={`file://coduo-diff-base/${file.path}`}
        modifiedModelPath={`file://coduo-diff-head/${file.path}`}
        // 専用モデルは破棄せず URI ごとに再利用する（破棄の順序に依存しない）。
        keepCurrentOriginalModel
        keepCurrentModifiedModel
        language={language}
        theme={CODUO_THEME}
        loading={
          <div className="viewer-loading">エディタを準備しています…</div>
        }
        onMount={handleDiffMount}
        options={{
          ...SHARED_EDITOR_OPTIONS,
          readOnly: true,
          originalEditable: false,
          renderSideBySide,
          // 変更のない範囲は畳んで、変わった箇所だけを追えるようにする。
          hideUnchangedRegions: { enabled: true },
          renderOverviewRuler: true,
          // 読み取り専用なので、行余白の revert アイコンと余白メニューは出さない。
          renderMarginRevertIcon: false,
          renderGutterMenu: false,
          minimap: { enabled: false },
        }}
      />
    ) : (
      <Editor
        height="100%"
        path={`file://${file.path}`}
        value={file.content}
        language={language}
        theme={CODUO_THEME}
        loading={
          <div className="viewer-loading">エディタを準備しています…</div>
        }
        onMount={handleMount}
        options={{
          ...SHARED_EDITOR_OPTIONS,
          minimap: {
            enabled: !showAnnotations,
            scale: 1,
            showSlider: "mouseover",
            maxColumn: 80,
          },
        }}
      />
    );

  // 下段（本体のエディタ）は 1 面でも 2 段でも同じ key の同じ要素にして、
  // ジャンプの開閉で Monaco を作り直さない（位置が変わると React は要素を捨てる）。
  // 全部閉じた直後に view（ghost）で描いている間も、下段の中身は props のまま
  // （ステップの対象）で、深さだけが古い列のものになる。
  const targetDepth = view?.path.length ?? 0;
  const targetCollapsed = view !== undefined && collapsed.has(targetDepth);
  const targetPane = (
    <div
      key="target"
      id={paneIdOf(targetDepth)}
      className={
        targetCollapsed ? `${viewerClassName} is-collapsed` : viewerClassName
      }
      ref={setViewerElement}
      style={viewerStyle}
    >
      <div className="code-editor-surface">
        {editorElement}
        {view && (
          // 下段の差し替えを見せる幕。下段の識別が変わるたびに key で作り直して
          // アニメーションを頭から再生する。editor に key を付けると Monaco ごと
          // 作り直すことになるので、幕だけを替える。
          <div
            key={`veil-${targetDepth}:${file.path}`}
            className="flow-target-veil"
            aria-hidden="true"
          />
        )}
      </div>
      {annotationLayer}
    </div>
  );

  if (!view) {
    return (
      <div
        className="code-viewer-shell"
        data-testid="code-viewer"
        ref={setShellElement}
      >
        {targetPane}
      </div>
    );
  }

  const origins = renderedOrigins(originsNow, transition.leaving);
  // 退場中の段の深さは今の列に無いので、深さだけで入場・退場を引ける。ただし下段と
  // 同じ深さになりうる（戻る操作）ので、下段には使わない。
  const originTransitionOf = (depth: number) =>
    transition.leaving.has(depth)
      ? ("leaving" as const)
      : transition.entering.has(depth)
        ? ("entering" as const)
        : undefined;
  // 入場・退場中の段は、行の上では畳んだ段と同じく本体を 0 にする。退場中の段は
  // 折りたたみ集合を見ない（同じ深さの下段の折りたたみを拾わないため）。
  const originShrunk = (depth: number) =>
    originTransitionOf(depth) !== undefined || collapsed.has(depth);
  // 入場と退場が同じ描画で起きる（3 段目のジャンプ）と track 数が変わり、grid は
  // 行定義を補間せずに切り替える。入場中の描画では退場中の段を直前の高さのまま描き、
  // 入場が確定した再描画（track 数が同じ）で 0fr に落として、伸縮を同時に補間させる。
  const originRowShrunk = (depth: number) =>
    transition.leaving.has(depth) && transition.entering.size > 0
      ? collapsed.has(depth)
      : originShrunk(depth);
  const toggle = (depth: number) =>
    setCollapsed((current) => toggleCollapsed(current, depth));
  const registerOriginEditor =
    (depth: number) => (instance: editor.ICodeEditor | undefined) =>
      setOriginEditors((current) => {
        if (current.get(depth) === instance) return current;
        const next = new Map(current);
        if (instance) next.set(depth, instance);
        else next.delete(depth);
        return next;
      });
  // 退場中の段からは線を引かないので実体は登録しない。unmount の通知だけは受けて、
  // 破棄されたエディタを連結線の参照に残さない。
  const unregisterOriginEditor =
    (depth: number) => (instance: editor.ICodeEditor | undefined) => {
      if (!instance) registerOriginEditor(depth)(undefined);
    };
  const ignoreJump = () => undefined;
  const paneDepths = [...origins.map((origin) => origin.depth), targetDepth];
  const collapsedIndexes = new Set(
    origins.flatMap((origin, index) =>
      originRowShrunk(origin.depth) ? [index] : [],
    ),
  );
  if (targetCollapsed) collapsedIndexes.add(origins.length);
  // 行数が段数で変わるので CSS に固定で書けない。畳んだ段は本体行を 0fr にする。
  const shellStyle: CSSProperties = {
    gridTemplateRows: splitGridRows(paneDepths.length, collapsedIndexes),
  };

  return (
    <div
      className={`code-viewer-shell code-viewer-split flow-kind-${view.kind}`}
      data-testid="code-viewer"
      ref={setShellElement}
      style={shellStyle}
    >
      <JumpPathBar
        key="path"
        rootLabel={view.rootLabel}
        path={view.path}
        onJumpBack={onJumpBack}
      />
      {origins.flatMap((origin) => {
        const paneTransition = originTransitionOf(origin.depth);
        const isLeaving = paneTransition === "leaving";
        // 戻る操作では退場中の段と下段が同じ深さになるので、id を分けて衝突を避ける。
        const paneId = isLeaving
          ? `${paneIdOf(origin.depth)}-leaving`
          : paneIdOf(origin.depth);
        const isCollapsed = !isLeaving && collapsed.has(origin.depth);
        return [
          <PaneBar
            key={`bar-${origin.depth}`}
            depth={origin.depth}
            path={origin.file.path}
            label={
              origin.depth === 0 ? PANE_LABELS.origin : PANE_LABELS.middle
            }
            kind={origin.kind}
            collapsed={isCollapsed}
            controls={paneId}
            onToggle={toggle}
            transition={paneTransition}
          />,
          // key を深さで固定し、ジャンプの列が変わっても同じ深さの段の Monaco を作り直さない。
          // 退場中になっても同じ key なので、縮む間は元の Monaco のまま描かれる。
          <FlowOriginPane
            key={`origin-${origin.depth}`}
            id={paneId}
            className={
              isLeaving ? "is-leaving" : isCollapsed ? "is-collapsed" : undefined
            }
            depth={origin.depth}
            file={origin.file}
            from={origin.from}
            kind={origin.kind}
            focus={origin.focus}
            annotations={origin.annotations}
            jumps={origin.jumps}
            changedLines={origin.changedLines}
            anchor={origin.anchor}
            focusToken={focusToken}
            onOpenJump={
              isLeaving
                ? ignoreJump
                : (jump) => onOpenOriginJump(origin.depth, jump)
            }
            rail={rail}
            resolveFileReference={resolveFileReference}
            onOpenFileReference={onOpenFileReference}
            onEditor={
              isLeaving
                ? unregisterOriginEditor(origin.depth)
                : registerOriginEditor(origin.depth)
            }
          />,
        ];
      })}
      <PaneBar
        key="target-bar"
        depth={targetDepth}
        path={file.path}
        label={PANE_LABELS.target}
        collapsed={targetCollapsed}
        controls={paneIdOf(targetDepth)}
        onToggle={toggle}
      />
      {targetPane}
      {origins.map((origin, index) => {
        const next = origins[index + 1];
        // 本体が 0 の段（畳んだ段、入退場中の段）には線の端点が見えないので引かない。
        const hidden =
          originShrunk(origin.depth) ||
          (next ? originShrunk(next.depth) : targetCollapsed);
        return (
          <FlowLink
            key={`link-${origin.depth}`}
            container={shellElement}
            topEditor={originEditors.get(origin.depth)}
            bottomEditor={next ? originEditors.get(next.depth) : editorInstance}
            from={origin.from}
            kind={origin.kind}
            anchor={next ? next.anchor : view.anchor}
            hidden={hidden}
          />
        );
      })}
    </div>
  );
}
