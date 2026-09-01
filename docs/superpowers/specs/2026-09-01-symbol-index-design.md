# コードナビゲーション索引の収集時生成

## 背景と目的

Coduo のビューアは、定義ジャンプと参照一覧をヒューリスティックで解決している。
定義は言語ごとの正規表現による宣言抽出、参照は全ファイルの単語一致で、どちらもビューアの起動時に構築している（`app/src/modules/viewer/codeNavigation.ts`）。

この方式には二つの問題がある。

宣言の取りこぼしが多い。正規表現は宣言キーワードと名前が同じ行に並ぶ形しか拾えないため、メソッド、レシーバつき関数、複数行にまたがる宣言が索引に載らない。載らない名前は Cmd+ホバーで下線が出ず、Cmd+クリックしても飛べない。利用者からは「飛べるかどうか分からない」という体験になる。

誤検出もある。TypeScript の named import 行 `type Foo,` を型宣言として拾うため、`SymbolLocation` のような名前で定義候補が 2 件になり、片方は import 行を指す。

本設計は、宣言の抽出を構文木ベースに置き換え、索引の構築をビューアの起動時から収集時へ移す。

## 決定した方針

- **精度目標は宣言の抽出まで**。tree-sitter の tags クエリで宣言位置を正確に取る。ファイル内スコープ解決（locals）と、import を辿るファイル間の名前解決は対象外とする。同名の候補が複数残る場合は Monaco の peek に選ばせる。
- **対応言語は 11 種類**。npm で文法 wasm と `tags.scm` の両方が配られている Go、TypeScript、TSX、JavaScript、Python、Rust、Java、C++、C#、Ruby、PHP を対象とする。Kotlin は wasm はあるが tags クエリが無く、Swift は wasm が配られていない。これらと Markdown、YAML、XML、CSS、HTML、SQL、Shell は、現行の正規表現による抽出を維持する。
- **索引の作り手は収集スクリプトに一本化する**。tree-sitter が使える言語も、正規表現しか使えない言語も、収集時に索引を作って payload に載せる。ビューアは索引を引くだけになる。
- **参照は宣言のある名前に限って索引に載せる**。すべての識別子の出現を載せると索引が本文の 1.8 倍になり、埋め込み後 16MB の制限に当たる。
- **tree-sitter の実行系と文法は同梱する**。npm 依存や外部 CLI に頼らず、`assets/` に置いて `zlib` で展開して使う。収集スクリプトは node の標準モジュールだけで動くという現在の前提を維持する。

## 実測値

判断の根拠として測った値を記録する。

| 対象 | サイズ |
|---|---|
| `web-tree-sitter.js` + `web-tree-sitter.wasm` | 156KB + 210KB |
| `tree-sitter-go.wasm` | 212KB |
| `tree-sitter-typescript.wasm` / `tree-sitter-tsx.wasm` | 1.38MB / 1.41MB |
| `tree-sitter-c_sharp.wasm`（最大） | 5.35MB（gzip 後 315KB） |
| `tree-sitter-cpp.wasm` | 3.43MB（gzip 後 274KB） |
| 11 言語の合計（非圧縮） | 約 17MB |
| 11 言語の合計（gzip 後の見込み） | 約 1.5MB |

文法 wasm は解析表が主体のため gzip が 12 倍から 17 倍効く。同梱によるリポジトリの増加は 1.5MB 程度に収まる。Artifact の容量には影響しない（tree-sitter は収集時にしか動かない）。

索引の規模は、このリポジトリ自体（収集した本文 625KB、178 ファイル）で次のとおり。

- 識別子の出現は 55,937 件、異なる名前は 9,510 件
- 宣言のある名前の出現に限ると 10,434 件（粗い正規表現による近似）
- 出現 1 件を 13 バイト前後で持つとして、索引は 140KB 前後

## 構成

責務を三つに分ける。

### 文法の取り込み（開発時）

`app/scripts/fetch-tree-sitter.mjs` を新設する。`web-tree-sitter` と 11 言語の文法パッケージを app の devDependencies に加え、そこから次を `skills/create-code-tour/assets/tree-sitter/` へ書き出す。

- `web-tree-sitter.js` と `web-tree-sitter.wasm`
- 言語ごとの `<lang>.wasm.gz`
- 言語ごとの `<lang>.tags.scm`
- `manifest.json`（言語 ID から文法ファイル、クエリ、取り込み元パッケージ名、バージョンへの対応）

