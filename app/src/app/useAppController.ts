// アプリ全体のオーケストレーション。
// module 間をまたぐ配線（snapshot の自動展開・Tour の自動読み込み・
// レビューのフォーカス追従）を持ち、App.tsx はこの controller の結果を描画するだけにする。
import { useEffect, useRef, useState } from "react";
import type { CodeTarget, ReviewMode, ReviewRequest } from "../modules/review";
import { useAgentReview, useReviewController } from "../modules/review";
import type { FileContent } from "../modules/workspace";
import { useWorkspace } from "../modules/workspace";
import type { SymbolIndex } from "../shared/snapshot/SymbolIndex";
import { usePanelSizing } from "../modules/layout";
import { useZoom } from "../modules/zoom";
import type { AppServices } from "./composition";

export function useAppController(
  services: AppServices,
  initialMode: ReviewMode,
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

  // ---- 描画用の導出値 ----
  const activeChange = snapshot?.changes.find(
    (change) => change.path === workspace.activeFile?.path,
  );
  const activeFocus =
    !review.isExploring && workspace.activeFile?.path === targetFile
      ? review.resolvedStep?.focus
      : undefined;
  const codeAnnotations =
    agentReview.status === "ready" && activeFocus
      ? (review.resolvedStep?.annotations ?? [])
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
    },
    derived: {
      activeChange,
      activeFocus,
      codeAnnotations,
      hasReviewNavigation,
      navigationFiles,
      symbolIndex,
      jumpTarget: jump.target,
      jumpToken: jump.token,
    },
  };
}

export type AppController = ReturnType<typeof useAppController>;
