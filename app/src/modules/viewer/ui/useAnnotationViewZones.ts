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
  /**
   * 差分エディタ本体。あるときは元ファイル側にも同じ高さの空 zone を対で挿す。
   * 1 画面表示では元ファイル側が行番号だけの帯として残り、Monaco はこちらが挿した
   * zone の分をその帯に反映しないため、挿さないとカードの高さぶん番号がずれる。
   */
  diffEditor?: editor.IDiffEditor;
  /** 差分が計算し直された合図。行の対応が変わるので zone を張り直す。 */
  diffToken?: number;
  /** 表示中のファイル。モデルが差し替わると zone は失われる。 */
  filePath?: string;
  /** エディタ実体が入れ替わった合図。zone は作り直しになる。 */
  mountToken: number;
};

/**
 * zone の行に付ける色のクラス。行の色はすぐ下の行（注釈ブロックの先頭行）の
 * 差分の色に合わせる。カードではなく行に付けるのは、行に付いた色の帯がカードの
 * 左右で途切れると、その行だけ色が抜けて見えるため。
 *
 * 注釈の色は敷かない。注釈の色（alpha 0.13）は差分の色（0.08）より濃く、
 * 重ねると差分の緑や赤が負けて見えなくなる。注釈の色はカードの枠と番号で示す。
 */
function zoneTintClass(
  annotation: CodeAnnotation,
  changedLines: ChangedLine[],
): string {
  const kind = annotationChangeKind(annotation, changedLines);
  return kind ? `is-${kind}` : "";
}

/**
 * 変更後の行 line の直前に空きを入れるとき、元ファイル側でその空きを入れる行。
 *
 * line が変更のかたまりの内側にあるときは、そのかたまりの元ファイル側の最後の行を
 * 返す。差分の 1 画面表示では、削除された行と追加された行が縦に並び、元ファイル側の
 * 帯は削除された行の番号を出したあと追加された行を飛ばす。かたまりの途中に空きを
 * 入れると、その番号の並びが分断されて追加行の横へ押し出される。
 *
 * かたまりの外なら、それまでの増減を足した位置を返す。
 */
