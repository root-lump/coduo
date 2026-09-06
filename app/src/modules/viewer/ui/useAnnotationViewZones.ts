// 注釈カードを置く Monaco の view zone。注釈ごとに 1 つ作り、対象ブロックの
// 終了行の直後へ行間の空きを作る。中身の描画は React 側が domNode へ portal で行う。
//
// view zone にするのは、カードをエディタの内側へ入れるため。外に重ねると、横位置を
// エディタの座標系へ自分で直す必要があり（差分エディタでは modified 側が右半分に
// 置かれる）、カードがコードとホイールの両方を覆ってしまう。
import { useEffect, useRef, useState } from "react";
import type { editor } from "monaco-editor";
import type { CodeAnnotation } from "../../review";
import type { ChangedLine } from "../../workspace";
import {
  annotationChangeKind,
  ANNOTATION_CARD_HEIGHT,
} from "../codeAnnotations";
import { focusRange } from "../decorations";

/** 差分エディタが削除行の zone に使う既定値（10000）より後ろに置くための順序。 */
const ANNOTATION_ZONE_ORDINAL = 20000;

export type AnnotationViewZone = {
  annotationId: string;
  domNode: HTMLElement;
};

type UseAnnotationViewZonesArgs = {
  editorInstance?: editor.ICodeEditor;
  annotations: CodeAnnotation[];
  /** 行の色をブロックの先頭行に合わせるための変更行。 */
  changedLines: ChangedLine[];
  /** 表示中のファイル。モデルが差し替わると zone は失われる。 */
  filePath?: string;
  /** エディタ実体が入れ替わった合図。zone は作り直しになる。 */
  mountToken: number;
};

/**
 * zone の行に付ける色のクラス。行の色はすぐ下の行（注釈ブロックの先頭行）に
 * 合わせるので、注釈の配色と変更行の種別から決まる。カードではなく行に付けるのは、
 * 行に付いた色の帯がカードの左右で途切れると、その行だけ色が抜けて見えるため。
 */
function zoneTintClass(
  annotation: CodeAnnotation,
  index: number,
  changedLines: ChangedLine[],
): string {
  const kind = annotationChangeKind(annotation, changedLines);
  return [`annotation-color-${(index % 4) + 1}`, kind ? `is-${kind}` : ""]
    .filter(Boolean)
    .join(" ");
}

/**
 * zone を張り直すべきかの判定に使う署名。annotations の参照ではなく中身で見るのは、
 * 呼び出し側がレンダーごとに新しい配列を渡しても張り直しが暴走しないようにするため
 * （効果の中で state を更新するので、参照で見ると更新と再実行が互いを呼び合う）。
 */
function zoneSignature(annotations: CodeAnnotation[]): string {
  return annotations
    .map((annotation) => {
      const range = annotation.target.range;
      return `${annotation.id}:${range?.startLine ?? 0}-${range?.endLine ?? 0}`;
    })
    .join("\n");
}

/**
 * 注釈ごとの view zone を張り、その domNode を返す。返り値の並びは annotations と同じ。
 * 高さは setZoneHeight で実測に差し替える（カードの高さは内容で決まるため）。
 */
export function useAnnotationViewZones({
  editorInstance,
  annotations,
  changedLines,
  filePath,
  mountToken,
}: UseAnnotationViewZonesArgs) {
  const [zones, setZones] = useState<AnnotationViewZone[]>([]);
  // zone の実体（Monaco が返す id と、高さを書き換えるための IViewZone）。
  const entriesRef = useRef(
    new Map<string, { zoneId: string; zone: editor.IViewZone }>(),
  );
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const changedLinesRef = useRef(changedLines);
  changedLinesRef.current = changedLines;
  const signature = `${zoneSignature(annotations)}\n${annotations
    .map((annotation, index) =>
      zoneTintClass(annotation, index, changedLines),
    )
    .join("\n")}`;

  useEffect(() => {
    const model = editorInstance?.getModel();
    if (!editorInstance || !model) {
      setZones([]);
      return;
    }
    const lineCount = model.getLineCount();
    const created: AnnotationViewZone[] = [];
    editorInstance.changeViewZones((accessor) => {
      annotationsRef.current.forEach((annotation, index) => {
        const range = focusRange(annotation.target, lineCount);
        if (!range) return;
        const tint = zoneTintClass(annotation, index, changedLinesRef.current);
        const domNode = document.createElement("div");
        domNode.className = `code-annotation-zone ${tint}`;
        // 行番号側（余白）は別の DOM になる。渡さないとそこだけ色が付かず、
        // 行の色の帯がカードの左で途切れる。
        const marginDomNode = document.createElement("div");
        marginDomNode.className = `code-annotation-zone-margin ${tint}`;
        const zone: editor.IViewZone = {
          // カードはブロックの上に出す。0 は「先頭行の前」の意味になる。
          afterLineNumber: Math.max(range.startLineNumber - 1, 0),
          // 同じ行に複数の zone があるときは ordinal の小さい順に並ぶ。差分エディタは
          // 削除された行を同じ afterLineNumber へ既定値（10000）で挿すので、それより
          // 大きい値にして、カードが削除側ではなく変更後の行の直上に来るようにする。
          ordinal: ANNOTATION_ZONE_ORDINAL,
          heightInPx: ANNOTATION_CARD_HEIGHT,
          domNode,
          marginDomNode,
        };
        const zoneId = accessor.addZone(zone);
        entriesRef.current.set(annotation.id, { zoneId, zone });
        created.push({ annotationId: annotation.id, domNode });
      });
    });
    setZones(created);
    return () => {
      const entries = [...entriesRef.current.values()];
      entriesRef.current.clear();
      // モデルが破棄済みでも removeZone は呼べる。呼ばないと zone が残る。
      editorInstance.changeViewZones((accessor) => {
        for (const entry of entries) accessor.removeZone(entry.zoneId);
      });
      setZones([]);
    };
  }, [editorInstance, filePath, mountToken, signature]);

  /** カードの実測高さを zone に反映する。1px 未満の差では反映しない。 */
  const setZoneHeight = (annotationId: string, height: number) => {
    const entry = entriesRef.current.get(annotationId);
    if (!entry || height <= 0) return;
    if (Math.abs((entry.zone.heightInPx ?? 0) - height) < 1) return;
    entry.zone.heightInPx = height;
    editorInstance?.changeViewZones((accessor) => {
      accessor.layoutZone(entry.zoneId);
    });
  };

  return { zones, setZoneHeight };
}
