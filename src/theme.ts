/**
 * Pip-Boy color theming: a client-scoped setting recolors every sheet via
 * CSS custom properties, deriving dim/bright variants from one accent hue —
 * monochrome like the real wrist-computer. Danger red stays red.
 */

const SYSTEM_ID = "fallout-ttrpg";

export const THEME_PRESETS = {
  green: "#6ee86e",
  amber: "#ffb641",
  blue: "#46c8ff",
  white: "#e8f0e8",
  red: "#ff5442",
} as const;

type PresetKey = keyof typeof THEME_PRESETS;

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const value = match ? parseInt(match[1] ?? "6ee86e", 16) : 0x6ee86e;
  const r = ((value >> 16) & 0xff) / 255;
  const g = ((value >> 8) & 0xff) / 255;
  const b = (value & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${String(Math.round(h * 360))} ${String(Math.round(s * 100))}% ${String(
    Math.round(Math.min(1, Math.max(0, l)) * 100),
  )}%)`;
}

/** Push the palette derived from `accent` onto the document root. */
export function applyTheme(accent: string): void {
  const { h, s, l } = hexToHsl(accent);
  const root = document.documentElement.style;
  root.setProperty("--fallout-accent", hsl(h, s, l));
  root.setProperty("--fallout-accent-dim", hsl(h, s * 0.85, l * 0.62));
  root.setProperty("--fallout-accent-bright", hsl(h, Math.min(1, s * 1.05), Math.min(0.82, l * 1.18)));
  root.setProperty("--fallout-accent-text", hsl(h, s * 0.35, 0.82));
  root.setProperty("--fallout-bg", hsl(h, Math.min(0.16, s * 0.3), 0.1));
  root.setProperty("--fallout-panel", hsl(h, Math.min(0.14, s * 0.25), 0.145));
  root.setProperty("--fallout-border", hsl(h, Math.min(0.12, s * 0.22), 0.25));
}

function currentAccent(): string {
  const preset = game.settings.get(SYSTEM_ID, "pipboyColor") as string;
  if (preset === "custom") return game.settings.get(SYSTEM_ID, "pipboyCustomColor") as string;
  return preset in THEME_PRESETS ? THEME_PRESETS[preset as PresetKey] : THEME_PRESETS.green;
}

export function registerThemeSettings(): void {
  game.settings.register(SYSTEM_ID, "pipboyColor", {
    name: "FALLOUT.Settings.pipboyColor",
    hint: "FALLOUT.Settings.pipboyColorHint",
    scope: "client",
    config: true,
    type: String,
    default: "green",
    choices: {
      green: "FALLOUT.Settings.colorGreen",
      amber: "FALLOUT.Settings.colorAmber",
      blue: "FALLOUT.Settings.colorBlue",
      white: "FALLOUT.Settings.colorWhite",
      red: "FALLOUT.Settings.colorRed",
      custom: "FALLOUT.Settings.colorCustom",
    },
    onChange: () => {
      applyTheme(currentAccent());
    },
  });
  game.settings.register(SYSTEM_ID, "pipboyCustomColor", {
    name: "FALLOUT.Settings.pipboyCustomColor",
    hint: "FALLOUT.Settings.pipboyCustomColorHint",
    scope: "client",
    config: true,
    type: String,
    default: "#6ee86e",
    onChange: () => {
      applyTheme(currentAccent());
    },
  });
}

export function applyCurrentTheme(): void {
  applyTheme(currentAccent());
}
