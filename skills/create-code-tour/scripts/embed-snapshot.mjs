// ビルド済み template へ snapshot payload を埋め込み、
// 配布可能な単一 Coduo Artifact ファイルを組み立てる。
//   node embed-snapshot.mjs <payload.json> <out.html> [--title "<title>"] [--template <path>]
// 決定的生成のため、入力 payload の JSON をそのまま（再整形せず）埋め込む。
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const positional = args.filter(
  (a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"),
);
const [payloadPath, outPath] = positional;
if (!payloadPath || !outPath) {
  console.error(
    'usage: node embed-snapshot.mjs <payload.json> <out.html> [--title "<title>"] [--template <path>]',
  );
  process.exit(1);
}

const templatePath =
  flag("--template") ?? new URL("../assets/template.html", import.meta.url);
// Artifact の publish 検証は生の U+FFFD を拒否するため、
// JS 文字列リテラル内の実体を � エスケープへ正規化する。
const template = readFileSync(templatePath, "utf8").replaceAll(
  "�",
  "\\uFFFD",
);
const payloadRaw = readFileSync(payloadPath, "utf8");
// payload 側も同様に正規化する。payload は JSON テキストであり、生の U+FFFD は
// 必ず文字列リテラルの内側にしか現れないため、� エスケープへ置換しても
// JSON.parse 後の内容は 1 文字も変わらない（ソース由来の文字化けはそのまま再現される）。
const payloadText = payloadRaw.replaceAll("�", "\\uFFFD");

// JSON を検証してから埋め込む（壊れた payload を配布しない）。
const parsed = JSON.parse(payloadText);
if (parsed.version !== 1 || !parsed.workspace?.snapshot || !parsed.source) {
  console.error("payload が CoduoSnapshotPayload v1 の形をしていません");
  process.exit(1);
}

// script 終端の誤検出を防ぐ。JSON 文字列内の "</" は "<\/" と等価。
const safe = payloadText.replace(/<\//g, "<\\/");
const tag = `<script type="application/json" id="coduo-snapshot">${safe}</script>`;

// 言語補完: payload が使う言語のうち template に焼き込まれていないものは、
// assets/languages/ の monarch 文法（generate-languages.mjs の生成物）を一緒に
// 埋め込む。viewer は Monaco 初期化時に globalThis.coduoExtraLanguages を登録する。
const languagesDir = new URL("../assets/languages/", import.meta.url);
let supplementedLanguages = [];
let languageTag = "";
try {
  const manifest = JSON.parse(
    readFileSync(new URL("manifest.json", languagesDir), "utf8"),
  );
  const used = new Set(
    Object.values(parsed.fileContents).map((file) => file.language),
  );
  supplementedLanguages = [...used]
    .filter((id) => !manifest.builtIn.includes(id) && manifest.languages[id])
    .sort();
  if (supplementedLanguages.length > 0) {
    const source = supplementedLanguages
      .map((id) =>
        readFileSync(new URL(manifest.languages[id].file, languagesDir), "utf8"),
      )
      .join("");
    // HTML パーサは "</script" で終端し、publish 検証は生の U+FFFD を拒否する。
    // どちらも JS ソース中の文字列/正規表現リテラル内では等価なエスケープに置換できる。
    languageTag = `<script>${source
      .replace(/<\/script/gi, "<\\/script")
      .replaceAll("�", "\\uFFFD")}</script>`;
  }
} catch {
  /* 言語アセットの無い構成では補完なしで組み立てる */
}

// inline された JS 内にも "</body>" という文字列が現れうるため、
// 文書末尾の閉じタグ（最後の出現）に対して挿入する。
const closeAt = template.lastIndexOf("</body>");
if (closeAt === -1) {
  console.error("template に </body> が見つかりません");
  process.exit(1);
}
let output =
  template.slice(0, closeAt) + languageTag + tag + template.slice(closeAt);

const title = flag("--title");
if (title) {
  output = output.replace(
    /<title>[^<]*<\/title>/,
    `<title>${title.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</title>`,
  );
}

writeFileSync(outPath, output);

// payloadSha256 は入力 payload.json との照合用なので、U+FFFD 置換前のテキストで計算する
// （埋め込み文字列のハッシュではない）。
const hash = createHash("sha256").update(payloadRaw).digest("hex");
console.log(
  JSON.stringify(
    {
      out: outPath,
      title: title ?? "(template のまま)",
      payloadBytes: payloadRaw.length,
      supplementedLanguages,
      outputBytes: output.length,
      payloadSha256: hash,
    },
    null,
    2,
  ),
);
