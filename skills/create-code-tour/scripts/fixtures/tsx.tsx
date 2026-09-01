// 日本語コメント: TSX の宣言
export type PanelProps = { title: string };

export const PANEL_ID = "panel";

export function Panel({ title }: PanelProps) {
  return <div id={PANEL_ID}>{title}</div>;
}

export class PanelStore {
  reset(): void {}
}
