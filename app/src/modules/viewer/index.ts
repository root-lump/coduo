// viewer module の公開 API。
// 現状、外部が参照するのは CodeViewer（動的 import）だけであり、
// Monaco を初期バンドルへ巻き込まないため index からは何も再輸出しない。
// CodeViewer は app 層が "./ui/CodeViewer" を React.lazy で読み込む。
export {};
