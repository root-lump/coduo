# CLAUDE.md

## リポジトリ概要

Coduo は、GitHub リポジトリ / PR やローカルディレクトリから、コードビューアと Code Tour の付いた Claude Artifact を生成する Claude Code プラグイン。

- `skills/create-code-tour/` — スキル本体（SKILL.md が生成手順の正本、scripts/ が収集・検証・組み立て）
- `app/` — viewer template のソース（React + Monaco、vite + vite-plugin-singlefile で単一 HTML にビルド）

## コマンド（`app/` で実行）

```sh
mise exec -- pnpm install      # 依存導入
mise exec -- pnpm test:run     # テスト（vitest）
mise exec -- pnpm typecheck    # tsc -b
mise exec -- pnpm template     # ビルドして assets/template.html と assets/languages/ を再生成
node scripts/fetch-tree-sitter.mjs   # assets/tree-sitter/（実行系・文法・tags クエリ）を再生成
```

pnpm は直接ではなく `mise exec --` 経由で呼ぶ（node と pnpm の両方を mise が固定している）。

## 生成物の扱い

- `skills/create-code-tour/assets/template.html` と `assets/languages/` は `pnpm template` の生成物。直接編集しない
- `app/src` を変更したら、同じ変更セットで `pnpm template` を実行し、再生成された template を含めてコミットする（スキルはビルド済み template を配布するため、ソースだけ直すと配布物が古いまま残る）
- `app/src/shared/snapshot/` は snapshot payload に現れる型の正本（origra から移植した ts-rs 生成物が出自だが、生成元は無く手書きで保守する）。`app/src/shared/snapshot/samples/` は開発・テスト用の payload サンプル
- `skills/create-code-tour/assets/tree-sitter/` のうち `runtime/`・`grammars/`・`queries/*.tags.scm`・`manifest.json` は `app/scripts/fetch-tree-sitter.mjs` の生成物。直接編集しない。`queries/*.extra.scm` だけは手書きの資産で、取り込みスクリプトは触らない

## 設計上の決まり

- template に焼き込む言語文法は `app/src/modules/viewer/monacoEnvironment.ts` の register import が正本。それ以外の言語は embed 時に `assets/languages/` から payload が使う分だけ補完される。新しい言語対応で template に import を足す前に、この補完で足りないかを確認する
- Monaco は editor core のみの構成で、contrib 機能は `monacoEnvironment.ts` で使う分だけ side-effect import する。パスは `monaco-editor/editor/contrib/...` 形式（`monaco-editor/contrib/...` は解決されない）。import の組み合わせは `monaco-editor/esm/vs/editor/editor.main.js` を正とする（contrib 単体では standalone 向け登録が欠けることがある。例: 参照 peek は `referencesController.js` ではなく `standalone/browser/referenceSearch/standaloneReferenceSearch.js`）。焼き込めたかは、ビルド後の template に contrib 固有の文字列（例: "No definition found"）が含まれるかで確認する（editor core にはオプション定義由来で "Go to Definition" 等の文字列が contrib 無しでも現れるため、機能名の文字列一致だけでは同梱の証拠にならない）
- collector の収集モードは `--repo` / `--pr` / `--diff`（ローカルディレクトリの作業ツリー + 未コミット変更）の 3 つ。本文取得はローカル git object 経由が既定（`--from-local` → cwd 周辺のクローン → 一時クローンの順に収集元を決める）。GitHub API は PR メタデータ専用で、tree / blob を既定経路で呼ばない。既存クローンからは `git ls-tree` / `git cat-file` で読み、checkout や fetch --depth で利用者のリポジトリの状態を変えない
- collector の fail closed（容量超過 8MB、secret 検出、`--from-api` 時の tree truncation、`--from-local` の remote 不一致）を独断で回避する変更をしない。縮小・除外は `--include` / `--exclude-glob` / `--deny-content` / `--fill-budget` によるユーザー選択で行う設計
- 収集スクリプトの共有ヘルパーは `skills/create-code-tour/scripts/lib.mjs` に置き、各スクリプトへ複製しない
- 出力 payload は決定的（パス昇順、キー順固定の JSON）。順序や整形を変えると同一入力での差分比較が壊れる
- コードナビゲーションの宣言索引は収集時に作って payload の `symbolIndex` に載せる（`scripts/symbol-index.mjs` が正本）。ビューアは抽出を持たず索引を引くだけにする。文法を同梱している 11 言語は tree-sitter の tags クエリで、それ以外は同モジュール内の正規表現で抽出する
- 変更前の本文は payload に載せず、変更ファイルの unified diff を `patches` として載せる。ビューアは変更後の全文に patch を逆適用して変更前を復元し、差分エディタに渡す（`app/src/modules/workspace/reconstructBase.ts` が正本）。逆適用が変更後と食い違うファイルは差分表示を出さない。patch のバイト数は `--fill-budget` の予算から先に差し引くので、超過時に減るのは変更と関係の薄い周辺ファイルの本文になる
- 索引の生成失敗（文法の読み込み失敗、個別ファイルの解析失敗）は fail closed にしない。該当を索引から落として summary に警告を出す。索引は無くても閲覧が成立する補助機能であり、fail closed が守る「無断で不完全なコードの複製を作らない」とは性質が違う

## 検証

- `skills/create-code-tour/scripts/` のうち索引生成（`symbol-index.mjs`）だけは自動テストがあり、app の vitest から回す（`app/src/shared/symbolIndex/buildSymbolIndex.test.ts` が `scripts/fixtures/` の言語別 fixture を検証する）。他のスクリプトに自動テストは無いので、変更したら `--diff <dir>` などで実際に実行し、stderr の summary（collectedFrom / files / readable / notCollected / totalSourceBytes / isPrivate / symbolIndex）を確認する
- viewer の変更は `pnpm test:run` を通し、表示に関わるものは embed した HTML をブラウザで開いて確認する
- CI（`.github/workflows/ci.yml`）は型検査・テストに加えて生成物の同期を見る。`pnpm template` と `fetch-tree-sitter.mjs` を実行して差分が出ないことが条件で、gzip は展開後の内容で比較する

## Pull Request

- viewer の表示や操作が変わる変更は、`verify-viewer` のブラウザ確認で撮ったスクリーンショットを PR の概要欄に貼る。変更前後の見た目が違うなら、比較できるように両方載せる
- スクリーンショットは `gh pr create --attach ./before.png --attach ./after.png` で添付する（`--attach` は `gh` 2.99.0 以降、1 コマンド 50 ファイルまで）。本文に `![変更後](./after.png)` の形で参照を書いておけば、その位置がアップロード後の URL に置き換わる。参照が無い分は本文末尾に追記される。代替テキストはパスの後ろに `#` で付ける（`./after.png#変更後`）
