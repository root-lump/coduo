import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChangedLine,
  FileContent,
  RepositoryFile,
  RepositorySnapshot,
  WorkspaceSelection,
} from "../domain";
import type { WorkspaceGateway } from "../ports";
import { FileRequestCoordinator } from "./fileRequestCoordinator";

/** アクティブファイルの読み込み状態。 */
export type FileLoadState =
  | { phase: "unloaded" }
  | { phase: "loading"; path: string }
  | { phase: "ready"; file: FileContent }
  /** 表示できない（バイナリ・サイズ超過）。placeholder を保持する。 */
  | { phase: "unavailable"; file: FileContent }
  /** 読み込みが失敗した。 */
  | { phase: "failed"; file: FileContent; message: string };

/** ワークスペース全体の状態機械。不正な組み合わせは型で表現できない。 */
export type WorkspacePhase =
  | { phase: "no-selection" }
  | { phase: "selecting"; previous?: OpenedWorkspace }
  | OpenedWorkspace;

export type OpenedWorkspace = {
  phase: "opened";
  snapshot: RepositorySnapshot;
  activeFile: FileLoadState;
};

type OpenFileOptions = {
  refresh?: boolean;
};

function unavailableFile(file: RepositoryFile): FileContent | undefined {
  if (file.readability === "readable") {
    return undefined;
  }

  return {
    path: file.path,
    content: "",
    language: "plaintext",
    lineCount: 1,
    unavailableReason: file.readability,
  };
}

function loadedFileState(file: FileContent): FileLoadState {
  return file.unavailableReason
    ? { phase: "unavailable", file }
    : { phase: "ready", file };
}

/** UI が表示に使う FileContent（ready / unavailable / failed の placeholder）。 */
function visibleFile(state: FileLoadState): FileContent | undefined {
  switch (state.phase) {
    case "ready":
    case "unavailable":
    case "failed":
      return state.file;
    case "unloaded":
    case "loading":
      return undefined;
  }
}

