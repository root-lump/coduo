// 生成物がソースと一致しているかを見る（CI 用）。
//
//   node scripts/check-generated-sync.mjs
//
// 直前に生成コマンド（pnpm template / fetch-tree-sitter.mjs）を実行しておき、
// 作業ツリーに差分が出ていないことを確認する。
//
// gzip の出力は圧縮ライブラリの版で変わりうるため、.gz は展開後の内容で比較する
// （中身が同じでもバイト列が違うだけの差分を、同期ずれとして誤検出しないため）。
import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function git(...args) {
  return execFileSync("git", args, { maxBuffer: 256 * 1024 * 1024 });
}

// git が返すパスはリポジトリルート基準。このスクリプトは app/ から呼ばれるため、
// ファイルを開く前にルートへ解決する。
const root = String(git("rev-parse", "--show-toplevel")).trim();

const changed = String(git("status", "--porcelain"))
  .split("\n")
  .map((line) => line.slice(3).trim())
  .filter(Boolean);

const outOfSync = [];
for (const path of changed) {
  if (!path.endsWith(".gz")) {
    outOfSync.push(path);
    continue;
  }
  try {
    const committed = gunzipSync(git("show", `HEAD:${path}`));
    const current = gunzipSync(readFileSync(join(root, path)));
    if (!committed.equals(current)) {
      outOfSync.push(`${path}（展開後の内容が異なる）`);
    }
  } catch (error) {
    outOfSync.push(`${path}（比較できませんでした: ${error.message}）`);
  }
}

if (outOfSync.length > 0) {
  console.error("生成物がソースと同期していません。再生成してコミットしてください:");
  for (const path of outOfSync) {
    console.error(`  - ${path}`);
  }
  process.exit(1);
}
console.error("生成物は同期しています");
