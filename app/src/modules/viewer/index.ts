// viewer module の公開 API。
// Monaco を初期バンドルへ巻き込まないため、ここから再輸出してよいのは
// Monaco に依存しない純関数・型だけ。CodeViewer（Monaco 依存）は
// app 層が "./ui/CodeViewer" を React.lazy で読み込む。
export {
  definitionsFor,
  loadCodeNavigationIndex,
  referencesFor,
} from "./codeNavigation";
export type {
  CodeNavigationIndex,
  SymbolLocation,
} from "./codeNavigation";
