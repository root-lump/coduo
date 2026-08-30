// zoom module が外界に要求する能力。実装は infrastructure 層が注入する。

export interface WebviewZoom {
  apply(level: number): Promise<void>;
}
