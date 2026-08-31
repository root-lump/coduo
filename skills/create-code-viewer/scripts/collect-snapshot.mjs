// Coduo snapshot collector（S3）。
// GitHub リポジトリ / PR、またはローカルディレクトリから固定 revision の
// ファイル群を収集し、CoduoSnapshotPayload v1（tours は空）を出力する。
//
//   node scripts/collect-snapshot.mjs --repo owner/repo [--ref <branch|sha>] --out payload.json
//   node scripts/collect-snapshot.mjs --pr owner/repo <number> --out payload.json
//   node scripts/collect-snapshot.mjs --local <dir> --out payload.json
//
// ファイル本文とツリーは、どのモードでも既定でローカルの git object から読む
// （GitHub API の tree / blob は呼ばない）。使うクローンは
//   1. --from-local <dir>（明示指定）
//   2. cwd の周辺で見つかった owner/repo のクローン
//   3. 一時ディレクトリへ shallow に確保したクローン（実行後に削除）
// の順に決める。既存クローンからは git object を直接読むため、checkout も
// working tree の変更も行わない（利用者の作業状態に触れない）。
//
// gh（GitHub API）を使うのは PR のメタデータ（head/base SHA・変更ファイルと
// その patch）だけで、リポジトリ規模に依らず数回で済む。--from-api を付けた
// ときだけ、従来どおり本文も GitHub API から取得する。
//
// --fill-budget [bytes]: 容量超過を fail closed にせず、ファイルを PR との関連度で
// ランク付けし、上位から予算（既定 7.5MB）いっぱいまで本文を詰める。予算に
// 入らないファイルは飛ばして次へ進み、not-collected としてツリーに残る。
//
// --from-local <dir>: 収集に使うローカルクローンを明示する（自動探索を行わない）。
// <dir> の remote が対象 owner/repo を指していない場合は fail closed。
//
// --from-api: 本文・ツリーの取得をローカル git ではなく GitHub API に戻す
// （clone/fetch が使えない環境向けの退避経路）。
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
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";

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

// ---- ローカル git 経路（既定の収集元） ----

const remoteUrlOf = (owner, repo) => `https://github.com/${owner}/${repo}.git`;

// private リポジトリで素の git が認証できないときだけ借りる credential helper。
// `gh auth setup-git` が gitconfig へ書くのと同じ形（既定の列を空値でリセット
// してから gh を足す）で、トークンをこちらで扱うことはしない。
const GH_CREDENTIAL_ARGS = [
  "-c", "credential.https://github.com.helper=",
  "-c", "credential.https://github.com.helper=!gh auth git-credential",
];

