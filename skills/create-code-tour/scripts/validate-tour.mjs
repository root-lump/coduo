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
    `${tour.steps.reduce((n, s) => n + (s.annotations?.length ?? 0), 0)} annotations)`,
);
