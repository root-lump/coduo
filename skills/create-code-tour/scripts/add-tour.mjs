// validate-tour を通過した Tour を payload の tours へ決定的に組み込む。
//   node scripts/add-tour.mjs <payload.json> <tour.json> <tourKey>
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { stableStringify } from "./lib.mjs";

const [payloadPath, tourPath, tourKey] = process.argv.slice(2);
if (!payloadPath || !tourPath || !tourKey) {
  console.error("usage: node scripts/add-tour.mjs <payload.json> <tour.json> <tourKey>");
  process.exit(1);
}

// 埋め込み前に必ず検証する（検証なしの組み込み経路を作らない）
execFileSync(
  process.execPath,
  [new URL("./validate-tour.mjs", import.meta.url).pathname, payloadPath, tourPath, tourKey],
  { stdio: "inherit" },
);

const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
payload.tours[tourKey] = JSON.parse(readFileSync(tourPath, "utf8"));
writeFileSync(payloadPath, stableStringify(payload));
console.error(`add-tour: ${tourKey} を組み込みました`);
