/**
 * コードナビゲーション用の宣言索引。収集時（skills/create-code-tour/scripts/symbol-index.mjs）に
 * 作られて payload に載る。ビューアは自分で抽出せず、この索引だけを引く。
 *
 * 位置は 1 始まりの行と、1 始まり UTF-16 コード単位の列（Monaco と同じ数え方）。
 * パスと種別を配列へ外出しして番号で参照するのは、同じ文字列の繰り返しを消して
 * 索引を小さく保つため。
 */
export type SymbolIndex = {
  /** 予算超過で occurrences を落としたか。 */
  degraded: boolean;
  generator: {
    /** 文法 ID → 取り込んだ文法パッケージのバージョン。 */
    grammars: Record<string, string>;
    webTreeSitter: string | null;
  };
  /** 宣言の種別。declarations の 5 番目の要素がこの配列の添字。 */
  kinds: string[];
  /** ファイルパス。declarations / occurrences の先頭要素がこの配列の添字。 */
  paths: string[];
  symbols: SymbolEntry[];
};

export type SymbolEntry = {
  name: string;
  /** [パス番号, 行, 開始列, 終了列, 種別番号] */
  declarations: Array<[number, number, number, number, number]>;
  /** [パス番号, 行, 開始列]。宣言そのものの位置も含む。degraded のときは空。 */
  occurrences: Array<[number, number, number]>;
};
