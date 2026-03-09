import type { ContextMenuPlacement } from "../../stores/useUIStore";

export interface ContextMenuAnchor {
  x: number;
  y: number;
}

export interface ResolvedContextMenuPosition {
  x: number;
  y: number;
  placement: ContextMenuPlacement;
  collisionAdjusted: boolean;
}

const MENU_WIDTH = 220;
const MENU_ITEM_HEIGHT = 40;
const MENU_PADDING = 16;
const VIEWPORT_MARGIN = 12;

export const resolveContextMenuPosition = (
  anchor: ContextMenuAnchor,
  viewportWidth: number,
  viewportHeight: number,
  actionCount: number
): ResolvedContextMenuPosition => {
  const menuHeight = actionCount * MENU_ITEM_HEIGHT + MENU_PADDING;
  const maxX = Math.max(viewportWidth - MENU_WIDTH - VIEWPORT_MARGIN, VIEWPORT_MARGIN);
  const maxY = Math.max(viewportHeight - menuHeight - VIEWPORT_MARGIN, VIEWPORT_MARGIN);
  const nextX = Math.min(Math.max(anchor.x, VIEWPORT_MARGIN), maxX);
  const nextY = Math.min(Math.max(anchor.y, VIEWPORT_MARGIN), maxY);
  const placement: ContextMenuPlacement =
    anchor.x + MENU_WIDTH > viewportWidth - VIEWPORT_MARGIN ? "bottom-end" : "bottom-start";

  return {
    x: nextX,
    y: nextY,
    placement,
    collisionAdjusted: nextX !== anchor.x || nextY !== anchor.y,
  };
};
