---
name: verify-viewer
description: Use when app/src の viewer の表示・操作に関わる変更を実機確認するとき（CLAUDE.md 検証規約の「embed した HTML をブラウザで開いて確認」を実行する場面）。pnpm template の実行後に使う。
---

# viewer 変更の実機確認

`app/src` の変更を、実データを埋め込んだ Artifact HTML として組み立て、claude-in-chrome で開いて確認する。前提: `mise exec -- pnpm template` 実行済み（embed は `assets/template.html` を使うため、再生成前だと古い viewer を確認してしまう）。

以下 `$SKILL` = `skills/create-code-tour`、`$WORK` = セッションの scratchpad ディレクトリ（絶対パス）。

## 手順

1. **収集**: このリポジトリ自体を `--diff` で撮る（未コミット変更があれば変更パネル・差分ガターも同時に確認できる）。stderr の summary（collectedFrom / files / readable / notCollected / totalSourceBytes / isPrivate）を目視する。

   ```sh
   node "$SKILL/scripts/collect-snapshot.mjs" --diff <リポジトリルート> --out "$WORK/coduo-payload.json"
   ```

2. **最小 Tour の組み込み（省略しない）**: viewer は起動時に Tour を自動読み込みし、payload に Tour が無いと生成エラー表示になる（ファイル閲覧はできるが、素の起動状態を確認できない）。Tour と無関係の変更でも、実在パス・実在行を指す 2 ステップ程度（うち 1 ステップに annotation 1 件。注釈レイヤの確認になる）の Tour を `$SKILL/references/tour-example.json` の形式で書いて組み込む。

   ```sh
   node "$SKILL/scripts/add-tour.mjs" "$WORK/coduo-payload.json" "$WORK/coduo-tour.json" repository
   ```

3. **組み立て**:

   ```sh
   node "$SKILL/scripts/embed-snapshot.mjs" "$WORK/coduo-payload.json" "$WORK/coduo-verify.html" --title "Coduo — verify"
   ```

4. **HTTP 配信**: claude-in-chrome は `file://` を開けない（「browser-internal or unparseable URLs」エラー）。scratchpad を HTTP で配信する。Bash の `run_in_background: true` で起動する。

   ```sh
   python3 -m http.server 8931 --bind 127.0.0.1 --directory "$WORK"
   ```

5. **ブラウザ確認**: claude-in-chrome のツールを 1 回の ToolSearch でまとめてロードし（`tabs_context_mcp` / `navigate` / `computer` / `read_console_messages` / `tabs_close_mcp` ほか）、`http://127.0.0.1:8931/coduo-verify.html` を開く。読み込み直後は描画が空に見えることがあるので、1 回スクロールまたは 2 秒 wait してからスクリーンショットを撮る。

6. **確認項目**: 変更点そのものに加えて、既存機能の非破壊を最低限見る: Tour の自動表示とステップ送り、注釈レイヤ、Tree からのファイル選択、（`--diff` で変更があるとき）変更パネルと差分ガター。各操作後に `read_console_messages` で新規エラーが無いことを見る。

7. **後片付け**: 確認タブを `tabs_close_mcp` で閉じ、HTTP サーバのバックグラウンドタスクを TaskStop で止める。

## claude-in-chrome が使えないとき

「Browser tools are not available in this session」と通知されたら、Playwright のキャッシュにある headless Chromium を CDP で操作して手順 5〜6 を代替する。

```
~/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell
```

**使ってよいのはこの実行ファイルだけで、利用者が日常的に使うブラウザ（`/Applications` 配下のアプリと、その同梱バイナリ）は起動しない。** 実ブラウザを操作するために利用者へ設定変更を依頼することもしない。この実行ファイルが無ければ、代わりを探さず「ブラウザ確認は未実施」と報告して先へ進む。確認できていないことを、確認したかのように書かない。

操作は次の形で行う。

- `--remote-debugging-port <番号>` を付けて起動し、`/json/list` の `type === "page"` の target の `webSocketDebuggerUrl` に Node の組み込み `WebSocket` で繋ぐ。ブラウザ側の端点（`/json/version` が返す URL）に繋ぐと `Page` と `Runtime` が効かない。
- `--dump-dom` はページのスクリプトが走り切る前に出力されることがあるので、値の読み出しは `Runtime.evaluate` で行う。
- ページ内のスクロールは `Input.dispatchMouseEvent` の `mouseWheel` を対象要素の座標へ送る。要素の座標と寸法は `Runtime.evaluate` で読む。
- スクリーンショットは `Page.captureScreenshot`。
- **確認が終わったら WebSocket と Chrome、HTTP 配信のプロセスをすべて終了させる。** 例外で抜けた経路でも取りこぼさないようにする。

## 修正前後を比べるとき

同じ payload を、修正前と修正後の template にそれぞれ埋め込んで比べる。`git stash` はセッション間で共有されるので使わない。

1. 修正前の template を用意する。`git show origin/main:skills/create-code-tour/assets/template.html` で取り出すか、変更したソースを一時退避して `pnpm template` を実行し、生成物を退避してから元へ戻す。
2. `embed-snapshot.mjs` に `--template` で template を指定し、同じ payload から 2 つの HTML を組み立てる。
3. 同じ操作列を両方に流し、DOM から読んだ値を並べて比べる。目視だけで判断しない。

## 差分表示（変更前と比べる）に関わる変更のとき

手順 1 の `--diff` は未コミット変更のあるファイルにだけ patch を載せるので、差分表示の題材は作業ツリーの変更ファイルになる。Tour のステップはその変更ファイルを対象にし、annotation は次の 2 種類を置く。

- 変更行の上（差分の色と注釈ハイライトの重なり、コネクタ線が modified 側の行に届くことを見る）
- 変更行から離れた未変更行の上（`hideUnchangedRegions` で折り畳まれる領域に入る。カードを押すと領域が展開されて表示位置が移ることを見る）

annotation の範囲はステップの範囲の内側に収める。外に出ると add-tour が呼ぶ validate-tour が「annotation がステップ範囲の外にあります」で組み込みを止めるので、ステップ範囲を annotation を含む広さに取る。

確認は「変更前と比べる」「並べて見る / 1 画面で見る」の各状態と、「次へ」でステップを進めた後の状態で行う。並べて表示の確認はズーム 100% で行う。Monaco は差分エディタの幅が 900px 以下だと並べて表示を自動で 1 画面に落とす（`useInlineViewWhenSpaceIsLimited` の既定）ため、注釈レールの表示中やズーム拡大時に「並べて見る」を押しても 1 画面のままになることがあり、これは不具合ではない。

## 落とし穴

| 症状 | 原因と対処 |
|---|---|
| `navigate` が「browser-internal or unparseable URLs」で失敗 | `file://` は開けない。手順 4 の HTTP 配信を使う |
| 起動直後に「説明はまだ生成されていません」エラー | payload に Tour が無い。手順 2 を省略しない |
| 変更したはずの挙動が反映されない | `pnpm template` 未実行で古い template を embed している。再生成してから embed し直す |
| スクリーンショットでエディタが 1 行しか見えない | 読み込み直後の描画待ち。スクロールか wait 後に撮り直す |
