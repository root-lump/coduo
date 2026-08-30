# Coduo

GitHub リポジトリ / Pull Request、またはローカルディレクトリから、コードビューアと **Code Tour** の付いた Claude Artifact を生成する Claude Code プラグインです。Code Tour は、Claude が生成時に書いた説明ステップとコード注釈の列で、Artifact を開くと自動で始まります。

生成される Artifact は単一の HTML ファイルで、対象の固定 revision（commit SHA）のソース全文を埋め込んでいます。表示に必要なデータをすべて埋め込んでいるため、実行時に GitHub やネットワークへはアクセスしません。

閲覧者は次のことができます。

- Tour を辿る（前へ/次へ、ステップの直接選択、`⌘⇧[` / `⌘⇧]`）
- Repository Tree から Tour 対象外のファイルも開く（Monaco エディタによる読み取り専用の表示で、シンタックスハイライトが付く）
- Tour の途中で自由にファイルを探索し、「レビューを再開」で現在のステップへ戻る
- PR の場合は、base/head SHA を固定した変更行ガター付きで、差分と関連コードを読む

## インストール

```
/plugin marketplace add root-lump/coduo
/plugin install coduo@coduo
```

必要な環境は `node` v20 以上です。GitHub を対象にする場合は、認証済みの [`gh` CLI](https://cli.github.com/) も必要です。

## 使い方

Claude Code でそのまま頼みます。

```
owner/repo の PR #123 を解説付きで読めるようにして
このリポジトリのコードビューアを作って
./src を Code Tour にして
copsy #16 のビューアを更新して   ← 同じ URL のまま最新化
```

対象やスタイル（学習向け / 変更差分中心 / カスタム）が依頼から確定しないときは、候補を提示して確認してから生成します。

## 安全設計

- 収集には GitHub 公式 CLI `gh` だけを使います（利用者自身の認証で動き、トークンを直接は扱いません）
- git tree の truncation、容量超過（8MB）、secret らしき値の検出時は **fail closed** します。勝手に縮小や除外をして続行せず、容量超過の場合はサイズの内訳を提示して、利用者に収集範囲を選んでもらいます
- Tour は埋め込み前に必ず検証し、実在しないパスや行範囲を指すステップは弾きます
- private ソースを含む Artifact の共有操作は利用者に委ねます（既定は非公開です）

## リポジトリ構成

```
.claude-plugin/               プラグイン / マーケットプレイス定義
skills/create-code-viewer/    スキル本体
├── SKILL.md                  生成手順の正本
├── scripts/                  collect / validate / add-tour / embed
├── assets/template.html      ビルド済み viewer template（単一 HTML）
├── assets/languages/         後付け用の Monaco 文法（生成物）
└── references/               Tour JSON の正本サンプル
app/                          template のソース（React + Monaco）
```

シンタックスハイライトの言語文法は、主要言語だけを template に焼き込んであります。それ以外の言語は、Artifact の組み立て時に、snapshot が実際に使う分だけを `assets/languages/` から埋め込みます。

template を変更したら、`app/` で `mise exec -- pnpm install && mise exec -- pnpm template` を実行します。`assets/template.html` と `assets/languages/` が再生成されます。テストは `pnpm test:run` で実行します。
