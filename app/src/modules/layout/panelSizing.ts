export const DEFAULT_PANEL_WIDTHS = {
  left: 315,
  right: 453,
} as const;

export const PANEL_LIMITS = {
  leftMin: 225,
  centerMin: 400,
  rightMin: 358,
  handleWidth: 9,
} as const;

export type PanelWidths = {
  left: number;
  right: number;
};

export type ResizeSide = "left" | "right";

export type PanelWidthStorage = Pick<Storage, "getItem" | "setItem">;

export function resolvePanelWidthStorage(
  getStorage: () => PanelWidthStorage | undefined,
): PanelWidthStorage | undefined {
  try {
    return getStorage();
  } catch {
    return undefined;
  }
}

const finiteWidth = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : fallback;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

export function parseStoredPanelWidths(value: string | null): PanelWidths {
  if (!value) {
    return { ...DEFAULT_PANEL_WIDTHS };
  }

  try {
    const parsed = JSON.parse(value) as Partial<PanelWidths>;
    return {
      left: finiteWidth(parsed.left, DEFAULT_PANEL_WIDTHS.left),
      right: finiteWidth(parsed.right, DEFAULT_PANEL_WIDTHS.right),
    };
  } catch {
    return { ...DEFAULT_PANEL_WIDTHS };
  }
}

export function loadPanelWidths(
  storage: PanelWidthStorage | undefined,
  key: string,
): PanelWidths {
  try {
    return parseStoredPanelWidths(storage?.getItem(key) ?? null);
  } catch {
    return { ...DEFAULT_PANEL_WIDTHS };
  }
}

export function savePanelWidths(
  storage: PanelWidthStorage | undefined,
  key: string,
  widths: PanelWidths,
) {
  try {
    storage?.setItem(key, JSON.stringify(widths));
  } catch {
    // WebView のストレージが使えなくても、パネルのリサイズ自体は動くようにする。
  }
}

export function constrainPanelWidths(
  widths: PanelWidths,
  containerWidth: number,
  hasLeftPanel: boolean,
  resizedSide?: ResizeSide,
): PanelWidths {
  const handleCount = hasLeftPanel ? 2 : 1;
  const panelSpace = Math.max(
    0,
    finiteWidth(containerWidth, 0) -
      PANEL_LIMITS.centerMin -
      handleCount * PANEL_LIMITS.handleWidth,
  );

  if (!hasLeftPanel) {
    return {
      left: finiteWidth(widths.left, DEFAULT_PANEL_WIDTHS.left),
      right: clamp(
        finiteWidth(widths.right, DEFAULT_PANEL_WIDTHS.right),
        PANEL_LIMITS.rightMin,
        panelSpace,
      ),
    };
  }

  const requestedLeft = finiteWidth(widths.left, DEFAULT_PANEL_WIDTHS.left);
  const requestedRight = finiteWidth(widths.right, DEFAULT_PANEL_WIDTHS.right);

  if (resizedSide === "right") {
    const left = clamp(
      requestedLeft,
      PANEL_LIMITS.leftMin,
      panelSpace - PANEL_LIMITS.rightMin,
    );
    return {
      left,
      right: clamp(requestedRight, PANEL_LIMITS.rightMin, panelSpace - left),
    };
  }

  const right = clamp(
    requestedRight,
    PANEL_LIMITS.rightMin,
    panelSpace - PANEL_LIMITS.leftMin,
  );
  return {
    left: clamp(requestedLeft, PANEL_LIMITS.leftMin, panelSpace - right),
    right,
  };
}

export function resizePanelFromDrag(
  startWidths: PanelWidths,
  side: ResizeSide,
  deltaX: number,
  containerWidth: number,
  hasLeftPanel: boolean,
): PanelWidths {
  return constrainPanelWidths(
    {
      left: side === "left" ? startWidths.left + deltaX : startWidths.left,
      right: side === "right" ? startWidths.right - deltaX : startWidths.right,
    },
    containerWidth,
    hasLeftPanel,
    side,
  );
}
