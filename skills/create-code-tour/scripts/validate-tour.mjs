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
// ジャンプ（識別子から定義へ）。種類はビューアの JumpKind と同じ値。
const JUMP_KINDS = ["callee", "data_flow"];
const MAX_JUMP_DEPTH = 3;
const MAX_JUMPS_PER_SCOPE = 8;

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
// CRLF の本文でも行末の \r を列に数えない。
const lineTextOf = (path, line) =>
  (payload.fileContents[path]?.content ?? "").split("\n")[line - 1]?.replace(/\r$/, "");
// symbolIndex の位置は 1 始まりの行と UTF-16 コード単位の列（symbol-index.mjs が生成）。
// ジャンプの飛び先は「symbol の宣言を含む範囲」に限る。宣言は degraded でも残る。
const symbolIndex = payload.symbolIndex;
const declaredWithin = (name, file, range) => {
  const pathIndex = symbolIndex.paths.indexOf(file);
  const entry = symbolIndex.symbols.find((symbol) => symbol.name === name);
  if (pathIndex < 0 || !entry) return false;
  return entry.declarations.some(
    ([path, line]) => path === pathIndex && line >= range.startLine && line <= range.endLine,
  );
};
let jumpCount = 0;
const jumpIds = new Set();

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
      if ((step.jumps ?? []).length > 0) push(`${at}: 概観ステップに jumps は置けません`);
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
    // ジャンプはコードジャンプ（識別子 → その定義）と同じもの。from は今いる範囲
    // （ステップの対象、入れ子なら親の to）と同じファイルの 1 行の識別子を列まで正確に指し、
    // to はその識別子の宣言を含む範囲でなければならない（fail closed）。
    const checkJumps = (jumps, scope, label, depth) => {
      if (!Array.isArray(jumps)) {
        push(`${label}: jumps は配列にしてください`);
        return;
      }
      if (jumps.length > MAX_JUMPS_PER_SCOPE) {
        push(`${label}: jumps は 1 つの範囲に ${MAX_JUMPS_PER_SCOPE} 件までです (${jumps.length} 件)`);
      }
      if (depth > MAX_JUMP_DEPTH) {
        push(`${label}: ジャンプの入れ子は深さ ${MAX_JUMP_DEPTH} までです`);
        return;
      }
      for (const [ji, jump] of jumps.entries()) {
        const jlabel = `${label}[${ji}]`;
        if (!jump.id || jumpIds.has(jump.id)) push(`${jlabel}: id が空か重複しています`);
        jumpIds.add(jump.id);
        if (!JUMP_KINDS.includes(jump.kind)) push(`${jlabel}: kind が不正です: ${jump.kind}`);
        if (!jump.symbol) push(`${jlabel}: symbol が空です`);
        if (!jump.explanation) push(`${jlabel}: explanation が空です`);
        checkFileReferences(jump.explanation, `${jlabel}.explanation`);
        const r = jump.from;
        if (!r || r.startLine !== r.endLine) {
          push(`${jlabel}: from は 1 行の識別子を指してください (${r?.startLine}-${r?.endLine})`);
          continue;
        }
        if (r.startLine < scope.range.startLine || r.startLine > scope.range.endLine) {
          push(
            `${jlabel}: from が今いる範囲の外です (${r.startLine} 行 / 範囲 ${scope.range.startLine}-${scope.range.endLine})`,
          );
          continue;
        }
        const lineText = lineTextOf(scope.file, r.startLine) ?? "";
        const validColumn = (value) => Number.isInteger(value) && value >= 1;
        if (
          !validColumn(r.startColumn) ||
          !validColumn(r.endColumn) ||
          r.endColumn <= r.startColumn ||
          r.endColumn > lineText.length + 1
        ) {
          push(
            `${jlabel}: from の列が不正です (${r.startColumn}-${r.endColumn} / 行の長さ ${lineText.length})`,
          );
          continue;
        }
        const actual = lineText.slice(r.startColumn - 1, r.endColumn - 1);
        if (jump.symbol && actual !== jump.symbol) {
          push(`${jlabel}: from の本文 "${actual}" が symbol "${jump.symbol}" と一致しません`);
          continue;
        }
        if (!jump.to) {
          push(`${jlabel}: to がありません`);
          continue;
        }
        const before = errors.length;
        checkTarget(jump.to, `${jlabel}.to`);
        if (errors.length > before) continue;
        if (!symbolIndex) {
          push(`${jlabel}: ジャンプの検証には symbolIndex が必要です`);
          continue;
        }
        if (jump.symbol && !declaredWithin(jump.symbol, jump.to.file, jump.to.range)) {
          push(
            `${jlabel}: 飛び先 ${jump.to.file}:${jump.to.range.startLine}-${jump.to.range.endLine} に symbol "${jump.symbol}" の宣言がありません`,
          );
          continue;
        }
        jumpCount += 1;
        if (jump.jumps != null) {
          checkJumps(jump.jumps, jump.to, `${jlabel}.jumps`, depth + 1);
        }
      }
    };
    if (step.jumps != null) checkJumps(step.jumps, target, `${at}.jumps`, 1);
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
    `${jumpCount} jumps)`,
);
