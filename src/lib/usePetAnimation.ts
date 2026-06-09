import { useEffect, useRef, useState } from "react";
import { STATE_DEFINITIONS, type PetState } from "./petContract";

export function usePetAnimation(
  state: PetState,
  speed: number,
  reducedMotion: boolean,
): number {
  const [frame, setFrame] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setFrame(0);
    if (reducedMotion) {
      return;
    }

    const definition = STATE_DEFINITIONS[state];
    let current = 0;
    const tick = () => {
      current = (current + 1) % definition.frames;
      setFrame(current);
      const duration = definition.durations[current] ?? 140;
      timerRef.current = window.setTimeout(tick, Math.max(40, duration / speed));
    };

    timerRef.current = window.setTimeout(tick, definition.durations[0] ?? 140);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [reducedMotion, speed, state]);

  return frame;
}