function gitLocal(root, ...gitArgs) {
  return execFileSync("git", ["-C", root, ...gitArgs], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

/** 失敗を例外にせず null で返す git 実行（存在確認・任意の fetch 用）。 */
function gitQuiet(root, ...gitArgs) {
  try {
    return gitLocal(root, ...gitArgs);
  } catch {
    return null;
  }
}

function isGitWorkTree(root) {
  try {
    return gitLocal(root, "rev-parse", "--is-inside-work-tree").trim() === "true";
  } catch {
    return false;
  }
}

function slugOfRemoteUrl(url) {
  const match = /(?:github\.com[:/])([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i.exec(
    url ?? "",
  );
  return match ? `${match[1]}/${match[2]}`.toLowerCase() : null;
}

function remotesOf(root) {
  return (gitQuiet(root, "remote", "-v") ?? "")
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter(([name, url]) => name && url)
    .map(([name, url]) => ({ name, slug: slugOfRemoteUrl(url) }));
}

const hasRemoteFor = (root, owner, repo) =>
  remotesOf(root).some((remote) => remote.slug === `${owner}/${repo}`.toLowerCase());

/**
 * owner/repo を指す remote 名。見つからなければ https URL を直接返す
 * （origin が fork のクローンでも、base 側の refs/pull を取りに行けるようにする）。
 */
function remoteFor(root, owner, repo) {
  const slug = `${owner}/${repo}`.toLowerCase();
  return (
    remotesOf(root).find((remote) => remote.slug === slug)?.name ??
    remoteUrlOf(owner, repo)
  );
}

/** cwd の周辺（自身のリポジトリと、その隣・直下）から owner/repo のクローンを探す。 */
function findLocalClone(owner, repo) {
  const cwd = process.cwd();
  const top = gitQuiet(cwd, "rev-parse", "--show-toplevel")?.trim();
  const candidates = [
    ...(top ? [top, join(dirname(top), repo)] : []),
    cwd,
    join(cwd, repo),
  ];
  for (const dir of candidates) {
    if (!existsSync(dir) || !isGitWorkTree(dir)) continue;
    const root = gitQuiet(dir, "rev-parse", "--show-toplevel")?.trim();
    if (root && hasRemoteFor(root, owner, repo)) return root;
  }
  return null;
}

// 一時リポジトリは実行後に必ず片付ける（fail() は process.exit なので exit で拾う）。
const tempRoots = [];
process.on("exit", () => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});
process.on("SIGINT", () => process.exit(130));

function createTempRepo() {
  const root = mkdtempSync(join(tmpdir(), "coduo-git-"));
  tempRoots.push(root);
  if (gitQuiet(root, "init", "--quiet") === null) {
    fail(`一時 git リポジトリを初期化できませんでした: ${root}`);
  }
  return root;
}

/**
 * 収集に使うローカル git リポジトリを決める。
 * --from-local（明示）→ cwd 周辺のクローン → 一時リポジトリ（fetch で確保）の順。
 */
function resolveWorkRepo(owner, repo, fromLocal) {
  if (fromLocal) {
    if (!isGitWorkTree(fromLocal)) {
      fail(`--from-local のディレクトリが git work tree ではありません: ${fromLocal}`);
    }
    const root = gitLocal(fromLocal, "rev-parse", "--show-toplevel").trim();
    if (!hasRemoteFor(root, owner, repo)) {
      fail(
        `--from-local に指定された ${root} に ${owner}/${repo} を指す remote がありません（別リポジトリを読まないよう fail closed）。`,
      );
    }
    return { root, temporary: false };
  }
  const found = findLocalClone(owner, repo);
  if (found) return { root: found, temporary: false };
  return { root: createTempRepo(), temporary: true };
}

/**
 * refspec を fetch する。shallow は一時リポジトリのときだけ（利用者の既存
 * クローンへ --depth を持ち込むと、そのリポジトリが shallow 化してしまう）。
 */
function fetchFromRemote(root, source, refspec, shallow) {
  const args = [
    "fetch", "--quiet", "--no-tags",
    ...(shallow ? ["--depth", "1"] : []),
    source, refspec,
  ];
  if (gitQuiet(root, ...args) !== null) return true;
  return gitQuiet(root, ...GH_CREDENTIAL_ARGS, ...args) !== null;
}

const hasCommit = (root, sha) =>
  gitQuiet(root, "cat-file", "-e", `${sha}^{commit}`) !== null;

/** 固定 revision の object を手元に確保する（無ければ fetch する）。 */
function ensureCommit(root, owner, repo, sha, refspec, shallow) {
  if (hasCommit(root, sha)) return;
  const source = remoteFor(root, owner, repo);
  for (const target of [refspec, sha].filter(Boolean)) {
    if (fetchFromRemote(root, source, target, shallow) && hasCommit(root, sha)) {
      return;
    }
  }
  fail(
    [
      `${owner}/${repo} の revision ${sha.slice(0, 7)} をローカルへ確保できませんでした（fetch 失敗）。`,
      "認証が必要なら `gh auth setup-git` を実行するか、--from-local で手元のクローンを指定してください。",
      "clone/fetch が使えない環境では --from-api で GitHub API 経由の収集に切り替えられます。",
    ].join("\n"),
  );
}

function lsRemote(root, source, flags, refs) {
  const args = ["ls-remote", ...flags, source, ...refs];
  return (
    gitQuiet(root, ...args) ?? gitQuiet(root, ...GH_CREDENTIAL_ARGS, ...args)
  );
}

/**
 * --repo の ref を固定 SHA に解決する。手元のクローンが古い可能性があるため
 * remote の ls-remote を優先し、問い合わせられないときだけ手元の参照へ落とす。
 */
function resolveRepoRevision(root, owner, repo, ref) {
  if (ref && /^[0-9a-f]{40}$/i.test(ref)) {
    return { sha: ref.toLowerCase(), branch: null };
  }
  const raw = lsRemote(
    root,
    remoteFor(root, owner, repo),
    ref ? [] : ["--symref"],
    ref ? [ref] : ["HEAD"],
  );
  if (raw !== null) {
    let branch = ref ?? null;
    let head = null;
    let peeled = null; // annotated tag はコミットまで剥がした ^{} 側を使う
    for (const line of raw.split("\n")) {
      const symref = /^ref:\s+refs\/heads\/(\S+)\s+HEAD$/.exec(line);
      if (symref) {
        branch = symref[1];
        continue;
      }
      const [hash, name] = line.trim().split(/\s+/);
      if (!/^[0-9a-f]{40}$/.test(hash ?? "")) continue;
      if (name?.endsWith("^{}")) peeled = hash;
      else head ??= hash;
    }
    const sha = peeled ?? head;
    if (sha) return { sha, branch };
  }
  for (const candidate of ref ? [ref, `origin/${ref}`] : ["origin/HEAD", "HEAD"]) {
    const sha = gitQuiet(
      root, "rev-parse", "--verify", "--quiet", `${candidate}^{commit}`,
    )?.trim();
    if (sha) {
      console.error(
        `coduo: remote へ問い合わせられなかったため、手元の ${candidate} (${sha.slice(0, 7)}) を固定 revision に使います。`,
      );
      return { sha, branch: ref ?? null };
    }
  }
  fail(
    `${owner}/${repo} の ref ${ref ?? "(default branch)"} を解決できませんでした。`,
  );
}

function gitBlob(root, blobSha) {
  return execFileSync("git", ["-C", root, "cat-file", "blob", blobSha], {
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

/**
 * 固定 revision のツリーを git object から読む。working tree には触れないので、
 * 利用者のクローンを checkout し直したり汚したりしない。
 */
function treeEntries(root, revision) {
  const entries = [];
  for (const record of gitLocal(
    root, "ls-tree", "-r", "-z", "--long", revision,
  ).split("\0")) {
    if (record === "") continue;
    const tab = record.indexOf("\t");
    const [, type, blobSha, size] = record.slice(0, tab).split(/\s+/);
    if (type !== "blob") continue; // submodule（commit エントリ）は本文を持たない
    let cached;
    entries.push({
      path: record.slice(tab + 1),
      size: Number(size),
      read: () => (cached ??= gitBlob(root, blobSha)),
    });
  }
  return entries;
}

const describeSource = (root, temporary) =>
  temporary ? `一時クローン (${root})` : `ローカルクローン (${root})`;

// ---- GitHub API 経路（--from-api のときだけ） ----

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

function repoPayloadFrom(owner, repo, sha, branch, collected) {
  return {
    version: 1,
    source: { kind: "repository", name: `${owner}/${repo}`, revision: sha },
    workspace: {
      snapshot: {
        root: `${owner}/${repo}`,
        name: repo,
        selectionKind: "directory",
        branch,
        isGitRepository: true,
        files: collected.files,
        changes: [],
      },
      initialFile: null,
    },
    fileContents: collected.fileContents,
    changedLines: {},
    tours: {},
  };
}

// 既定経路。ツリーも本文もローカルの git object から読むため、
// GitHub API は 1 度も呼ばない（tree truncation の制約も受けない）。
function buildRepoPayload(owner, repo, ref, scope, fillBudget, options) {
  if (options.fromApi) {
    return buildRepoPayloadViaApi(owner, repo, ref, scope, fillBudget);
  }
  const { root, temporary } = resolveWorkRepo(owner, repo, options.fromLocal);
  const { sha, branch } = resolveRepoRevision(root, owner, repo, ref);
  ensureCommit(
    root, owner, repo, sha,
    ref && !/^[0-9a-f]{7,40}$/i.test(ref) ? ref : branch, temporary,
  );
  const entries = treeEntries(root, sha);
  const collected = collectFromEntries(
    entries,
    scope,
    // ローカル object の読み出しは安価なので、逆方向 import 解析まで行う
    makeFill(fillBudget, entries, new Set(), true),
  );
  return {
    payload: repoPayloadFrom(owner, repo, sha, branch ?? ref ?? null, collected),
    secrets: collected.secrets,
    totalBytes: collected.totalBytes,
    tierStats: collected.tierStats,
    // ローカル収集では公開/非公開を確認できないため、安全側（private 扱い）に倒す
    isPrivate: true,
    visibility: "unknown",
    collectedFrom: describeSource(root, temporary),
  };
}

// 退避経路（--from-api）。ツリーと blob を GitHub API から取得する。
function buildRepoPayloadViaApi(owner, repo, ref, scope, fillBudget) {
  const meta = gh(`repos/${owner}/${repo}`);
  const commit = gh(
    `repos/${owner}/${repo}/commits/${ref ?? meta.default_branch}`,
  );
  const sha = commit.sha;
  const entries = githubEntries(owner, repo, collectGitHubTree(owner, repo, sha));
  const collected = collectFromEntries(
    entries,
    scope,
    makeFill(fillBudget, entries, new Set(), false),
  );
  return {
    payload: repoPayloadFrom(
      owner, repo, sha, ref ?? meta.default_branch, collected,
    ),
    secrets: collected.secrets,
    totalBytes: collected.totalBytes,
    tierStats: collected.tierStats,
    isPrivate: Boolean(meta.private),
    visibility: meta.private ? "private" : "public",
    collectedFrom: "GitHub API",
  };
}

// PR は差分そのものが対象なので、head/base SHA と変更ファイル（patch 付き）だけは
// GitHub API から取る。リポジトリ規模に依らず数回で済み、本文は既定どおり
// ローカルの git object（refs/pull/<N>/head を必要なら fetch）から読む。
function buildPrPayload(owner, repo, number, scope, fillBudget, options) {
  const pr = gh(`repos/${owner}/${repo}/pulls/${number}`);
  const headSha = pr.head.sha;
  const baseSha = pr.base.sha;
  const prFiles = gh(`repos/${owner}/${repo}/pulls/${number}/files`, "--paginate");
  let entries;
  let collectedFrom;
  let local;
  if (options.fromApi) {
    entries = githubEntries(owner, repo, collectGitHubTree(owner, repo, headSha));
    collectedFrom = "GitHub API";
  } else {
    local = resolveWorkRepo(owner, repo, options.fromLocal);
    // head SHA の object さえ手元にあれば良い（checkout も clean な worktree も不要）
    ensureCommit(
      local.root, owner, repo, headSha,
      `refs/pull/${number}/head`, local.temporary,
    );
    entries = treeEntries(local.root, headSha);
    collectedFrom = describeSource(local.root, local.temporary);
  }
  const changedPaths = new Set(
    prFiles.filter((file) => file.status !== "removed").map((file) => file.filename),
  );
  const { files, fileContents, secrets, totalBytes, tierStats } =
    collectFromEntries(
      entries,
      scope,
      // 逆方向 import 解析（呼び出し元）は blob 取得が安価なローカル収集のときだけ
      makeFill(fillBudget, entries, changedPaths, !options.fromApi),
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
    visibility: pr.base.repo?.private ? "private" : "public",
    collectedFrom,
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
    visibility: "local",
    collectedFrom: `ローカルディレクトリ (${root})`,
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

// 本文の取得元。既定はローカル git（--from-api のときだけ GitHub API）。
const sourceOptions = {
  fromLocal: flag("--from-local"),
  fromApi: args.includes("--from-api"),
};

let result;
if (flag("--repo")) {
  const [owner, repo] = flag("--repo").split("/");
  if (!owner || !repo) fail("--repo は owner/repo 形式で指定してください");
  result = buildRepoPayload(
    owner, repo, flag("--ref"), scope, fillBudget, sourceOptions,
  );
} else if (flag("--pr")) {
  const [owner, repo] = flag("--pr").split("/");
  const number = args[args.indexOf("--pr") + 2];
  if (!owner || !repo || !/^\d+$/.test(number ?? "")) {
    fail("--pr は `--pr owner/repo <number>` 形式で指定してください");
  }
  result = buildPrPayload(owner, repo, number, scope, fillBudget, sourceOptions);
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
      collectedFrom: result.collectedFrom,
      visibility: result.visibility,
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
