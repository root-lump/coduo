// ビルド時に生成した Tour（AgentReviewResult）を snapshot payload と照合する。
// invalid な Tour（実在しないパス・行範囲など）は埋め込み前に必ず弾く。
//
//   node scripts/validate-tour.mjs <payload.json> <tour.json> <tourKey>
//   tourKey: "repository" | "pull_request" | "file:<path>"
import { readFileSync } from "node:fs";

const MAX_STEPS = 15;
const MAX_TITLE = 120;
const MAX_SUMMARY = 800;
// ステップ名と注釈の見出しはビューアで 2 行まで折り返して表示する。上限はその幅に合わせる。
const MAX_STEP_TITLE = 60;
const MAX_ANNOTATION_LABEL = 36;
// from（どの式から来たか）の種類。ビューアの HopKind と同じ値。
const HOP_KINDS = ["callee", "data_flow", "return"];

const [payloadPath, tourPath, tourKey] = process.argv.slice(2);
if (!payloadPath || !tourPath || !tourKey) {
  console.error(
    "usage: node scripts/validate-tour.mjs <payload.json> <tour.json> <tourKey>",
  );
  process.exit(1);
}

const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
const result = JSON.parse(readFileSync(tourPath, "utf8"));
const tour = result.tour;
const errors = [];
const warnings = [];
const push = (message) => errors.push(message);

// 許可パス集合（readable なファイルと diff パス）
const readablePaths = new Set(Object.keys(payload.fileContents));
// 説明文のファイル参照はツリー上の全ファイルを指せる（readable でなくても placeholder が開く）。
const snapshotPaths = new Set(
  (payload.workspace?.snapshot?.files ?? []).map((file) => file.path),
);
const isPr = tourKey === "pull_request";
const allowFileless = isPr || tourKey === "repository"; // 概観ステップ
const lineCountOf = (path) => payload.fileContents[path]?.lineCount ?? 0;
const lineTextOf = (path, line) =>
  (payload.fileContents[path]?.content ?? "").split("\n")[line - 1];
// symbolIndex の位置は 1 始まりの行と UTF-16 コード単位の列（symbol-index.mjs が生成）。
// 索引は「宣言のある名前の出現」しか持たないので、名前が無いとき（ライブラリのメソッドや
// 分割代入で作った名前）は照合しない。予算超過で出現を落とした（degraded）索引も同様。
const symbolIndex = payload.symbolIndex;
const symbolIndexKnows = (name) =>
  Boolean(symbolIndex) &&
  !symbolIndex.degraded &&
  symbolIndex.symbols.some((symbol) => symbol.name === name);
const symbolOccursAt = (name, file, line, column) => {
  const pathIndex = symbolIndex.paths.indexOf(file);
  const entry = symbolIndex.symbols.find((symbol) => symbol.name === name);
  if (pathIndex < 0 || !entry) return false;
  const matches = (position) =>
    position[0] === pathIndex && position[1] === line && position[2] === column;
  return entry.occurrences.some(matches) || entry.declarations.some(matches);
};
let hopCount = 0;

// 説明文（Markdown）のインラインコードのうち、ファイルパスの形をしているのに
// snapshot に無いものを拾う。グロブなど正当な用途もあるので警告に留める。
const INLINE_CODE = /`([^`\n]+)`/g;
const PATH_LIKE = /^[\w@.\-/]+(?::\d+(?:-\d+)?)?$/;
const checkFileReferences = (text, label) => {
  for (const match of String(text ?? "").matchAll(INLINE_CODE)) {
    const candidate = match[1].trim();
    if (!candidate.includes("/") || !PATH_LIKE.test(candidate)) continue;
    const path = candidate.replace(/:\d+(?:-\d+)?$/, "");
    if (!snapshotPaths.has(path)) {
      warnings.push(
        `${label}: \`${candidate}\` は snapshot に無いパスなのでリンクになりません`,
      );
    }
  }
};

