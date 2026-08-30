// Coduo snapshot collector（S3）。
// GitHub（公式 CLI `gh` = 利用者自身の認証）またはローカルディレクトリから
// 固定 revision のファイル群を収集し、CoduoSnapshotPayload v1（tours は空）を出力する。
//
//   node scripts/collect-snapshot.mjs --repo owner/repo [--ref <branch|sha>] --out payload.json
//   node scripts/collect-snapshot.mjs --pr owner/repo <number> [--from-local <dir>] --out payload.json
//   node scripts/collect-snapshot.mjs --local <dir> --out payload.json
//
// --fill-budget [bytes]: 容量超過を fail closed にせず、ファイルを PR との関連度で
// ランク付けし、上位から予算（既定 7.5MB）いっぱいまで本文を詰める。予算に
// 入らないファイルは飛ばして次へ進み、not-collected としてツリーに残る。
//
// --from-local <dir>: PR の本文を GitHub API ではなくローカル worktree から読む。
// <dir> の HEAD が PR の head SHA と一致し、未コミット変更が無いことを検証する
// （どちらか欠けると fail closed）。
//
// 収集範囲の制御（いずれも複数指定可・ツリーには常に全ファイルが載る）:
//   --include <path>        本文の収集対象を指定サブツリー（またはファイル）に限定する
//   --exclude-glob <glob>   glob に一致するパスの本文を収集しない（** / * / ? をサポート。
//                           "/" を含まないパターンはファイル名にも照合する）
//   --deny-content <path>   指定ファイルの本文だけを収集しない（secret 検出の回避手段。
//                           ツリーには名前が残る）
//
// 範囲外・上限超過などで本文を持たない readable ファイルは readability を
// "not-collected" にしてツリーへ載せる（viewer は「収集範囲外」と表示する）。
//
// 方針（SNAPSHOT_SKILL_IMPLEMENTATION_PLAN §8-9 準拠）:
// - すべてのファイル内容を exact SHA に固定して取得する
// - 容量超過・secret 検出は fail closed（無断で partial にしない）
// - 出力はパス昇順・キー順固定の決定的 JSON
import { execFileSync } from "node:child_process";
import {
  changedLinesFromPatch,
  classifyReadability,
  fail,
  fileContent,
  repositoryFile,
  scanSecrets,
  stableStringify,
} from "./lib.mjs";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";

const MAX_TOTAL_SOURCE_BYTES = 8_000_000; // 合意規模(1.5MB)の余裕枠。超過は fail closed
// --fill-budget の既定値。埋め込み後の HTML には別途 16MB の制限があり、
// template だけで約 3.4MB あるため、収集上限 8MB より少し絞って余裕を残す。
const FILL_BUDGET_DEFAULT = 7_500_000;
const EXCLUDED_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "target", ".next", ".venv",
  "__pycache__", ".worktrees", "vendor",
]);

function gh(path, ...flags) {
  try {
    return JSON.parse(
      execFileSync("gh", ["api", path, ...flags], {
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
      }),
    );
  } catch (cause) {
    fail(`gh api ${path} が失敗しました: ${cause.message?.split("\n")[0]}`);
  }
}

function collectGitHubTree(owner, repo, sha) {
  const tree = gh(`repos/${owner}/${repo}/git/trees/${sha}?recursive=1`);
  if (tree.truncated) {
    fail(
      "git tree が truncated で返りました。対象が大きすぎます（全ツリーを固定 SHA で取得できないため fail closed）。",
    );
  }
  return tree.tree.filter((entry) => entry.type === "blob");
}

function fetchBlob(owner, repo, blobSha) {
  const blob = gh(`repos/${owner}/${repo}/git/blobs/${blobSha}`);
  return Buffer.from(blob.content, "base64");
}

function githubEntries(owner, repo, blobs) {
  return blobs.map((blob) => {
    let cached;
    return {
      path: blob.path,
      size: blob.size ?? 0,
      // ランク付けが変更ファイルを先読みするため、blob の二重取得を避ける
      read: () => (cached ??= fetchBlob(owner, repo, blob.sha)),
    };
  });
}

// ---- 収集範囲 ----