既存の `app/scripts/generate-languages.mjs` と同じ位置づけの生成物であり、直接編集せず、更新時にスクリプトを回して差分をコミットする。

### 索引の生成（収集時）

`skills/create-code-tour/scripts/symbol-index.mjs` を新設する。収集済みの本文を受け取り、索引を返す。`collect-snapshot.mjs` はこれを呼んで payload に載せるだけで、抽出の詳細は持たない。共有ヘルパーを複製しない方針は守り、抽出はこの 1 モジュールに閉じる。

### 索引の消費（ビューア）

`app/src/modules/viewer/codeNavigation.ts` から抽出ロジックを削り、payload の索引を引くだけにする。

データの流れは、収集スクリプトが本文を集める、同じプロセスで索引を作る、payload に載せる、`embed-snapshot.mjs` が HTML に埋める、ビューアが読む、という一方向になる。索引は生成時に確定するため、後から取り込み元が変わっても既存の Artifact は影響を受けない。

収集モードの判定と本文の取得経路、fail closed の条件、出力の決定性、ビューアに焼き込む Monaco の構成には手を入れない。

## データ形式

payload の最上位に `symbolIndex` を足す。型の正本として `app/src/shared/snapshot/SymbolIndex.ts` を追加する。

```json
{
  "symbolIndex": {
    "generator": {
      "webTreeSitter": "0.27.0",
      "grammars": { "go": "0.25.0", "typescript": "0.23.2" }
    },
    "paths": ["app/src/modules/viewer/codeNavigation.ts"],
    "kinds": ["class", "constant", "function", "interface", "method", "module", "type"],
    "degraded": false,
    "symbols": [
      {
        "name": "buildDefinitionIndex",
        "declarations": [[0, 62, 17, 37, 2]],
        "occurrences": [[0, 12, 3], [0, 59, 17]]
      }
    ]
  }
}
```

`declarations` の 1 件は `[パス番号, 行, 開始列, 終了列, 種別番号]`、`occurrences` の 1 件は `[パス番号, 行, 開始列]`。パスと種別を配列へ外出しして番号で参照するのは、同じ文字列の繰り返しを消すため。宣言そのものの位置も `occurrences` に含める（現在の参照一覧が宣言を含む挙動と揃えるため）。

決定性は既存の方針に従う。`paths` はパス昇順、`symbols` は名前昇順、各配列はパス番号、行、列の昇順。

`occurrences` を載せるのは宣言のある名前に限る。tree-sitter が使える言語では識別子ノードだけを拾うため、コメントや文字列リテラルの中の一致は入らない。文法が無い言語では単語境界の一致で拾うため、コメント内の一致が残る。この差は summary に出す。

### 予算と縮退

索引の上限を 1.5MB とする。超えた場合は `occurrences` を落として `declarations` だけを載せ、`degraded: true` を立てる。宣言だけなら上限に当たらない。

この上限は、埋め込み後 16MB の制限に対して、template が 3.5MB、本文の既定予算（`--fill-budget`）が 7.5MB であることから逆算した余裕枠である。本文の予算とは別枠として数え、索引のバイト数を summary に出す。

## 収集側の処理

**文法の読み込み**：`manifest.json` を読み、payload に現れた言語のうち manifest にあるものだけを `zlib` で展開して読み込む。19 言語ぶんを毎回読むことはしない。

**宣言の抽出**：`tags.scm` を実行し、`@definition.<種別>` のキャプチャから名前と範囲を取る。種別は tags クエリの慣習（function、method、class、interface、module、constant、type）をそのまま使う。

**出現の抽出**：宣言のある名前についてのみ、構文木の葉ノードのうちノード名に `identifier` を含むものを拾う。Go の `field_identifier` や `type_identifier`、TypeScript の `property_identifier` が自然に入り、コメントと文字列リテラルは入らない。言語ごとにクエリを書かずに済むため、言語を足すときの作業が増えない。

**文法が無い言語**：現行の `DECLARATION_PATTERNS` と単語境界の一致検索をこのモジュールへ移す。出力形式は tree-sitter 経路と同じにするため、ビューアからは区別が要らない。

**位置の変換**：tree-sitter の位置は行も列も 0 始まりで、列は UTF-8 のバイト数である。Monaco は行も列も 1 始まりで、列は UTF-16 のコード単位である。非 ASCII を含む行では必ずずれるため、行ごとにバイト位置から UTF-16 位置へ変換する。fixture に非 ASCII のコメントを含めて検証する。

