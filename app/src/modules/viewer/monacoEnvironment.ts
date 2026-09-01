import { loader } from "@monaco-editor/react";
// フル bundle（`monaco-editor` 既定 entry）は使わない。全言語の language service と
// worker が同梱されて 5MB 超になるうえ、同梱データの一部が Artifact の publish 検証
// （artifact-pr-review テンプレート誤検知）に引っかかることを実測済みのため、
// editor core + 必要言語の monarch 文法だけを明示登録する。
import * as monaco from "monaco-editor/editor/editor.api.js";
// worker のエントリは editor.worker.js（自身で initialize を呼ぶ既定のもの）。
// editor.worker.start.js は start 関数を export するだけで初期化しないため、
// これを worker にすると差分計算など worker 依存の機能が黙って働かない。
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker&inline";
import "monaco-editor/languages/definitions/typescript/register.js";
import "monaco-editor/languages/definitions/javascript/register.js";
import "monaco-editor/languages/definitions/rust/register.js";
import "monaco-editor/languages/definitions/python/register.js";
import "monaco-editor/languages/definitions/go/register.js";
import "monaco-editor/languages/definitions/java/register.js";
import "monaco-editor/languages/definitions/kotlin/register.js";
import "monaco-editor/languages/definitions/cpp/register.js";
import "monaco-editor/languages/definitions/csharp/register.js";
import "monaco-editor/languages/definitions/ruby/register.js";
import "monaco-editor/languages/definitions/php/register.js";
import "monaco-editor/languages/definitions/swift/register.js";
import "monaco-editor/languages/definitions/markdown/register.js";
import "monaco-editor/languages/definitions/yaml/register.js";
import "monaco-editor/languages/definitions/shell/register.js";
import "monaco-editor/languages/definitions/sql/register.js";
import "monaco-editor/languages/definitions/css/register.js";
import "monaco-editor/languages/definitions/html/register.js";
import "monaco-editor/languages/definitions/xml/register.js";
// editor core には gotoSymbol / contextmenu contrib が入っていないため、
// コードナビゲーション（Cmd+クリック・F12・参照 peek・右クリックメニュー）に
// 必要な分だけを明示 import で焼き込む（JS 約 75KB。フル bundle は避ける）。
// パスは `monaco-editor/editor/contrib/...`（`monaco-editor/contrib/...` では解決されない）。
import "monaco-editor/editor/contrib/gotoSymbol/browser/goToCommands.js";
import "monaco-editor/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition.js";
// peek の standalone 向け登録は referencesController ではなくこちら
// （公式フル構成 editor.main.js と同じ組み合わせ）。
import "monaco-editor/editor/standalone/browser/referenceSearch/standaloneReferenceSearch.js";
import "monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js";
// 差分エディタ本体は editor core（standaloneEditor.createDiffEditor）に入っているが、
// 差分の色（diffEditor.insertedTextBackground など）とアクションの登録は
// この contribution にある。入れないと差分が計算されても色が付かない。
// 公式フル構成 editor.main.js が読んでいるものと同じ。
import "monaco-editor/editor/browser/widget/diffEditor/diffEditor.contribution.js";
// アイコンのフォント（codicon）。editor core は @font-face を持つ CSS を
// 読み込まないため、入れないと差分の余白やピーク表示のアイコンが豆腐になる。
// 別名の解決は vite.config.ts を参照。
import "monaco-codicon.css";

type MonacoGlobal = typeof globalThis & {
  MonacoEnvironment?: {
    getWorker(moduleId: string, label: string): Worker;
  };
};

(globalThis as MonacoGlobal).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

/** embed-snapshot.mjs が snapshot と一緒に注入する追加言語（monarch 文法）。 */
type ExtraLanguage = {
  id: string;
  extensions?: string[];
  aliases?: string[];
  conf: monaco.languages.LanguageConfiguration | null;
  language: monaco.languages.IMonarchLanguage;
};

// 上記の register import に無い言語は、Artifact 組み立て時に payload が使う分だけ
// `globalThis.coduoExtraLanguages` として埋め込まれる（assets/languages/ 参照）。
// この module は CodeViewer の lazy import で初めて評価されるため、
// 埋め込みスクリプトの実行後であることが保証されている。
const extras =
  (globalThis as { coduoExtraLanguages?: ExtraLanguage[] })
    .coduoExtraLanguages ?? [];
for (const extra of extras) {
  monaco.languages.register({
    id: extra.id,
    extensions: extra.extensions,
    aliases: extra.aliases,
  });
  if (extra.conf) {
    monaco.languages.setLanguageConfiguration(extra.id, extra.conf);
  }
  monaco.languages.setMonarchTokensProvider(extra.id, extra.language);
}

loader.config({ monaco });

/**
 * コードエディタと差分エディタで同じ配色を使うため、テーマの定義は
 * どちらの mount よりも早いこのモジュールの初期化時に済ませる。
 */
export const CODUO_THEME = "coduo-dark";

monaco.editor.defineTheme(CODUO_THEME, {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "667085", fontStyle: "italic" },
    { token: "keyword", foreground: "C4B5FD" },
    { token: "string", foreground: "9DD274" },
    { token: "number", foreground: "F0B36D" },
    { token: "type", foreground: "78DCE8" },
  ],
  colors: {
    "editor.background": "#0d1017",
    "editor.foreground": "#c8ceda",
    "editorLineNumber.foreground": "#414756",
    "editorLineNumber.activeForeground": "#8d95a5",
    "editor.selectionBackground": "#6d5bd033",
    "editor.inactiveSelectionBackground": "#6d5bd018",
    "editor.lineHighlightBackground": "#ffffff05",
    "editorCursor.foreground": "#a99cf7",
    "editorIndentGuide.background1": "#252a35",
    "editorIndentGuide.activeBackground1": "#3f4655",
    "editorGutter.background": "#0d1017",
    "scrollbarSlider.background": "#8892a622",
    "scrollbarSlider.hoverBackground": "#8892a644",
    // 差分の配色は変更ガター（緑・赤）に合わせる。行の背景は薄く、
    // 単語単位のハイライトだけを濃くして、変わった箇所を目で追えるようにする。
    "diffEditor.insertedTextBackground": "#3fb95033",
    "diffEditor.removedTextBackground": "#ef6a7133",
    "diffEditor.insertedLineBackground": "#3fb95014",
    "diffEditor.removedLineBackground": "#ef6a7114",
    "diffEditorGutter.insertedLineBackground": "#3fb95022",
    "diffEditorGutter.removedLineBackground": "#ef6a7122",
    "diffEditorOverview.insertedForeground": "#3fb95099",
    "diffEditorOverview.removedForeground": "#ef6a7199",
    "diffEditor.border": "#252a35",
  },
});
monaco.editor.setTheme(CODUO_THEME);

export { monaco };
