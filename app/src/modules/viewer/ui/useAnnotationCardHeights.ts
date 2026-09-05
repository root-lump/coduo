import { useLayoutEffect, useRef, useState } from "react";

const sameHeights = (
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>,
) => {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
  );
};

/**
 * レール内の注釈カードの実測高さ。カードの高さは見出しの行数と説明文の量で変わるため、
 * 定数で積むとカードの位置と間隔が実際の描画とずれる。
 * カードの高さはレール幅と内容だけで決まり、レイアウトが書き込む top には依存しないので、
 * 計測と再配置が互いを呼び合うことはない。
 */
export function useAnnotationCardHeights(cardsKey: string) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [heights, setHeights] = useState<Readonly<Record<string, number>>>({});

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const cards = Array.from(
      content.querySelectorAll<HTMLElement>("[data-annotation-id]"),
    );
    const measure = () => {
      const measured: Record<string, number> = {};
      for (const card of cards) {
        const id = card.dataset.annotationId;
        // 表示倍率は documentElement の CSS zoom で変えるため、
        // getBoundingClientRect はスケール後の値を返す。カードの top は
        // スケール前の座標に書くので、同じ座標系の offsetHeight で測る。
        const height = card.offsetHeight;
        // レイアウトを持たない環境（jsdom）では 0 が返る。見積もりを使わせる。
        if (id && height > 0) measured[id] = height;
      }
      setHeights((current) => (sameHeights(current, measured) ? current : measured));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    for (const card of cards) observer.observe(card);
    return () => observer.disconnect();
  }, [cardsKey]);

  return { contentRef, heights };
}
