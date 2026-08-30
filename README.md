# Coduo

GitHub リポジトリ / Pull Request、またはローカルディレクトリから、**コードビューア + Code Tour 付きの Claude Artifact** を生成する Claude Code プラグインです。

生成される Artifact は:

- 対象の**固定 revision（commit SHA）のソース全文**を埋め込んだ単一 HTML
- Repository Tree から Tour 対象外のファイルも自由に閲覧できる（Monaco エディタ・シンタックスハイライト・読み取り専用）
- 開いた瞬間に **Code Tour**（Claude が生成時に書いた説明ステップ + コード注釈）が表示され、前へ/次へ・ステップ直接選択・`⌘⇧[` / `⌘⇧]` で辿れる
- Tour の途中で自由にファイルを探索し、「レビューを再開」で現在ステップへ戻れる
- PR の場合は base/head SHA を固定し、変更行ガター付きで差分と関連コードを読める
- **実行時に GitHub やネットワークへ一切アクセスしない**（データはすべて埋め込み）

## インストール

```
/plugin marketplace add root-lump/coduo
/plugin install coduo@coduo
```

必要なもの: `node` v20+、GitHub 対象の場合は認証済みの [`gh` CLI](https://cli.github.com/)。

## 使い方

Claude Code でそのまま頼みます:

```
owner/repo の PR #123 を解説付きで読めるようにして
このリポジトリのコードビューアを作って
./src を Code Tour にして
copsy #16 のビューアを更新して   ← 同じ URL のまま最新化
```

対象やスタイル（学習向け / 変更差分中心 / カスタム）が曖昧なときは、候補を提示して確認してから生成します。

## 安全設計

- 収集は GitHub 公式 CLI `gh`（あなた自身の認証）のみを使用
- git tree の truncation・容量超過（8MB）・secret らしき値の検出時は **fail closed**（勝手に縮小・除外して続行しない）
- Tour は埋め込み前に必ず検証され、実在しないパス・行範囲は弾かれる
- private ソースを含む Artifact の共有操作はユーザーに委ねる（既定は非公開）

## リポジトリ構成

```
.claude-plugin/          プラグイン / マーケットプレイス定義
skills/create-code-viewer/   スキル本体
├── SKILL.md             生成手順の正本
├── scripts/             collect / validate / add-tour / embed
├── assets/template.html ビルド済み viewer template（単一 HTML）
└── references/          Tour JSON の正本サンプル
app/                     template のソース（React + Monaco）
```

template を変更したら `app/` で `mise exec -- pnpm install && mise exec -- pnpm template` を実行すると `assets/template.html` が更新されます（`pnpm test:run` でテスト実行）。
