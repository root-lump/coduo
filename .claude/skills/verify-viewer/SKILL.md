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

## 落とし穴

| 症状 | 原因と対処 |
|---|---|
| `navigate` が「browser-internal or unparseable URLs」で失敗 | `file://` は開けない。手順 4 の HTTP 配信を使う |
| 起動直後に「説明はまだ生成されていません」エラー | payload に Tour が無い。手順 2 を省略しない |
| 変更したはずの挙動が反映されない | `pnpm template` 未実行で古い template を embed している。再生成してから embed し直す |
| スクリーンショットでエディタが 1 行しか見えない | 読み込み直後の描画待ち。スクロールか wait 後に撮り直す |
