const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  css: "css",
  go: "go",
  graphql: "graphql",
  graphqls: "graphql",
  html: "html",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  md: "markdown",
  py: "python",
  rs: "rust",
  sh: "shell",
  toml: "toml",
  ts: "typescript",
  tsx: "typescript",
  yaml: "yaml",
  yml: "yaml",
};

export function languageFromPath(path?: string): string {
  const extension = path?.split(".").at(-1)?.toLowerCase() ?? "";
  return LANGUAGE_BY_EXTENSION[extension] ?? "plaintext";
}