// glob（`**`・`*`・`?`）を正規表現へ変換する。ディレクトリ区切りを伴う
// `**` は「0 個以上のディレクトリ」として扱う。
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === "*") {
      if (glob[i + 1] === "*") {
        i += 1;
        if (glob[i + 1] === "/") {
          i += 1;
          re += "(?:.*/)?";
        } else {
          re += ".*";
        }
      } else {
        re += "[^/]*";
      }
    } else if (char === "?") {
      re += "[^/]";
    } else {
      re += char.replace(/[.+^${}()|[\]\\]/, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}

function makeScope({ includes, excludeGlobs, denyContents }) {
  const prefixes = includes.map((path) => path.replace(/\/+$/, ""));
  const excludes = excludeGlobs.map((glob) => ({
    pattern: globToRegExp(glob),
    matchBasename: !glob.includes("/"),
  }));
  const deny = new Set(denyContents);
  return {
    inScope(path) {
      if (
        prefixes.length > 0 &&
        !prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
      ) {
        return false;
      }
      for (const exclude of excludes) {
        if (exclude.pattern.test(path)) return false;
        if (exclude.matchBasename && exclude.pattern.test(basename(path))) {
          return false;
        }
      }
      return !deny.has(path);
    },
  };
}

// ---- 関連度ランク（--fill-budget） ----

const TIER_LABELS = {
  0: "変更ファイル本体",
  1: "変更ファイルと同一ディレクトリ",
  2: "import 先 / 呼び出し元",
  3: "2 ホップ先",
  4: "プロジェクト文書・ルート設定",
  5: "その他",
  6: "生成物・lock・CI 設定",
};

const DEPRIORITIZED_BASENAMES = new Set([
  "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "go.sum", "Cargo.lock",
  "composer.lock", "Gemfile.lock", "poetry.lock", "uv.lock",
]);

// 「読む価値が最後に回るファイル」の汎用ヒューリスティック。
function isDeprioritized(path) {
  const base = basename(path);
  if (DEPRIORITIZED_BASENAMES.has(base)) return true;
  const ext = base.includes(".") ? base.split(".").at(-1).toLowerCase() : "";
  if (ext === "lock" || ext === "svg") return true;
  if (path.startsWith(".github/")) return true;
  if (/(^|\/)(generated|__generated__)\//.test(path)) return true;
  if (/\.(gen|generated)\.|_gen(erated)?\./.test(base)) return true;
  if (/\.min\.(js|css)$/.test(base)) return true;
  return false;
}

const dirOf = (path) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".";

const IMPORT_SOURCE_PATTERN = /\.(go|ts|tsx|js|jsx|mjs|cjs)$/;

// path が import しているリポジトリ内ディレクトリを推定する。
// Go はルート go.mod のモジュール名からの絶対 import、JS/TS は相対 import のみを
// 解決する（それ以外の言語は空 = ランクに寄与しない）。
function importedDirs(path, text, goModule) {
  const dirs = [];
  if (path.endsWith(".go") && goModule) {
    const escaped = goModule.replace(/[.+^${}()|[\]\\*?]/g, "\\$&");
    for (const match of text.matchAll(new RegExp(`"${escaped}/([^"]+)"`, "g"))) {
      dirs.push(match[1]);
    }
    return dirs;
  }
  if (IMPORT_SOURCE_PATTERN.test(path) && !path.endsWith(".go")) {
    const spec = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;
    for (const match of text.matchAll(spec)) {
      if (!match[1].startsWith("./") && !match[1].startsWith("../")) continue;
      const segments = `${dirOf(path)}/${match[1]}`.split("/");
      const resolved = [];
      for (const segment of segments) {
        if (segment === "." || segment === "") continue;
        if (segment === "..") resolved.pop();
        else resolved.push(segment);
      }
      const target = resolved.join("/") || ".";
      // 参照先がファイルかディレクトリかは分からないため、両方を候補にする
      dirs.push(target, dirOf(target));
    }
  }
  return dirs;
}

/**
 * PR との関連度で tier（0 が最重要）を割り当てる ranker を作る。
 * canScanAll が false（GitHub API 収集）のときは、全ファイル走査が必要な
 * 逆方向解析（呼び出し元）と 2 ホップ目を省略する（blob 取得が高くつくため）。
 */
function buildRanker(entries, changedPaths, canScanAll) {
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const readText = (path) => {
    const entry = byPath.get(path);
    if (!entry) return null;
    if (classifyReadability(path, entry.size, null) !== "readable") return null;
    try {
      return entry.read().toString("utf8");
    } catch {
      return null;
    }
  };
  const goModule = (() => {
    const goMod = byPath.has("go.mod") ? readText("go.mod") : null;
    return goMod ? (/^module\s+(\S+)/m.exec(goMod)?.[1] ?? null) : null;
  })();
  const importsOf = (path) => {
    if (!IMPORT_SOURCE_PATTERN.test(path)) return [];
    const text = readText(path);
    return text ? importedDirs(path, text, goModule) : [];
  };

  const changedDirs = new Set([...changedPaths].map(dirOf));
  const hop1 = new Set();
  for (const path of changedPaths) {
    for (const dir of importsOf(path)) hop1.add(dir);
  }
  const importers = new Set();
  const hop2 = new Set();
  if (canScanAll) {
    for (const entry of entries) {
      const { path } = entry;
      if (!IMPORT_SOURCE_PATTERN.test(path) || changedPaths.has(path)) continue;
      const dirs = importsOf(path);
      if (dirs.some((dir) => changedDirs.has(dir))) importers.add(path);
      if (hop1.has(dirOf(path))) {
        for (const dir of dirs) hop2.add(dir);
      }
    }
  }

  const tierOf = (path) => {
    if (changedPaths.has(path)) return 0;
    if (changedDirs.has(dirOf(path))) return 1;
    if (hop1.has(dirOf(path)) || importers.has(path)) return 2;
    if (hop2.has(dirOf(path))) return 3;
    if (isDeprioritized(path)) return 6;
    if (!path.includes("/") || path.startsWith("docs/")) return 4;
    return 5;
  };
  return { tierOf };
}

// ---- 収集コア ----

/**
 * 上限超過の fail closed 時に、ユーザーが範囲を選べるだけの判断材料
 * （トップレベル別の合計と最大ファイル）を出力する。
 */
function failWithSizeBreakdown(candidates, plannedBytes) {
  const byTopLevel = new Map();
  for (const entry of candidates) {
    const slash = entry.path.indexOf("/");
    const top = slash === -1 ? "(root)" : `${entry.path.slice(0, slash)}/`;
    byTopLevel.set(top, (byTopLevel.get(top) ?? 0) + entry.size);
  }
  const dirs = [...byTopLevel].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const largest = [...candidates].sort((a, b) => b.size - a.size).slice(0, 15);
  fail(
    [
      `readable ファイルの合計が上限 ${MAX_TOTAL_SOURCE_BYTES} bytes を超えました（実測 ${plannedBytes} bytes / ${candidates.length} ファイル）。`,
      "内訳（トップレベル別・上位）:",
      ...dirs.map(([dir, size]) => `  ${String(size).padStart(10)}  ${dir}`),
      "最大のファイル:",
      ...largest.map((entry) => `  ${String(entry.size).padStart(10)}  ${entry.path}`),
      "--include / --exclude-glob で範囲を絞る・--fill-budget で関連度順に詰めるか、ユーザーの判断を仰いでください。",
    ].join("\n"),
  );
}

/**
 * entries（path / size / read()）から files と fileContents を作る。
 * ツリー（files）には全 entry を載せ、本文は scope 内の readable だけを読む。
 *
 * fill 無し: 合計サイズをメタデータで先に検証するため、上限超過時は
 * 1 バイトも取得せずに fail closed できる。
 * fill 有り（--fill-budget）: fail closed の代わりに tier 昇順 → サイズ昇順で
 * 予算いっぱいまで詰める。予算に入らないファイルは飛ばして次へ進む
 * （大きい 1 件で打ち切らない）。同じ予算でできるだけ多くの実体が載る。
 */
function collectFromEntries(entries, scope, fill) {
  entries.sort((a, b) => a.path.localeCompare(b.path));
  const candidates = entries.filter(
    (entry) =>
      classifyReadability(entry.path, entry.size, null) === "readable" &&
      scope.inScope(entry.path),
  );
  let order = candidates;
  if (fill) {
    order = [...candidates].sort(
      (a, b) =>
        fill.tierOf(a.path) - fill.tierOf(b.path) ||
        a.size - b.size ||
        a.path.localeCompare(b.path),
    );
  } else {
    const plannedBytes = candidates.reduce((sum, entry) => sum + entry.size, 0);
    if (plannedBytes > MAX_TOTAL_SOURCE_BYTES) {
      failWithSizeBreakdown(candidates, plannedBytes);
    }
  }
  const fileContents = {};
  const reclassified = new Map();
  const secrets = [];
  const tierStats = fill ? new Map() : null;
  let total = 0;
  for (const entry of order) {
    if (fill && total + entry.size > fill.budget) continue;
    const bytes = entry.read();
    const actual = classifyReadability(entry.path, entry.size, bytes);
    if (actual !== "readable") {
      // 中身を見て初めて binary と分かったファイル
      reclassified.set(entry.path, actual);
      continue;
    }
    const text = bytes.toString("utf8");
    total += bytes.length;
    secrets.push(...scanSecrets(entry.path, text));
    fileContents[entry.path] = fileContent(entry.path, text);
    if (tierStats) {
      const tier = fill.tierOf(entry.path);
      const stat = tierStats.get(tier) ?? { collected: 0, candidates: 0, bytes: 0 };
      stat.collected += 1;
      stat.bytes += bytes.length;
      tierStats.set(tier, stat);
    }
  }
  if (tierStats) {
    for (const entry of candidates) {
      const tier = fill.tierOf(entry.path);
      const stat = tierStats.get(tier) ?? { collected: 0, candidates: 0, bytes: 0 };
      stat.candidates += 1;
      tierStats.set(tier, stat);
    }
  }
  const files = entries.map((entry) => {
    let readability = classifyReadability(entry.path, entry.size, null);
    if (readability === "readable" && !fileContents[entry.path]) {
      readability = reclassified.get(entry.path) ?? "not-collected";
    }
    return repositoryFile(entry.path, entry.size, readability);
  });
  return { files, fileContents, secrets, totalBytes: total, tierStats };
}

function makeFill(fillBudget, entries, changedPaths, canScanAll) {
  if (fillBudget === undefined) return undefined;
  const { tierOf } = buildRanker(entries, changedPaths, canScanAll);
  return { budget: fillBudget, tierOf };
}

function buildRepoPayload(owner, repo, ref, scope, fillBudget) {
  const meta = gh(`repos/${owner}/${repo}`);
  const commit = gh(
    `repos/${owner}/${repo}/commits/${ref ?? meta.default_branch}`,
  );
  const sha = commit.sha;
  const blobs = collectGitHubTree(owner, repo, sha);
  const entries = githubEntries(owner, repo, blobs);
  const { files, fileContents, secrets, totalBytes, tierStats } =
    collectFromEntries(
      entries,
      scope,
      makeFill(fillBudget, entries, new Set(), false),
    );
  return {
    payload: {
      version: 1,
      source: { kind: "repository", name: `${owner}/${repo}`, revision: sha },
      workspace: {
        snapshot: {
          root: `${owner}/${repo}`,
          name: repo,
          selectionKind: "directory",
          branch: ref ?? meta.default_branch,
          isGitRepository: true,
          files,
          changes: [],
        },
        initialFile: null,
      },
      fileContents,
      changedLines: {},
      tours: {},
    },
    secrets,
    totalBytes,
    tierStats,
    isPrivate: Boolean(meta.private),
  };
}

function buildPrPayload(owner, repo, number, scope, fromLocal, fillBudget) {
  const pr = gh(`repos/${owner}/${repo}/pulls/${number}`);
  const headSha = pr.head.sha;
  const baseSha = pr.base.sha;
  const prFiles = gh(`repos/${owner}/${repo}/pulls/${number}/files`, "--paginate");
  let entries;
  if (fromLocal) {
    // 本文をローカル worktree から読む。ファイルごとの blob API 呼び出しが
    // 不要になるため、大きいリポジトリでも API 2 回で収集できる。
    verifyLocalHead(fromLocal, headSha);
    entries = toReadEntries(gitTrackedEntries(fromLocal));
  } else {
    entries = githubEntries(owner, repo, collectGitHubTree(owner, repo, headSha));
  }
  const changedPaths = new Set(
    prFiles.filter((file) => file.status !== "removed").map((file) => file.filename),
  );
  const { files, fileContents, secrets, totalBytes, tierStats } =
    collectFromEntries(
      entries,
      scope,
      // 逆方向 import 解析（呼び出し元）はローカル worktree があるときだけ行う
      makeFill(fillBudget, entries, changedPaths, Boolean(fromLocal)),
    );
  const statusMap = {
    added: "added",
    modified: "modified",
    removed: "deleted",
    renamed: "renamed",
    changed: "modified",
    copied: "added",
  };
  const changes = [];
  const changedLines = {};
  for (const file of prFiles.sort((a, b) => a.filename.localeCompare(b.filename))) {
    const path = file.filename;
    const lines = file.status === "removed" ? [] : changedLinesFromPatch(file.patch);
    changes.push({
      path,
      status: statusMap[file.status] ?? "modified",
      staged: true,
      unstaged: false,
      changedLines: lines,
    });
    if (lines.length > 0) changedLines[path] = lines;
  }
  // changes に載るパスは必ず files にも存在させる（ツリーから開けない変更ファイルを
  // 作らない）。head tree に無い非削除パスは通常発生しないが、防御的に補う。
  const known = new Set(files.map((file) => file.path));
  for (const change of changes) {
    if (change.status !== "deleted" && !known.has(change.path)) {
      files.push(repositoryFile(change.path, 0, "not-collected"));
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return {
    payload: {
      version: 1,
      source: {
        kind: "pull_request",
        name: `${owner}/${repo}`,
        revision: headSha,
        baseRevision: baseSha,
        pullNumber: Number(number),
      },
      workspace: {
        snapshot: {
          root: `${owner}/${repo}`,
          name: repo,
          selectionKind: "directory",
          branch: pr.head.ref,
          isGitRepository: true,
          files,
          changes,
        },
        initialFile: null,
      },
      fileContents,
      changedLines,
      tours: {},
    },
    secrets,
    totalBytes,
    tierStats,
    isPrivate: Boolean(pr.base.repo?.private),
  };
}

function walkLocal(root) {
  const out = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        if (!EXCLUDED_DIRS.has(name) && !name.startsWith(".")) visit(full);
      } else if (stats.isFile() && name !== ".DS_Store") {
        out.push({ path: relative(root, full), size: stats.size, full });
      }
    }
  };
  visit(root);
  return out;
}

function gitLocal(root, ...gitArgs) {
  return execFileSync("git", ["-C", root, ...gitArgs], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function isGitWorkTree(root) {
  try {
    return gitLocal(root, "rev-parse", "--is-inside-work-tree").trim() === "true";
  } catch {
    return false;
  }
}

// git の追跡ファイルだけを対象にする。ファイルシステム走査と違い、
// gitignore 対象（ローカルの .env・ビルド成果物など）を読み取りも一覧化もせず、
// 追跡されている限りドットディレクトリ（.github/ 等）も含まれる。
function gitTrackedEntries(root) {
  // 「追跡されたまま ignore 指定された」ファイルは意図が不明なので fail closed にする。
  const ignoredTracked = gitLocal(
    root, "ls-files", "-i", "-c", "--exclude-standard", "-z",
  ).split("\0").filter(Boolean);
  if (ignoredTracked.length > 0) {
    fail(
      [
        "gitignore 対象のファイルが追跡されています。収集対象から外すかはユーザー判断が必要です:",
        ...ignoredTracked.map((path) => `  - ${path}`),
      ].join("\n"),
    );
  }
  const out = [];
  for (const path of gitLocal(root, "ls-files", "-z").split("\0").filter(Boolean)) {
    const full = join(root, path);
    try {
      const stats = statSync(full);
      if (stats.isFile()) out.push({ path, size: stats.size, full });
    } catch {
      /* 追跡されているが手元に無い（削除済み等）ファイルは載せない */
    }
  }
  return out;
}

// 非 git ディレクトリだけ walkLocal（ドットディレクトリ除外）に fallback する。
function localEntries(root) {
  return isGitWorkTree(root) ? gitTrackedEntries(root) : walkLocal(root);
}

const toReadEntries = (entries) =>
  entries.map((entry) => ({
    path: entry.path,
    size: entry.size,
    read: () => readFileSync(entry.full),
  }));

/**
 * ハイブリッド収集（--pr --from-local）の前提検証。差分メタデータは GitHub、
 * 本文はローカル worktree から取るため、両者が同じ revision を指していないと
 * 「固定 revision のスナップショット」という前提が崩れる。どちらか欠けても fail closed。
 */
function verifyLocalHead(root, headSha) {
  if (!isGitWorkTree(root)) {
    fail(`--from-local のディレクトリが git work tree ではありません: ${root}`);
  }
  const head = gitLocal(root, "rev-parse", "HEAD").trim();
  if (head !== headSha) {
    fail(
      `--from-local の HEAD (${head.slice(0, 7)}) が PR の head SHA (${headSha.slice(0, 7)}) と一致しません。PR のブランチを checkout してから再実行してください。`,
    );
  }
  if (gitLocal(root, "status", "--porcelain").trim() !== "") {
    fail(
      "--from-local の worktree に未コミット変更があります（本文が head SHA の内容であることを保証できません）。",
    );
  }
}

function buildLocalPayload(root, scope, fillBudget) {
  const entries = toReadEntries(localEntries(root));
  const { files, fileContents, secrets, totalBytes, tierStats } =
    collectFromEntries(
      entries,
      scope,
      makeFill(fillBudget, entries, new Set(), true),
    );
  let branch = null;
  try {
    branch = gitLocal(root, "branch", "--show-current").trim() || null;
  } catch {
    /* git リポジトリでない場合は branch なし */
  }
  const name = basename(root);
  return {
    payload: {
      version: 1,
      source: {
        kind: "local-directory",
        name,
        revision: `local-${new Date().toISOString().slice(0, 10)}`,
      },
      workspace: {
        snapshot: {
          root: name,
          name,
          selectionKind: "directory",
          branch,
          isGitRepository: branch !== null,
          files,
          changes: [],
        },
        initialFile: null,
      },
      fileContents,
      changedLines: {},
      tours: {},
    },
    secrets,
    totalBytes,
    tierStats,
    isPrivate: true,
  };
}

// ---- entry point ----
const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const flagAll = (name) =>
  args.flatMap((arg, index) => (arg === name ? [args[index + 1]] : []));

const scope = makeScope({
  includes: flagAll("--include"),
  excludeGlobs: flagAll("--exclude-glob"),
  denyContents: flagAll("--deny-content"),
});

let fillBudget;
{
  const index = args.indexOf("--fill-budget");
  if (index !== -1) {
    const value = args[index + 1];
    fillBudget = value && /^\d+$/.test(value) ? Number(value) : FILL_BUDGET_DEFAULT;
  }
}

let result;
if (flag("--repo")) {
  const [owner, repo] = flag("--repo").split("/");
  if (!owner || !repo) fail("--repo は owner/repo 形式で指定してください");
  result = buildRepoPayload(owner, repo, flag("--ref"), scope, fillBudget);
} else if (flag("--pr")) {
  const [owner, repo] = flag("--pr").split("/");
  const number = args[args.indexOf("--pr") + 2];
  if (!owner || !repo || !/^\d+$/.test(number ?? "")) {
    fail("--pr は `--pr owner/repo <number>` 形式で指定してください");
  }
  result = buildPrPayload(
    owner, repo, number, scope, flag("--from-local"), fillBudget,
  );
} else if (flag("--local")) {
  result = buildLocalPayload(flag("--local"), scope, fillBudget);
} else {
  fail("--repo / --pr / --local のいずれかを指定してください");
}

if (result.secrets.length > 0) {
  console.error("secret らしき値を検出したため出力しません (fail closed):");
  for (const hit of result.secrets) console.error(`  - ${hit}`);
  process.exit(2);
}

const out = flag("--out");
const json = stableStringify(result.payload);
if (out) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(out, json);
} else {
  process.stdout.write(json);
}
const snapshot = result.payload.workspace.snapshot;
console.error(
  JSON.stringify(
    {
      source: result.payload.source,
      files: snapshot.files.length,
      readable: Object.keys(result.payload.fileContents).length,
      notCollected: snapshot.files.filter(
        (file) => file.readability === "not-collected",
      ).length,
      changes: snapshot.changes.length,
      totalSourceBytes: result.totalBytes,
      fillBudgetBytes: fillBudget,
      payloadBytes: json.length,
      isPrivate: result.isPrivate,
    },
    null,
    2,
  ),
);
if (result.tierStats) {
  console.error("関連度ランク別の収録状況:");
  for (const tier of [...result.tierStats.keys()].sort((a, b) => a - b)) {
    const stat = result.tierStats.get(tier);
    console.error(
      `  ${tier} ${TIER_LABELS[tier].padEnd(16, "　")} ${String(stat.collected).padStart(5)} / ${String(stat.candidates).padStart(5)} files  ${String(stat.bytes).padStart(10)} bytes`,
    );
  }
}
