// Tour の文言（ツアー概要・ステップ本文・注釈本文）を Markdown として描画する。
// react-markdown は HTML 文字列を作らず React 要素を組み立てるので、リポジトリ由来の
// 文字列が説明文に混ざっても HTML として解釈されない（raw HTML は既定で無視される）。
import {
  createContext,
  useContext,
  type ComponentProps,
  type MouseEvent,
} from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";
import type { FileReference } from "../../workspace";

export type TourMarkdownProps = {
  text: string;
  className?: string;
  /** インラインコードの中身をファイル参照として解釈する。参照でなければ undefined。 */
  resolveFileReference(text: string): FileReference | undefined;
  onOpenFileReference(reference: FileReference): void;
};

type FileLinkContextValue = Pick<
  TourMarkdownProps,
  "resolveFileReference" | "onOpenFileReference"
>;

const FileLinkContext = createContext<FileLinkContextValue | undefined>(
  undefined,
);

// react-markdown の code コンポーネントはインラインとブロックの区別を受け取らない。
// pre の内側で描画されているかを Context で伝え、ブロック内はファイル参照にしない。
const CodeBlockContext = createContext(false);

// Artifact はネットワークに出ないため画像は表示できない。
const DISALLOWED_ELEMENTS = ["img"];

function CodeBlock({
  children,
  node: _node,
  ...props
}: ComponentProps<"pre"> & ExtraProps) {
  return (
    <CodeBlockContext.Provider value={true}>
      <pre {...props}>{children}</pre>
    </CodeBlockContext.Provider>
  );
}

function Code({
  children,
  node: _node,
  ...props
}: ComponentProps<"code"> & ExtraProps) {
  const inBlock = useContext(CodeBlockContext);
  const links = useContext(FileLinkContext);
  const reference =
    !inBlock && typeof children === "string" && links
      ? links.resolveFileReference(children)
      : undefined;
  if (!reference || !links) {
    return <code {...props}>{children}</code>;
  }
  // 注釈カードの中でも使われるため、カード側の click（注釈の選択）と重ならないようにする。
  const open = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    links.onOpenFileReference(reference);
  };
  return (
    <button
      type="button"
      className="tour-file-link"
      onClick={open}
      title={`${reference.file} を開く`}
    >
      {children}
    </button>
  );
}

function ExternalLink({
  children,
  node: _node,
  ...props
}: ComponentProps<"a"> & ExtraProps) {
  return (
    <a {...props} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

const COMPONENTS: Components = {
  pre: CodeBlock,
  code: Code,
  a: ExternalLink,
};

export function TourMarkdown({
  text,
  className,
  resolveFileReference,
  onOpenFileReference,
}: TourMarkdownProps) {
  return (
    <FileLinkContext.Provider
      value={{ resolveFileReference, onOpenFileReference }}
    >
      <div className={className ? `tour-markdown ${className}` : "tour-markdown"}>
        <Markdown
          components={COMPONENTS}
          disallowedElements={DISALLOWED_ELEMENTS}
        >
          {text}
        </Markdown>
      </div>
    </FileLinkContext.Provider>
  );
}
