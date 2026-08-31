# CLAUDE.md

## リポジトリ概要

Coduo は、GitHub リポジトリ / PR やローカルディレクトリから、コードビューアと Code Tour の付いた Claude Artifact を生成する Claude Code プラグイン。

- `skills/create-code-viewer/` — スキル本体（SKILL.md が生成手順の正本、scripts/ が収集・検証・組み立て）
- `app/` — viewer template のソース（React + Monaco、vite + vite-plugin-singlefile で単一 HTML にビルド）

## コマンド（`app/` で実行）

```sh
mise exec -- pnpm install      # 依存導入
mise exec -- pnpm test:run     # テスト（vitest）
mise exec -- pnpm typecheck    # tsc -b
mise exec -- pnpm template     # ビルドして assets/template.html と assets/languages/ を再生成
```

pnpm は直接ではなく `mise exec --` 経由で呼ぶ（node と pnpm の両方を mise が固定している）。

## 生成物の扱い

- `skills/create-code-viewer/assets/template.html` と `assets/languages/` は `pnpm template` の生成物。直接編集しない
- `app/src` を変更したら、同じ変更セットで `pnpm template` を実行し、再生成された template を含めてコミットする（スキルはビルド済み template を配布するため、ソースだけ直すと配布物が古いまま残る）
- `app/src/shared/ipc/generated/` は ts-rs の生成物。ただし `FileReadability.ts` の `"not-collected"` は coduo 拡張であり、再生成時も残す（ファイル内コメント参照）

## 設計上の決まり

- template に焼き込む言語文法は `app/src/modules/viewer/monacoEnvironment.ts` の register import が正本。それ以外の言語は embed 時に `assets/languages/` から payload が使う分だけ補完される。新しい言語対応で template に import を足す前に、この補完で足りないかを確認する
- collector の収集モードは `--repo` / `--pr` / `--diff`（ローカルディレクトリの作業ツリー + 未コミット変更）の 3 つ。本文取得はローカル git object 経由が既定（`--from-local` → cwd 周辺のクローン → 一時クローンの順に収集元を決める）。GitHub API は PR メタデータ専用で、tree / blob を既定経路で呼ばない。既存クローンからは `git ls-tree` / `git cat-file` で読み、checkout や fetch --depth で利用者のリポジトリの状態を変えない
- collector の fail closed（容量超過 8MB、secret 検出、`--from-api` 時の tree truncation、`--from-local` の remote 不一致）を独断で回避する変更をしない。縮小・除外は `--include` / `--exclude-glob` / `--deny-content` / `--fill-budget` によるユーザー選択で行う設計
- 収集スクリプトの共有ヘルパーは `skills/create-code-viewer/scripts/lib.mjs` に置き、各スクリプトへ複製しない
- 出力 payload は決定的（パス昇順、キー順固定の JSON）。順序や整形を変えると同一入力での差分比較が壊れる

## 検証

- `skills/create-code-viewer/scripts/` に自動テストは無い。変更したら `--diff <dir>` などで実際に実行し、stderr の summary（collectedFrom / files / readable / notCollected / totalSourceBytes / isPrivate）を確認する
- viewer の変更は `pnpm test:run` を通し、表示に関わるものは embed した HTML をブラウザで開いて確認する
