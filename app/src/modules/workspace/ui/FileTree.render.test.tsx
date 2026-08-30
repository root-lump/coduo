// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RepositoryFile } from "../domain";
import { FileTree } from "./FileTree";

function repoFile(path: string): RepositoryFile {
  const name = path.split("/").at(-1) ?? path;
  const extension = name.includes(".") ? name.split(".").at(-1)! : null;
  return { path, name, extension, size: 10, readability: "readable" };
}

const files = [
  repoFile("README.md"),
  repoFile("src/app/main.ts"),
  repoFile("src/lib.ts"),
];

describe("FileTree", () => {
  it("starts with every folder collapsed", () => {
    render(<FileTree files={files} onSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: "src" })).toHaveProperty(
      "ariaExpanded",
      "false",
    );
    expect(screen.queryByRole("button", { name: "lib.ts" })).toBeNull();
    // ルート直下のファイルは畳まれない。
    expect(screen.getByRole("button", { name: "README.md" })).toBeTruthy();
  });

  it("expands and collapses a folder on click", () => {
    render(<FileTree files={files} onSelect={vi.fn()} />);

    const folder = screen.getByRole("button", { name: "src" });
    fireEvent.click(folder);
    expect(screen.getByRole("button", { name: "lib.ts" })).toBeTruthy();
    fireEvent.click(folder);
    expect(screen.queryByRole("button", { name: "lib.ts" })).toBeNull();
  });

  it("auto-expands ancestors of the active file and highlights it", () => {
    const { rerender } = render(<FileTree files={files} onSelect={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "main.ts" })).toBeNull();

    rerender(
      <FileTree
        files={files}
        activePath="src/app/main.ts"
        onSelect={vi.fn()}
      />,
    );

    const active = screen.getByRole("button", { name: "main.ts" });
    expect(active.className).toContain("is-active");
    expect(
      screen.getByRole("button", { name: "lib.ts" }).className,
    ).not.toContain("is-active");
  });

  it("notifies a file selection", () => {
    const onSelect = vi.fn();
    render(
      <FileTree files={files} activePath="src/lib.ts" onSelect={onSelect} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "lib.ts" }));
    expect(onSelect).toHaveBeenCalledWith("src/lib.ts");
  });
});
