// monaco-editor の ESM サブパスには型定義の解決が付かないため、
// 本体の型（monaco-editor = editor.api と同一の公開 API）へ委譲する。
declare module "monaco-editor/editor/editor.api.js" {
  export * from "monaco-editor";
}

declare module "monaco-editor/languages/definitions/*" {}
