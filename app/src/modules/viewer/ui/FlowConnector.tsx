import type { editor } from "monaco-editor";
import type { CodeRange, JumpKind } from "../../review";
import type { SymbolLocation } from "../codeNavigation";
import { useFlowConnector, type FlowConnectorPath } from "./useFlowConnector";

/** 上段の式から下段の対象範囲へ引く破線。座標は useFlowConnector が出す。 */
export function FlowConnector({ path }: { path: FlowConnectorPath | undefined }) {
  if (!path) return null;
  return (
    <svg className="flow-connector" aria-hidden="true">
      <path d={path.d} stroke={path.color} />
      <circle cx={path.end.x} cy={path.end.y} r="3.5" fill={path.color} />
    </svg>
  );
}

type FlowLinkProps = {
  container: HTMLElement | null;
  topEditor: editor.ICodeEditor | undefined;
  bottomEditor: editor.ICodeEditor | undefined;
  from: CodeRange;
  kind: JumpKind;
  anchor: SymbolLocation | undefined;
  hidden: boolean;
};

/**
 * 隣り合う 2 段を結ぶ線。段の組ごとに 1 つ置き、座標計算は useFlowConnector に任せる
 * （hook は 1 組のエディタだけを受けるので、配列対応に書き換えず組ごとに呼ぶ）。
 */
export function FlowLink(props: FlowLinkProps) {
  const path = useFlowConnector(props);
  return <FlowConnector path={path} />;
}
