/**
 * High-DPI safe drag accumulator.
 * Uses PointerEvent.movementX/Y (CSS pixels) so deltas stay aligned with
 * logical window coordinates returned by get_pet_window_frame / move_pet_window.
 */
export interface PetDragState {
  pointerId: number;
  originX: number;
  originY: number;
  windowOffsetX: number;
  windowOffsetY: number;
  accumX: number;
  accumY: number;
  moved: boolean;
  lastDirection: "running-left" | "running-right" | null;
}

export function createPetDragState(input: {
  pointerId: number;
  originX: number;
  originY: number;
  windowOffsetX: number;
  windowOffsetY: number;
}): PetDragState {
  return {
    pointerId: input.pointerId,
    originX: input.originX,
    originY: input.originY,
    windowOffsetX: input.windowOffsetX,
    windowOffsetY: input.windowOffsetY,
    accumX: 0,
    accumY: 0,
    moved: false,
    lastDirection: null,
  };
}

export function applyPetDragMovement(
  drag: PetDragState,
  movementX: number,
  movementY: number,
): { petAnchor: { x: number; y: number }; direction: "running-left" | "running-right" } | null {
  drag.accumX += movementX;
  drag.accumY += movementY;
  if (Math.abs(drag.accumX) + Math.abs(drag.accumY) < 2) {
    return null;
  }
  drag.moved = true;
  const direction = drag.accumX < 0 ? "running-left" : "running-right";
  drag.lastDirection = direction;
  return {
    petAnchor: {
      x: Math.round(drag.originX + drag.accumX),
      y: Math.round(drag.originY + drag.accumY),
    },
    direction,
  };
}
