// collect / add-tour が共有する小道具。
// 収集の別モード（例: ハイブリッド収集）を書くときに複製しなくて済むよう、
// ファイル分類・payload 部品・patch 解析もここから export する。
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";

export function fail(message, exitCode = 1) {
  console.error(`coduo: ${message}`);
  process.exit(exitCode);
}

/** キー順を固定した決定的 JSON.stringify。 */
export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export const MAX_FILE_BYTES = 2_000_000; // viewer の too-large 閾値

export const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "icns", "pdf", "zip", "gz",
  "tar", "jar", "class", "so", "dylib", "dll", "exe", "woff", "woff2", "ttf",
  "otf", "eot", "mp3", "mp4", "mov", "webm", "wasm", "sqlite", "db",
]);

// fail closed 用の secret パターン（誤検出よりも取りこぼし防止を優先）
export const SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key block"],
  [/\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}/, "GitHub token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key id"],
  [/\bsk-[A-Za-z0-9_-]{20,}/, "API secret key (sk-...)"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
];

export const LANGUAGE_BY_EXTENSION = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  mjs: "javascript", cjs: "javascript", rs: "rust", py: "python", go: "go",
  java: "java", kt: "kotlin", c: "cpp", h: "cpp", cc: "cpp", cpp: "cpp",
  hpp: "cpp", cs: "csharp", rb: "ruby", php: "php", swift: "swift",
  md: "markdown", markdown: "markdown", yml: "yaml", yaml: "yaml",
  sh: "shell", bash: "shell", zsh: "shell", sql: "sql", css: "css",
  html: "html", htm: "html", xml: "xml", svg: "xml", json: "json",
  toml: "ini", lock: "plaintext",
  graphql: "graphql", graphqls: "graphql",
};

export function classifyReadability(path, size, bytes) {
  if (size > MAX_FILE_BYTES) return "too-large";
  const ext = extname(path).slice(1).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return "binary";
  if (bytes && bytes.includes(0)) return "binary";
  return "readable";
}

export function repositoryFile(path, size, readability) {
  const ext = extname(path).slice(1);
  return {
    path,
    name: basename(path),
    extension: ext === "" ? null : ext,
    size,
    readability,
  };
}

// 手書きテーブルに無い拡張子・ファイル名は、generate-languages.mjs が書き出した
// Monaco 由来の索引で補う。ここで言語 ID が付けば、embed-snapshot.mjs が対応する
// 文法を Artifact へ自動で埋め込む。
const languageManifest = (() => {
  try {
    return JSON.parse(
      readFileSync(
        new URL("../assets/languages/manifest.json", import.meta.url),
        "utf8",
      ),
    );
  } catch {
    return { extensionToId: {}, filenameToId: {} };
  }
})();

export function fileContent(path, text) {
  const ext = extname(path).slice(1).toLowerCase();
  return {
    path,
    content: text,
    language:
      LANGUAGE_BY_EXTENSION[ext] ??
      languageManifest.filenameToId[basename(path)] ??
      languageManifest.extensionToId[ext] ??
      "plaintext",
    lineCount: text.split("\n").length - (text.endsWith("\n") ? 1 : 0) || 1,
  };
}

export function scanSecrets(path, text) {
  const hits = [];
  for (const [pattern, label] of SECRET_PATTERNS) {
    if (pattern.test(text)) hits.push(`${path}: ${label}`);
  }
  return hits;
}

/**
 * unified diff から hunk 部分だけを取り出す（差分ヘッダを落とす）。
 * viewer は head 全文にこれを逆適用して base を復元するため、hunk が
 * 揃っていない patch（GitHub API が大きいファイルで patch を返さない等）は null。
 */
export function hunksFromPatch(patch) {
  if (!patch) return null;
  const start = patch.startsWith("@@") ? 0 : patch.indexOf("\n@@");
  if (start === -1) return null;
  const hunks = start === 0 ? patch : patch.slice(start + 1);
  return hunks.length > 0 ? hunks : null;
}

/** unified diff の patch から head 側の ChangedLine[] を得る。 */
export function changedLinesFromPatch(patch) {
  if (!patch) return [];
  const lines = [];
  let headLine = 0;
  let pendingDeletes = 0;
  for (const raw of patch.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      headLine = Number(hunk[1]);
      pendingDeletes = 0;
      continue;
    }
    if (raw.startsWith("+")) {
      lines.push({
        line: headLine,
        kind: pendingDeletes > 0 ? "modified" : "added",
      });
      if (pendingDeletes > 0) pendingDeletes -= 1;
      headLine += 1;
    } else if (raw.startsWith("-")) {
      pendingDeletes += 1;
    } else if (raw.startsWith(" ")) {
      if (pendingDeletes > 0) {
        // 削除だけのブロック: 直後の head 行に deleted マーカーを 1 つ置く
        lines.push({ line: headLine, kind: "deleted" });
        pendingDeletes = 0;
      }
      headLine += 1;
    }
  }
  if (pendingDeletes > 0) {
    lines.push({ line: Math.max(headLine, 1), kind: "deleted" });
  }
  return lines;
}