if (!tour) push("tour がありません");
else {
  if (!tour.title || tour.title.length > MAX_TITLE) {
    push(`title が空か ${MAX_TITLE} 字を超えています`);
  }
  if (!tour.summary || tour.summary.length > MAX_SUMMARY) {
    push(`summary が空か ${MAX_SUMMARY} 字を超えています`);
  }
  checkFileReferences(tour.summary, "summary");
  if (!Array.isArray(tour.steps) || tour.steps.length < 1 || tour.steps.length > MAX_STEPS) {
    push(`steps は 1〜${MAX_STEPS} 件である必要があります`);
  }
  const ids = new Set();
  for (const [index, step] of (tour.steps ?? []).entries()) {
    const at = `steps[${index}]`;
    if (!step.id || ids.has(step.id)) push(`${at}: id が空か重複しています`);
    ids.add(step.id);
    if (!step.title) push(`${at}: title が空です`);
    else if (step.title.length > MAX_STEP_TITLE) {
      push(`${at}: title が ${MAX_STEP_TITLE} 字を超えています (${step.title.length} 字)`);
    }
    if (!step.explanation) push(`${at}: explanation が空です`);
    checkFileReferences(step.explanation, `${at}.explanation`);
    if (step.relation != null &&
        !["definition", "reference", "caller", "callee", "data_flow"].includes(step.relation)) {
      push(`${at}: relation が不正です: ${step.relation}`);
    }
    const target = step.target;
    if (target == null) {
      if (!allowFileless) push(`${at}: このモードで概観ステップは使えません`);
      if ((step.annotations ?? []).length > 0) {
        push(`${at}: 概観ステップに annotation は置けません`);
      }
      if (step.from != null) push(`${at}: 概観ステップに from は置けません`);
      continue;
    }
    const checkTarget = (t, label, parentRange) => {
      if (t.file.startsWith("/") || t.file.split("/").includes("..")) {
        push(`${label}: 不正なパスです: ${t.file}`);
        return;
      }
      if (!readablePaths.has(t.file)) {
        push(`${label}: snapshot に存在しない/readable でないパスです: ${t.file}`);
        return;
      }
      const lines = lineCountOf(t.file);
      const r = t.range;
      if (!r || r.startLine < 1 || r.endLine < r.startLine || r.endLine > lines) {
        push(
          `${label}: 行範囲が不正です (${r?.startLine}-${r?.endLine} / 実 ${lines} 行)`,
        );
      }
      if (parentRange && t.file === target.file) {
        if (r.startLine < parentRange.startLine || r.endLine > parentRange.endLine) {
          push(`${label}: annotation がステップ範囲の外にあります`);
        }
      }
    };
    checkTarget(target, at);
    // from は直前ステップの範囲内にある 1 行の式を列まで正確に指す。ファイル・行・列・
    // シンボル名の食い違いはエラー（fail closed）。直前ステップの範囲外だけは警告に留める
    // （分割表示は成立し、クリックできる印が出ないだけのため）。
    const checkOrigin = (from, label) => {
      if (!HOP_KINDS.includes(from.kind)) {
        push(`${label}: kind が不正です: ${from.kind}`);
      }
      const before = errors.length;
      checkTarget(from, label);
      if (errors.length > before) return;
      const r = from.range;
      if (r.startLine !== r.endLine) {
        push(`${label}: from は 1 行の式を指してください (${r.startLine}-${r.endLine})`);
        return;
      }
      const lineText = lineTextOf(from.file, r.startLine) ?? "";
      const validColumn = (value) => Number.isInteger(value) && value >= 1;
      if (
        !validColumn(r.startColumn) ||
        !validColumn(r.endColumn) ||
        r.endColumn <= r.startColumn ||
        r.endColumn > lineText.length + 1
      ) {
        push(
          `${label}: 列が不正です (${r.startColumn}-${r.endColumn} / 行の長さ ${lineText.length})`,
        );
        return;
      }
      if (from.symbol != null) {
        const actual = lineText.slice(r.startColumn - 1, r.endColumn - 1);
        if (actual !== from.symbol) {
          push(`${label}: 範囲の本文 "${actual}" が symbol "${from.symbol}" と一致しません`);
          return;
        }
        if (!symbolIndex) {
          warnings.push(`${label}: symbolIndex が無いので symbol を索引と突き合わせられません`);
        } else if (
          symbolIndexKnows(from.symbol) &&
          !symbolOccursAt(from.symbol, from.file, r.startLine, r.startColumn)
        ) {
          push(`${label}: symbol "${from.symbol}" が symbolIndex のその位置にありません`);
          return;
        }
      }
      const previous = tour.steps[index - 1]?.target;
      const insidePrevious =
        previous &&
        previous.file === from.file &&
        r.startLine >= previous.range.startLine &&
        r.startLine <= previous.range.endLine;
      if (!insidePrevious) {
        warnings.push(
          `${label}: 直前ステップの範囲外にあるので、クリックできる印は出ません`,
        );
      }
      hopCount += 1;
    };
    if (step.from != null) checkOrigin(step.from, `${at}.from`);
    for (const [ai, annotation] of (step.annotations ?? []).entries()) {
      const alabel = `${at}.annotations[${ai}]`;
      if (!annotation.id) push(`${alabel}: id が空です`);
      if (!annotation.label) push(`${alabel}: label が空です`);
      else if (annotation.label.length > MAX_ANNOTATION_LABEL) {
        push(
          `${alabel}: label が ${MAX_ANNOTATION_LABEL} 字を超えています (${annotation.label.length} 字)`,
        );
      }
      if (!annotation.explanation) push(`${alabel}: explanation が空です`);
      checkFileReferences(annotation.explanation, `${alabel}.explanation`);
      if (annotation.target) checkTarget(annotation.target, alabel, target.range);
      else push(`${alabel}: target がありません`);
    }
  }
}

if (result.agent !== "claude") push(`agent は "claude" にしてください`);
if (result.warnings != null && !Array.isArray(result.warnings)) {
  push("warnings は配列にしてください");
}

for (const message of warnings) console.error(`validate-tour: warning: ${message}`);

if (errors.length > 0) {
  console.error(`validate-tour: ${tourKey} は不合格 (${errors.length} 件):`);
  for (const message of errors) console.error(`  - ${message}`);
  process.exit(2);
}
console.error(
  `validate-tour: ${tourKey} OK (${tour.steps.length} steps, ` +
    `${tour.steps.reduce((n, s) => n + (s.annotations?.length ?? 0), 0)} annotations, ` +
    `${hopCount} hops)`,
);
