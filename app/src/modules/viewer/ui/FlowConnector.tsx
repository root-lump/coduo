import type { FlowConnectorPath } from "./useFlowConnector";

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