export function originalLineForSpacer(
  line: number,
  changes: readonly editor.ILineChange[],
): number {
  let delta = 0;
  for (const change of changes) {
    const insertsOnly = change.originalEndLineNumber === 0;
    const deletesOnly = change.modifiedEndLineNumber === 0;
    const modifiedStart = change.modifiedStartLineNumber;
    const modifiedEnd = deletesOnly ? modifiedStart : change.modifiedEndLineNumber;
    if (modifiedStart > line) break;
    // かたまりの内側（挿入だけの場合は挿入位置の直後も内側とみなす）
    if (!deletesOnly && modifiedEnd >= line) {
      return insertsOnly
        ? change.originalStartLineNumber
        : change.originalEndLineNumber;
    }
    const added = deletesOnly
      ? 0
      : change.modifiedEndLineNumber - modifiedStart + 1;
    const removed = insertsOnly
      ? 0
      : change.originalEndLineNumber - change.originalStartLineNumber + 1;
    delta += removed - added;
  }
  return Math.max(line - 1 + delta, 0);
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
  diffEditor,
  diffToken,
  filePath,
  mountToken,
}: UseAnnotationViewZonesArgs) {
  const [zones, setZones] = useState<AnnotationViewZone[]>([]);
  // zone の実体（Monaco が返す id と、高さを書き換えるための IViewZone）。
  const entriesRef = useRef(
    new Map<
      string,
      {
        zoneId: string;
        zone: editor.IViewZone;
        /** 元ファイル側の対の空き。差分エディタのときだけ持つ。 */
        original?: { zoneId: string; zone: editor.IViewZone };
      }
    >(),
  );
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const changedLinesRef = useRef(changedLines);
  changedLinesRef.current = changedLines;
  const signature = `${zoneSignature(annotations)}\n${annotations
    .map((annotation) => zoneTintClass(annotation, changedLines))
    .join("\n")}`;

  useEffect(() => {
    const model = editorInstance?.getModel();
    if (!editorInstance || !model) {
      setZones([]);
      return;
    }
    const lineCount = model.getLineCount();
    const originalEditor = diffEditor?.getOriginalEditor();
    const originalLineCount = originalEditor?.getModel()?.getLineCount() ?? 0;
    const changes = diffEditor?.getLineChanges() ?? [];
    const created: AnnotationViewZone[] = [];
    const spacers: { annotationId: string; zone: editor.IViewZone }[] = [];
    editorInstance.changeViewZones((accessor) => {
      annotationsRef.current.forEach((annotation) => {
        const range = focusRange(annotation.target, lineCount);
        if (!range) return;
        const tint = zoneTintClass(annotation, changedLinesRef.current);
        const domNode = document.createElement("div");
        domNode.className = `code-annotation-zone ${tint}`.trim();
        // 行番号側（余白）は別の DOM になる。渡さないとそこだけ色が付かず、
        // 行の色の帯がカードの左で途切れる。
        const marginDomNode = document.createElement("div");
        marginDomNode.className = `code-annotation-zone-margin ${tint}`.trim();
        const afterLineNumber = Math.max(range.startLineNumber - 1, 0);
        const zone: editor.IViewZone = {
          // カードはブロックの上に出す。0 は「先頭行の前」の意味になる。
          afterLineNumber,
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
        if (originalEditor && originalLineCount > 0) {
          const alignedLine = originalLineForSpacer(
            range.startLineNumber,
            changes,
          );
          spacers.push({
            annotationId: annotation.id,
            zone: {
              afterLineNumber: Math.min(alignedLine, originalLineCount),
              ordinal: ANNOTATION_ZONE_ORDINAL,
              heightInPx: ANNOTATION_CARD_HEIGHT,
              // 元ファイル側は場所を空けるだけ。中身は持たせない。
              domNode: document.createElement("div"),
              showInHiddenAreas: true,
              suppressMouseDown: true,
            },
          });
        }
      });
    });
    originalEditor?.changeViewZones((accessor) => {
      for (const spacer of spacers) {
        const entry = entriesRef.current.get(spacer.annotationId);
        if (!entry) continue;
        entry.original = {
          zoneId: accessor.addZone(spacer.zone),
          zone: spacer.zone,
        };
      }
    });
    setZones(created);
    return () => {
      const entries = [...entriesRef.current.values()];
      entriesRef.current.clear();
      // モデルが破棄済みでも removeZone は呼べる。呼ばないと zone が残る。
      editorInstance.changeViewZones((accessor) => {
        for (const entry of entries) accessor.removeZone(entry.zoneId);
      });
      originalEditor?.changeViewZones((accessor) => {
        for (const entry of entries) {
          if (entry.original) accessor.removeZone(entry.original.zoneId);
        }
      });
      setZones([]);
    };
  }, [diffEditor, diffToken, editorInstance, filePath, mountToken, signature]);

  /** カードの実測高さを zone に反映する。1px 未満の差では反映しない。 */
  const setZoneHeight = (annotationId: string, height: number) => {
    const entry = entriesRef.current.get(annotationId);
    if (!entry || height <= 0) return;
    if (Math.abs((entry.zone.heightInPx ?? 0) - height) < 1) return;
    entry.zone.heightInPx = height;
    editorInstance?.changeViewZones((accessor) => {
      accessor.layoutZone(entry.zoneId);
    });
    // 元ファイル側の空きも同じ高さにしないと、縦の対応がずれる。
    const original = entry.original;
    if (original) {
      original.zone.heightInPx = height;
      diffEditor?.getOriginalEditor().changeViewZones((accessor) => {
        accessor.layoutZone(original.zoneId);
      });
    }
  };

  return { zones, setZoneHeight };
}
