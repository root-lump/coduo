// Monaco basic-languages のうち template に焼き込んでいない言語を、
// Artifact 組み立て時（embed-snapshot.mjs）に注入できる形へ書き出す。
//
//   node scripts/generate-languages.mjs
//
// 出力（../skills/create-code-tour/assets/languages/）:
//   <id>.js        globalThis.coduoExtraLanguages へ push する古典スクリプト。
//                  viewer は Monaco 初期化時にこのキューを registerLanguage する
//   manifest.json  builtIn（template 焼き込み済み ID）・言語 ID → 拡張子/ファイル名・
//                  拡張子 → 言語 ID の索引。embed-snapshot と collect 側 lib.mjs が参照する
//
// template へ全言語を焼き込まない理由は monacoEnvironment.ts 冒頭を参照
// （バンドル肥大と publish 検証の誤検知）。ここでは monarch 文法だけを、
// payload が実際に使う言語に限って後付けする。
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const definitionsDir = join(
  appRoot, "node_modules", "monaco-editor", "esm", "vs", "languages", "definitions",
);
const outDir = join(appRoot, "..", "skills", "create-code-tour", "assets", "languages");
const monacoVersion = JSON.parse(
  readFileSync(join(appRoot, "node_modules", "monaco-editor", "package.json"), "utf8"),
).version;

// template 焼き込み済み言語は monacoEnvironment.ts の register import が正本。
// 手書きの複製を作らず、ここでパースして常に一致させる。
const environmentSource = readFileSync(
  join(appRoot, "src", "modules", "viewer", "monacoEnvironment.ts"),
  "utf8",
);
const builtInDirs = [
  ...environmentSource.matchAll(/languages\/definitions\/([\w-]+)\/register\.js/g),
].map((match) => match[1]);
if (builtInDirs.length === 0) {
  throw new Error("monacoEnvironment.ts から register import を検出できませんでした");
}

/** conf / language（文字列・数値・真偽・配列・オブジェクト・RegExp）を JS ソースへ。 */
function serialize(value, path) {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (value instanceof RegExp) {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return `[${value.map((item, i) => serialize(item, `${path}[${i}]`)).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => `${JSON.stringify(key)}:${serialize(entry, `${path}.${key}`)}`)
      .join(",")}}`;
  }
  // 関数などが混ざる定義はデータとして持ち出せない（呼び出し元で言語ごと skip する）
  throw new Error(`serialize 不能な値 (${typeof value}) at ${path}`);
}

// register.js から registerLanguage({...}) のメタデータを抜き出す。
// loader（動的 import）は評価せず、複数バリアント（freemarker2 等）は
// loader が参照する export 名で本体を引く。
function parseRegistrations(source) {
  const registrations = [];
  const pattern = /registerLanguage\(\{([\s\S]*?)\}\);/g;
  for (const match of source.matchAll(pattern)) {
    const block = match[1];
    const id = /id:\s*"([^"]+)"/.exec(block)?.[1];
    if (!id) continue;
    const list = (name) => {
      const raw = new RegExp(`${name}:\\s*(\\[[^\\]]*\\])`).exec(block)?.[1];
      return raw ? JSON.parse(raw) : undefined;
    };
    registrations.push({
      id,
      extensions: list("extensions"),
      filenames: list("filenames"),
      aliases: list("aliases"),
      exportName: /=>\s*m\.(\w+)/.exec(block)?.[1],
    });
  }
  return registrations;
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const builtInIds = [];
const manifest = {
  monacoVersion,
  builtIn: builtInIds,
  // 言語 ID → 補完スクリプトの有無と拡張子。embed-snapshot が注入判定に使う
  languages: {},
  // 拡張子（先頭ドット無し・小文字）→ 言語 ID。lib.mjs の言語判定 fallback
  extensionToId: {},
  filenameToId: {},
};
const skipped = [];

for (const dir of readdirSync(definitionsDir).sort()) {
  if (dir.startsWith("_") || dir.startsWith("register.all")) continue;
  const registerSource = readFileSync(join(definitionsDir, dir, "register.js"), "utf8");
  const registrations = parseRegistrations(registerSource);
  const moduleFile = join(definitionsDir, dir, `${dir}.js`);
  const moduleSource = readFileSync(moduleFile, "utf8");
  // editor.api 等へ依存する定義（mdx など）はデータとして持ち出せないので飛ばす
  const selfContained = !/^import /m.test(moduleSource);
  const module = selfContained ? await import(pathToFileURL(moduleFile)) : null;

  // 焼き込み済み register.js はロード時に配下の全 ID を登録するため、
  // 判定はディレクトリ単位で行う（例: cpp が "c" と "cpp" の両方を登録する）
  const isBuiltInDir = builtInDirs.includes(dir);
  for (const registration of registrations) {
    const { id, extensions, filenames, aliases, exportName } = registration;
    if (isBuiltInDir) builtInIds.push(id);
    // 拡張子でもファイル名でも到達できない ID（バリアント別 ID 等）は載せない
    if (!extensions?.length && !filenames?.length) continue;
    const definition = exportName ? module?.[exportName] : module;
    const language = definition?.language;
    if (isBuiltInDir || !language) {
      if (!isBuiltInDir) skipped.push(id);
    } else {
      let body;
      try {
        body = serialize(
          { id, extensions, aliases, conf: definition.conf ?? null, language },
          id,
        );
      } catch (cause) {
        skipped.push(`${id} (${cause.message})`);
        continue;
      }
      writeFileSync(
        join(outDir, `${id}.js`),
        `// 自動生成: monaco-editor ${monacoVersion} basic-languages/${dir} より（generate-languages.mjs）。直接編集しない。\n` +
          `(globalThis.coduoExtraLanguages ??= []).push(${body});\n`,
      );
      manifest.languages[id] = { file: `${id}.js` };
    }
    for (const extension of extensions ?? []) {
      manifest.extensionToId[extension.replace(/^\./, "").toLowerCase()] ??= id;
    }
    for (const filename of filenames ?? []) {
      manifest.filenameToId[filename] ??= id;
    }
  }
}

builtInIds.sort();
writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      builtIn: manifest.builtIn.length,
      supplementable: Object.keys(manifest.languages).length,
      extensions: Object.keys(manifest.extensionToId).length,
      skipped,
    },
    null,
    2,
  ),
);
