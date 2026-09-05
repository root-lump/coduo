// アプリ全体のオーケストレーション。
// module 間をまたぐ配線（snapshot の自動展開・Tour の自動読み込み・
// レビューのフォーカス追従）を持ち、App.tsx はこの controller の結果を描画するだけにする。
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CodeJump,
  CodeTarget,
  ReviewMode,
  ReviewRequest,
} from "../modules/review";
import {
  parentScopeOf,
  scopeOf,
  useAgentReview,
  useReviewController,
} from "../modules/review";
import type { FileContent, FileReference } from "../modules/workspace";
import { parseFileReference, useWorkspace } from "../modules/workspace";
import type { SymbolIndex } from "../shared/snapshot/SymbolIndex";
import { usePanelSizing } from "../modules/layout";
import {
  definitionsFor,
  loadCodeNavigationIndex,
  shouldOfferDiff,
  type SymbolLocation,
  type ViewMode,
} from "../modules/viewer";
import type { JumpView } from "../modules/viewer/ui/CodeViewer";
import { useZoom } from "../modules/zoom";
import type { AppServices } from "./composition";
import type { InitialView } from "./initialViewFor";

export function useAppController(
  services: AppServices,
  initialMode: ReviewMode,
  initialView: InitialView,
) {
  const workspace = useWorkspace(services.workspaceGateway);
  const zoom = useZoom(services.webviewZoom);
  const agentReview = useAgentReview(
    services.reviewGateway,
    workspace.snapshot,
    workspace.selectionId,
  );
  const tour = agentReview.tour;
  const review = useReviewController(tour);
  const targetFile = review.resolvedStep?.file;
  const snapshot = workspace.snapshot;

  // snapshot は起動時に自動で展開する（ローカルピッカーは存在しない）。
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) {
      return;
    }
    opened.current = true;
    if (initialMode === "file") {
      void workspace.selectFile();
    } else {
      void workspace.selectDirectory();
    }
  }, [initialMode, workspace.selectDirectory, workspace.selectFile]);

  // Tour は生成時に埋め込み済みのため、workspace が開いたら自動で読み込む。
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !snapshot) {
      return;
    }
    if (initialMode === "file" && !workspace.activeFile?.path) {
      return; // initialFile の展開を待つ
    }
    autoStarted.current = true;
    generate(initialMode);
    // generate はレンダーごとに再生成されるが、autoStarted ガードで 1 回に固定する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode, snapshot, workspace.activeFile?.path]);

  // レビューのフォーカスが移ったら、対象ファイルをビューアで開き直す。
  useEffect(() => {
    if (!review.isExploring && targetFile) {
      void workspace.openFile(targetFile, { refresh: true });
    }
  }, [review.focusToken, review.isExploring, targetFile, workspace.openFile]);

  const selectFileManually = (path: string) => {
    review.markExploring();
    void workspace.openFile(path);
  };

  // コードナビゲーション用に、readable な全ファイルの本文（peek 表示の model 生成用）と
  // 宣言索引を一度ずつ読む。取得失敗時は空のままにし、ナビゲーションが無効になる
  // だけで画面は壊さない。
  const [navigationFiles, setNavigationFiles] = useState<FileContent[]>([]);
  const [symbolIndex, setSymbolIndex] = useState<SymbolIndex | null>(null);
  const hasSnapshot = Boolean(snapshot);
  useEffect(() => {
    if (!hasSnapshot) {
      return;
    }
    let disposed = false;
    setNavigationFiles([]);
    setSymbolIndex(null);
    services.workspaceGateway.listFileContents().then(
      (files) => {
        if (!disposed) {
          setNavigationFiles(files);
        }
      },
      () => undefined,
    );
    services.workspaceGateway.loadSymbolIndex().then(
      (index) => {
        if (!disposed) {
          setSymbolIndex(index);
        }
      },
      () => undefined,
    );
    return () => {
      disposed = true;
    };
  }, [hasSnapshot, services.workspaceGateway, workspace.selectionId]);

  // 定義ジャンプによる別ファイルへの遷移。手動選択と同じく「探索中」へ移す。
  const [jump, setJump] = useState<{ target?: CodeTarget; token: number }>({
    token: 0,
  });
  const jumpToLocation = (target: CodeTarget) => {
    review.markExploring();
    void workspace.openFile(target.file);
    setJump((current) => ({ target, token: current.token + 1 }));
  };

  // 説明文中のファイル参照（`path` / `path:行`）。行指定があれば定義ジャンプと同じ
  // 経路で位置まで移し、無ければ手動選択と同じくファイルを開くだけにする。
  const filePaths = useMemo(
    () => new Set(snapshot?.files.map((file) => file.path) ?? []),
    [snapshot],
  );
  const resolveFileReference = (text: string) =>
    parseFileReference(text, filePaths);
  const openFileReference = (reference: FileReference) => {
    if (reference.range) {
      jumpToLocation({ file: reference.file, range: reference.range });
    } else {
      selectFileManually(reference.file);
    }
  };

  const generate = (mode: ReviewMode) => {
    void (async () => {
      let request: ReviewRequest;
      if (mode === "file") {
        const path = workspace.activeFile?.path;
        if (!path) {
          return;
        }
        const refreshedFile = await workspace.openFile(path, { refresh: true });
        if (!refreshedFile || refreshedFile.unavailableReason) {
          return;
        }
        request = { kind: "file", path: refreshedFile.path };
      } else {
        request = { kind: mode };
      }
      agentReview.generate(request);
    })();
  };

  const retry = () => {
    void (async () => {
      const request = agentReview.request;
      if (request?.kind === "file") {
        const refreshedFile = await workspace.openFile(request.path, {
          refresh: true,
        });
        if (!refreshedFile || refreshedFile.unavailableReason) {
          return;
        }
      }
      agentReview.retry();
    })();
  };

  // 差分モードはファイルを切り替えても Tour のステップを移動しても保つ
  // （変更ファイルを続けて見るとき、ファイルごとに押し直さずに済む）。
  // 初期値は payload の出自から決まる（initialViewFor）。
  // 差分を出せないファイルでは表示側がコードモードへ落ちる。
  const [viewMode, setViewMode] = useState<ViewMode>(initialView.viewMode);
  const [renderSideBySide, setRenderSideBySide] = useState(
    initialView.renderSideBySide,
  );

  // ---- 描画用の導出値 ----
  const activeChange = snapshot?.changes.find(
    (change) => change.path === workspace.activeFile?.path,
  );
  const canShowDiff = shouldOfferDiff({
    baseText: workspace.activeBaseText,
    headText: workspace.activeFile?.content,
  });
  const effectiveViewMode: ViewMode = canShowDiff ? viewMode : "code";
  const activeFocus =
    !review.isExploring && workspace.activeFile?.path === targetFile
      ? review.resolvedStep?.focus
      : undefined;
  const codeAnnotations =
    agentReview.status === "ready" && activeFocus
      ? (review.resolvedStep?.annotations ?? [])
      : [];
  // ジャンプ（識別子から定義へ）。今いる範囲（scope）はステップの対象か、開いている
  // ジャンプの定義。ジャンプを開いている間は下段に定義のファイルを出すが、
  // workspace.activeFile（ツリーの選択）は動かさない。本文は起動時に一括取得した
  // navigationFiles から引く（workspace.openFile は表示中ファイルを切り替えてしまう）。
  const scope = scopeOf(review.currentStep, review.jumpPath);
  const parentScope = parentScopeOf(review.currentStep, review.jumpPath);
  const activeJump: CodeJump | undefined =
    review.jumpPath[review.jumpPath.length - 1];
  const navigationIndex = useMemo(
    () => (symbolIndex ? loadCodeNavigationIndex(symbolIndex) : undefined),
    [symbolIndex],
  );
  const fileNamed = (path: string | undefined) =>
    path ? navigationFiles.find((candidate) => candidate.path === path) : undefined;
  const jumpTargetFile = fileNamed(activeJump?.to.file);
  const jumpOriginFile = fileNamed(parentScope?.file);
  // 線の終点。飛び先の範囲内にある symbol の宣言（validate-tour が存在を保証する）。
  const definitionAnchor: SymbolLocation | undefined =
    activeJump && navigationIndex
      ? definitionsFor(navigationIndex, activeJump.symbol).find(
          (location) =>
            location.path === activeJump.to.file &&
            location.lineNumber >= activeJump.to.range.startLine &&
            location.lineNumber <= activeJump.to.range.endLine,
        )
      : undefined;
  const jumpView: JumpView | undefined =
    activeJump && !review.isExploring && jumpTargetFile && jumpOriginFile
      ? {
          path: review.jumpPath,
          originFile: jumpOriginFile,
          from: activeJump.from,
          kind: activeJump.kind,
          anchor: definitionAnchor,
          rootLabel: targetFile?.split("/").pop() ?? "",
        }
      : undefined;
  const viewerFile = jumpView ? jumpTargetFile : workspace.activeFile;
  const viewerFocus: CodeTarget | undefined = jumpView
    ? activeJump?.to
    : activeFocus;
  const viewerAnnotations = jumpView ? [] : codeAnnotations;
  const viewerViewMode: ViewMode = jumpView ? "code" : effectiveViewMode;
  // 今いる範囲のジャンプは、ツアーに追従していて、表示中のファイルがその範囲のファイル
  // のときだけ枠を出す。
  const viewerJumps: CodeJump[] =
    !review.isExploring && scope && viewerFile?.path === scope.file
      ? scope.jumps
      : [];
  const hasReviewNavigation =
    agentReview.status === "ready" && tour.steps.length > 0;
  const panelSizing = usePanelSizing(snapshot?.selectionKind === "directory");

  return {
    workspace,
    zoom,
    panelSizing,
    review,
    agentReview,
    tour,
    actions: {
      retry,
      selectFileManually,
      jumpToLocation,
      openFileReference,
      openJump: review.openJump,
      jumpBack: review.backToDepth,
      toggleViewMode: () =>
        setViewMode((current) => (current === "code" ? "diff" : "code")),
      toggleSideBySide: () => setRenderSideBySide((current) => !current),
    },
    derived: {
      activeChange,
      canShowDiff,
      renderSideBySide,
      viewMode: effectiveViewMode,
      activeFocus,
      codeAnnotations,
      viewerFile,
      viewerFocus,
      viewerAnnotations,
      viewerViewMode,
      viewerJumps,
      jumpView,
      hasReviewNavigation,
      navigationFiles,
      symbolIndex,
      resolveFileReference,
      jumpTarget: jump.target,
      jumpToken: jump.token,
    },
  };
}

export type AppController = ReturnType<typeof useAppController>;