export function useWorkspace(workspaceGateway: WorkspaceGateway) {
  const [state, setState] = useState<WorkspacePhase>({
    phase: "no-selection",
  });
  const [selectionId, setSelectionId] = useState(0);
  const [error, setError] = useState<string>();
  // 変更行はワークスペースを開いた時点では取得せず、アクティブファイルごとに
  // 遅延取得して選択中はキャッシュする（R07-D）。
  const [changedLinesByPath, setChangedLinesByPath] = useState<
    Record<string, ChangedLine[]>
  >({});
  const requests = useRef(new FileRequestCoordinator<FileContent>());

  const snapshot =
    state.phase === "opened"
      ? state.snapshot
      : state.phase === "selecting"
        ? state.previous?.snapshot
        : undefined;
  const fileState: FileLoadState =
    state.phase === "opened"
      ? state.activeFile
      : state.phase === "selecting" && state.previous
        ? state.previous.activeFile
        : { phase: "unloaded" };

  const setOpenedFile = useCallback((file: FileLoadState) => {
    setState((current) =>
      current.phase === "opened" ? { ...current, activeFile: file } : current,
    );
  }, []);

  const openFile = useCallback(
    async (path: string, options?: OpenFileOptions) => {
      if (!snapshot) {
        return undefined;
      }
      const cacheKey = `${snapshot.root}::${path}`;
      const request = requests.current.begin(cacheKey, !options?.refresh);
      const cached = request.cached;
      if (cached) {
        setOpenedFile(loadedFileState(cached));
        setError(undefined);
        return cached;
      }

      const unavailable = snapshot.files.find((file) => file.path === path);
      const placeholder = unavailable
        ? unavailableFile(unavailable)
        : undefined;
      if (placeholder) {
        requests.current.complete(request.id, cacheKey, placeholder);
        setOpenedFile({ phase: "unavailable", file: placeholder });
        setError(undefined);
        return placeholder;
      }

      setOpenedFile({ phase: "loading", path });
      setError(undefined);
      try {
        const file = await workspaceGateway.readFile(path);
        if (requests.current.complete(request.id, cacheKey, file)) {
          setOpenedFile(loadedFileState(file));
          return file;
        }
        return undefined;
      } catch (cause) {
        if (requests.current.isCurrent(request.id)) {
          const message =
            cause instanceof Error ? cause.message : String(cause);
          setOpenedFile({
            phase: "failed",
            message,
            file: {
              path,
              content: "",
              language: "plaintext",
              lineCount: 1,
              unavailableReason: "error",
              unavailableMessage: message,
            },
          });
          setError(message);
        }
        return undefined;
      }
    },
    [setOpenedFile, snapshot, workspaceGateway],
  );

  const applySelection = useCallback((selection: WorkspaceSelection) => {
    requests.current.clear();
    setChangedLinesByPath({});
    setSelectionId((current) => current + 1);

    let activeFile: FileLoadState = { phase: "unloaded" };
    if (selection.initialFile) {
      const key = `${selection.snapshot.root}::${selection.initialFile.path}`;
      const request = requests.current.begin(key);
      requests.current.complete(request.id, key, selection.initialFile);
      activeFile = loadedFileState(selection.initialFile);
    } else if (selection.snapshot.selectionKind === "file") {
      const firstFile = selection.snapshot.files[0];
      const placeholder = firstFile ? unavailableFile(firstFile) : undefined;
      if (placeholder) {
        activeFile = { phase: "unavailable", file: placeholder };
      }
    }
    setState({ phase: "opened", snapshot: selection.snapshot, activeFile });
  }, []);

  const select = useCallback(
    async (picker: () => Promise<WorkspaceSelection | null>) => {
      setState((current) => ({
        phase: "selecting",
        previous: current.phase === "opened" ? current : undefined,
      }));
      setError(undefined);
      try {
        const selection = await picker();
        if (!selection) {
          // 選択がキャンセルされたら元のワークスペースへ戻る。
          setState((current) =>
            current.phase === "selecting"
              ? (current.previous ?? { phase: "no-selection" })
              : current,
          );
          return false;
        }

        applySelection(selection);
        return true;
      } catch (cause) {
        setState((current) =>
          current.phase === "selecting"
            ? (current.previous ?? { phase: "no-selection" })
            : current,
        );
        setError(cause instanceof Error ? cause.message : String(cause));
        return false;
      }
    },
    [applySelection, workspaceGateway],
  );

  const selectDirectory = useCallback(
    () => select(() => workspaceGateway.selectDirectory()),
    [select, workspaceGateway],
  );
  const selectFile = useCallback(
    () => select(() => workspaceGateway.selectFile()),
    [select, workspaceGateway],
  );

  const activeFile = visibleFile(fileState);
  const activePath =
    fileState.phase === "loading" ? fileState.path : activeFile?.path;
  const activeIsChanged = Boolean(
    snapshot?.isGitRepository &&
    snapshot.selectionKind === "directory" &&
    activePath &&
    snapshot.changes.some((change) => change.path === activePath),
  );
  useEffect(() => {
    if (!activePath || !activeIsChanged) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(changedLinesByPath, activePath)) {
      return;
    }
    let disposed = false;
    void workspaceGateway.loadChangedLines(activePath).then(
      (lines) => {
        if (!disposed) {
          setChangedLinesByPath((current) => ({
            ...current,
            [activePath]: lines,
          }));
        }
      },
      () => {
        // 変更行はビューアの補助表示なので、取得失敗で画面を壊さない。
      },
    );
    return () => {
      disposed = true;
    };
  }, [activePath, activeIsChanged, changedLinesByPath, workspaceGateway]);

  const dismissError = useCallback(() => setError(undefined), []);

  return {
    /** 状態機械そのもの。新しい UI はこちらを使う。 */
    state,
    fileState,
    activeChangedLines: activePath
      ? (changedLinesByPath[activePath] ?? [])
      : [],
    activeFile,
    dismissError,
    error,
    isLoading: state.phase === "selecting" || fileState.phase === "loading",
    openFile,
    selectDirectory,
    selectFile,
    selectionId,
    snapshot,
    isSelecting: state.phase === "selecting",
    isLoadingFile: fileState.phase === "loading",
  };
}
