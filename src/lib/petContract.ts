export const ATLAS_COLUMNS = 8;
export const ATLAS_ROWS = 9;
export const BASE_CELL = { width: 192, height: 208 };

export type PetState =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review";

export type SpriteScale = 1 | 2 | 4;

export interface SpriteSources {
  "1x": string;
  "2x"?: string;
  "4x"?: string;
}

export interface CellSize {
  width: number;
  height: number;
}

export interface PetPackage {
  id: string;
  displayName: string;
  description: string;
  rootDir: string;
  manifestPath: string;
  spritesheetPath: string;
  spritesheets: SpriteSources;
  cellSize: CellSize;
  sourceScale: number;
  pixelated: boolean;
}

export interface StateDefinition {
  row: number;
  frames: number;
  durations: number[];
}

export const STATE_DEFINITIONS: Record<PetState, StateDefinition> = {
  idle: {
    row: 0,
    frames: 6,
    durations: [280, 110, 110, 140, 140, 320],
  },
  "running-right": {
    row: 1,
    frames: 8,
    durations: [120, 120, 120, 120, 120, 120, 120, 220],
  },
  "running-left": {
    row: 2,
    frames: 8,
    durations: [120, 120, 120, 120, 120, 120, 120, 220],
  },
  waving: {
    row: 3,
    frames: 4,
    durations: [140, 140, 140, 280],
  },
  jumping: {
    row: 4,
    frames: 5,
    durations: [140, 140, 140, 140, 280],
  },
  failed: {
    row: 5,
    frames: 8,
    durations: [140, 140, 140, 140, 140, 140, 140, 240],
  },
  waiting: {
    row: 6,
    frames: 6,
    durations: [150, 150, 150, 150, 150, 260],
  },
  running: {
    row: 7,
    frames: 6,
    durations: [120, 120, 120, 120, 120, 220],
  },
  review: {
    row: 8,
    frames: 6,
    durations: [150, 150, 150, 150, 150, 280],
  },
};

export const PET_STATES = Object.keys(STATE_DEFINITIONS) as PetState[];

export function pickSpriteSource(
  spritesheets: SpriteSources,
  displaySize: CellSize,
  cellSize: CellSize,
  devicePixelRatio: number,
): { path: string; scale: SpriteScale } {
  const targetScale =
    Math.max(displaySize.width / cellSize.width, displaySize.height / cellSize.height) *
    Math.max(1, devicePixelRatio);

  const available: Array<{ scale: SpriteScale; path?: string }> = [
    { scale: 1 as const, path: spritesheets["1x"] },
    { scale: 2 as const, path: spritesheets["2x"] },
    { scale: 4 as const, path: spritesheets["4x"] },
  ].filter((entry) => Boolean(entry.path));

  const preferred =
    available.find((entry) => entry.scale >= targetScale) ?? available[available.length - 1];
  const fallback = spritesheets["1x"];

  return {
    path: preferred?.path ?? fallback,
    scale: preferred?.scale ?? 1,
  };
}
