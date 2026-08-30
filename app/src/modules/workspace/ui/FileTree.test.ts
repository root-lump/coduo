import { describe, expect, it } from "vitest";
import { buildFileTree } from "./FileTree";

describe("buildFileTree", () => {
  it("groups repository files into sorted folders", () => {
    const tree = buildFileTree([
      {
        path: "README.md",
        name: "README.md",
        extension: "md",
        size: 20,
        readability: "readable",
      },
      {
        path: "src/z.ts",
        name: "z.ts",
        extension: "ts",
        size: 10,
        readability: "readable",
      },
      {
        path: "src/a.ts",
        name: "a.ts",
        extension: "ts",
        size: 10,
        readability: "readable",
      },
    ]);

    expect(tree.map((node) => `${node.type}:${node.name}`)).toEqual([
      "folder:src",
      "file:README.md",
    ]);
    expect(tree[0]?.children.map((node) => node.name)).toEqual([
      "a.ts",
      "z.ts",
    ]);
  });
});
