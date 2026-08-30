import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RepositoryFile } from "../domain";

export type FileTreeNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  children: FileTreeNode[];
};

export function buildFileTree(files: RepositoryFile[]): FileTreeNode[] {
  const root: FileTreeNode = {
    name: "",
    path: "",
    type: "folder",
    children: [],
  };

  for (const file of files) {
    const segments = file.path.split("/").filter(Boolean);
    let parent = root;
    segments.forEach((segment, index) => {
      const path = segments.slice(0, index + 1).join("/");
      const type = index === segments.length - 1 ? "file" : "folder";
      let node = parent.children.find(
        (candidate) => candidate.name === segment && candidate.type === type,
      );
      if (!node) {
        node = { name: segment, path, type, children: [] };
        parent.children.push(node);
      }
      parent = node;
    });
  }

  const sort = (nodes: FileTreeNode[]) => {
    nodes.sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === "folder" ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
    nodes.forEach((node) => sort(node.children));
  };
  sort(root.children);
  return root.children;
}

/** path の祖先フォルダを浅い順に列挙する（path 自身は含まない）。 */
export function ancestorFolders(path: string): string[] {
  const segments = path.split("/").filter(Boolean);
  return segments
    .slice(0, -1)
    .map((_, index) => segments.slice(0, index + 1).join("/"));
}

type FileTreeProps = {
  activePath?: string;
  files: RepositoryFile[];
  onSelect(path: string): void;
};

type TreeNodesProps = {
  nodes: FileTreeNode[];
  activePath?: string;
  expanded: ReadonlySet<string>;
  onSelect(path: string): void;
  onToggle(path: string): void;
};

function TreeFile({
  node,
  isActive,
  onSelect,
}: {
  node: FileTreeNode;
  isActive: boolean;
  onSelect(path: string): void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (isActive) {
      // 自動展開の直後にアクティブ行が視界の外にあることが多い。
      // scrollIntoView は jsdom に無いため optional call にしている。
      ref.current?.scrollIntoView?.({ block: "nearest" });
    }
  }, [isActive]);
  return (
    <button
      type="button"
      ref={ref}
      className={`tree-row tree-file ${isActive ? "is-active" : ""}`}
      onClick={() => onSelect(node.path)}
      title={node.path}
    >
      <span className="file-icon" aria-hidden="true">
        ‹›
      </span>
      <span>{node.name}</span>
    </button>
  );
}

function TreeNodes({
  nodes,
  activePath,
  expanded,
  onSelect,
  onToggle,
}: TreeNodesProps) {
  return (
    <ul className="file-tree-list">
      {nodes.map((node) =>
        node.type === "folder" ? (
          <li key={`folder-${node.path}`}>
            <button
              type="button"
              className="tree-row tree-folder"
              aria-expanded={expanded.has(node.path)}
              onClick={() => onToggle(node.path)}
            >
              <span className="disclosure" aria-hidden="true">
                ›
              </span>
              <span className="folder-icon" aria-hidden="true" />
              <span>{node.name}</span>
            </button>
            {expanded.has(node.path) && (
              <TreeNodes
                nodes={node.children}
                activePath={activePath}
                expanded={expanded}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            )}
          </li>
        ) : (
          <li key={node.path}>
            <TreeFile
              node={node}
              isActive={activePath === node.path}
              onSelect={onSelect}
            />
          </li>
        ),
      )}
    </ul>
  );
}

export function FileTree({ activePath, files, onSelect }: FileTreeProps) {
  const nodes = useMemo(() => buildFileTree(files), [files]);
  // フォルダは初期状態ですべて閉じる。アクティブファイルの祖先だけを自動で開く
  // （Tour のステップ移動で開いたファイルも追従する）。手動で閉じた場合は
  // アクティブファイルが変わるまで尊重する。
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!activePath) {
      return;
    }
    setExpanded((current) => {
      const missing = ancestorFolders(activePath).filter(
        (folder) => !current.has(folder),
      );
      if (missing.length === 0) {
        return current;
      }
      const next = new Set(current);
      for (const folder of missing) {
        next.add(folder);
      }
      return next;
    });
  }, [activePath]);
  const toggle = useCallback((path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  if (!nodes.length) {
    return <p className="panel-empty">読み取り可能なファイルがありません。</p>;
  }
  return (
    <TreeNodes
      nodes={nodes}
      activePath={activePath}
      expanded={expanded}
      onSelect={onSelect}
      onToggle={toggle}
    />
  );
}
