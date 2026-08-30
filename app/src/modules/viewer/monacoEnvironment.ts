import { loader } from "@monaco-editor/react";
// フル bundle（`monaco-editor` 既定 entry）は使わない。全言語の language service と
// worker が同梱されて 5MB 超になるうえ、同梱データの一部が Artifact の publish 検証
// （artifact-pr-review テンプレート誤検知）に引っかかることを実測済みのため、
// editor core + 必要言語の monarch 文法だけを明示登録する。
import * as monaco from "monaco-editor/editor/editor.api.js";
import EditorWorker from "monaco-editor/editor/editor.worker.start.js?worker&inline";
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

export { monaco };
