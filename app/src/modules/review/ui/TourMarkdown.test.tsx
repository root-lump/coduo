// @vitest-environment jsdom
// TourMarkdown の描画テスト（Markdown 記法・ファイル参照リンク・HTML の無視）。
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { parseFileReference } from "../../workspace";
import { TourMarkdown } from "./TourMarkdown";

const files = new Set(["src/lib.rs"]);

function renderMarkdown(text: string) {
  const onOpenFileReference = vi.fn();
  const { container } = render(
    <TourMarkdown
      text={text}
      resolveFileReference={(candidate) => parseFileReference(candidate, files)}
      onOpenFileReference={onOpenFileReference}
    />,
  );
  return { container, onOpenFileReference };
}

describe("TourMarkdown", () => {
  it("強調と箇条書きを要素として描画する", () => {
    const { container } = renderMarkdown("**中核** の処理です。\n\n- 一つ目\n- 二つ目");
    expect(container.querySelector("strong")?.textContent).toBe("中核");
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("snapshot にあるパスのインラインコードはファイルリンクになり、click で通知する", () => {
    const { onOpenFileReference } = renderMarkdown("`src/lib.rs:1-3` を見ます。");
    const link = screen.getByRole("button", { name: "src/lib.rs:1-3" });
    fireEvent.click(link);
    expect(onOpenFileReference).toHaveBeenCalledWith({
      file: "src/lib.rs",
      range: { startLine: 1, endLine: 3 },
    });
  });

  it("パスに一致しないインラインコードは code のまま出す", () => {
    const { container } = renderMarkdown("`answer()` を呼びます。");
    expect(container.querySelector("code")?.textContent).toBe("answer()");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("コードブロックの中のパスはリンクにしない", () => {
    const { container } = renderMarkdown("```\nsrc/lib.rs\n```");
    expect(container.querySelector("pre code")?.textContent).toContain(
      "src/lib.rs",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("raw HTML は要素にせず、画像は落とす", () => {
    const { container } = renderMarkdown(
      '<script>alert(1)</script> 本文 ![alt](http://example.com/a.png)',
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("本文");
  });

  it("リンクは別タブで開き、noopener を付ける", () => {
    renderMarkdown("[仕様](https://example.com/spec)");
    const anchor = screen.getByRole("link", { name: "仕様" });
    expect(anchor.getAttribute("target")).toBe("_blank");
    expect(anchor.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