**失敗の扱い**：文法の読み込み失敗や特定ファイルの解析失敗は fail closed にしない。該当する言語やファイルを索引から落とし、警告として summary に出す。fail closed は「無断で不完全なコードの複製を作らない」ための規則であり、索引は無くても閲覧が成立する補助機能なので性質が異なる。ただし黙って落とすことはせず、summary に索引済みファイル数、宣言数、出現数、索引のバイト数、縮退の有無、言語ごとの内訳を必ず出す。

`--fill-budget` で本文を収集しなかったファイルは索引の対象外とする（本文が無いため）。

## ビューア側の変更

`codeNavigation.ts` が公開する `definitionsFor` と `referencesFor` は名前を保ち、実装を索引引きに変える。`installCodeNavigation` は `files` に加えて索引を受け取る。

索引を持たない payload では定義ジャンプと参照一覧を出さない。収集スクリプトが常に索引を作るため、通常は起きない。

既存の `codeNavigation.test.ts` は、正規表現の抽出を検証する内容から、索引を与えたときの引き当てを検証する内容へ書き換える。抽出そのもののテストは収集側へ移る。

定義候補が無く参照が 2 件以上ある名前では、`provideDefinition` がホバー位置そのものを唯一の候補として返す。Monaco は定義が現在位置と一致するとき参照 peek を開くため、下線が出て Cmd+クリックで参照一覧が開く。これにより「下線が出ないので飛べるか分からない」という状態が解消する。宣言の上にカーソルを置いたときにこの挙動になることは実機で確認済みだが、位置を意図的に自分自身へ返したときに同じ経路を通るかは実装時に確認する。

import による候補の絞り込みは今回の対象外とする。tree-sitter で宣言が正確になれば候補は減るため、その状態を見てから必要性を判断する。

## 検証と CI

### 言語別 fixture

`skills/create-code-tour/scripts/fixtures/` に言語ごとの小さなソースと、期待する宣言の一覧を置く。関数、メソッド、型、定数を一通り含め、非 ASCII のコメントを含む行を必ず入れる。この fixture が、文法を更新したときに壊れていないかを判定する材料になる。

テストは app の vitest から収集側のモジュールを直接 import して回す。収集スクリプトに自動テストが無いという現状の前提が変わるため、`CLAUDE.md` の検証の節も更新する。

### 基盤の CI

`.github/workflows/ci.yml` を新設し、push と pull request で次を回す。

- `pnpm typecheck`
- `pnpm test:run`（fixture による索引検証を含む）
- 生成物の同期チェック（`pnpm template` と文法取り込みスクリプトを実行して差分が出ないこと）

同期チェックは展開後の内容で比較する。gzip の出力は圧縮ライブラリのバージョンによって変わりうるため、圧縮済みファイルをバイト列で比較すると中身が同じでも差分として検出されてしまう。

### 更新 PR

`.github/workflows/update-grammars.yml` を新設し、週次の cron と手動起動で動かす。tree-sitter 関連の devDependencies を上げ、取り込みスクリプトを回し、fixture 検証を通し、差分があれば PR を作る。

PR 本文にはパッケージごとの旧バージョンと新バージョン、fixture 検証の結果、言語ごとの宣言抽出件数の増減を載せる。件数が大きく減っていれば、文法かクエリの互換が崩れた合図として読める。

検証は PR 作成前に同じ workflow の中で済ませる。`GITHUB_TOKEN` で作った PR は他の workflow を起動しないため、PR 作成後の CI に頼れない。

## 実装の順序

1. 文法の取り込みスクリプトと `assets/tree-sitter/` の生成
2. `symbol-index.mjs`（tree-sitter 経路と正規表現経路）と fixture テスト
3. `collect-snapshot.mjs` への配線、payload の型追加、summary の拡張
4. ビューア側を索引消費へ置き換え、テスト更新、`pnpm template` で生成物を再生成
5. CI 2 本の追加
6. `verify-viewer` で実機確認
7. `CLAUDE.md` の更新

## 未確認事項

実装の最初に確認する。

- `web-tree-sitter` 0.27 の初期化作法（実行系 wasm の渡し方、文法を `Uint8Array` から読めるか）
- 11 言語ぶんを gzip で置いたときの実サイズ（1.5MB 前後の見込み）
- 本文 8MB 規模での索引生成の所要時間（数秒の見込み）
- 定義候補が無い名前で自分自身を返したときの Monaco の挙動

いずれも設計を覆す種類のものではなく、実装の細部が変わる程度のものである。
