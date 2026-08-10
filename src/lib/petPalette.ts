export interface PetPalette {
  accent: string;
  bubble: string;
  ink: string;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export const DEFAULT_PALETTE: PetPalette = {
  accent: "#5da996",
  bubble: "#eef7f1",
  ink: "#171615",
};

export function extractPetPalette(
  url: string,
  cellWidth: number,
  cellHeight: number,
): Promise<PetPalette> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 48;
        canvas.height = 52;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          reject(new Error("Canvas is unavailable"));
          return;
        }
        context.drawImage(image, 0, 0, cellWidth, cellHeight, 0, 0, canvas.width, canvas.height);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        let red = 0;
        let green = 0;
        let blue = 0;
        let total = 0;

        for (let index = 0; index < data.length; index += 4) {
          const alpha = data[index + 3];
          if (alpha < 44) {
            continue;
          }

          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const saturation = max - min;
          const brightness = (r + g + b) / 3;
          if (brightness > 236 && saturation < 28) {
            continue;
          }

          const weight = (alpha / 255) * (1 + saturation / 180);
          red += r * weight;
          green += g * weight;
          blue += b * weight;
          total += weight;
        }

        if (total <= 0) {
          resolve(DEFAULT_PALETTE);
          return;
        }

        resolve(
          createPalette({
            r: Math.round(red / total),
            g: Math.round(green / total),
            b: Math.round(blue / total),
          }),
        );
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("Failed to load pet sprite"));
    image.src = url;
  });
}

function createPalette(accent: RgbColor): PetPalette {
  const bubble = blend(accent, { r: 255, g: 253, b: 247 }, 0.78);
  return {
    accent: toRgb(accent),
    bubble: toRgb(bubble),
    ink: relativeLuminance(bubble) > 0.58 ? "#171615" : "#fffaf2",
  };
}

function blend(foreground: RgbColor, background: RgbColor, backgroundAmount: number): RgbColor {
  const foregroundAmount = 1 - backgroundAmount;
  return {
    r: Math.round(foreground.r * foregroundAmount + background.r * backgroundAmount),
    g: Math.round(foreground.g * foregroundAmount + background.g * backgroundAmount),
    b: Math.round(foreground.b * foregroundAmount + background.b * backgroundAmount),
  };
}

function toRgb(color: RgbColor): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function relativeLuminance(color: RgbColor): number {
  const [r, g, b] = [color.r, color.g, color.b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
