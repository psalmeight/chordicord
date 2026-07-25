/**
 * Chart font preference.
 *
 * Scoped to chord charts, the editor preview and the ChordPro textarea — the
 * places legibility actually matters on a music stand. The app chrome stays on
 * a fixed UI sans so the shell doesn't shift around with the setting.
 *
 * Century Gothic ships with MS Office rather than the OS, so each stack lists
 * the metric-compatible lookalikes people actually have installed before
 * falling back to a generic family.
 */
export interface FontOption {
  id: string;
  label: string;
  stack: string;
}

export const FONTS: FontOption[] = [
  {
    id: 'century-gothic',
    label: 'Century Gothic',
    stack: `'Century Gothic', CenturyGothic, 'URW Gothic', 'URW Gothic L', AppleGothic, 'Questrial', 'Didact Gothic', 'Trebuchet MS', sans-serif`,
  },
  {
    id: 'system',
    label: 'System Sans',
    stack: `system-ui, -apple-system, 'Segoe UI', sans-serif`,
  },
  {
    id: 'serif',
    label: 'Serif',
    stack: `Georgia, 'Times New Roman', serif`,
  },
  {
    id: 'mono',
    label: 'Monospace',
    stack: `ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace`,
  },
];

export const DEFAULT_FONT = FONTS[0];

const STORAGE_KEY = 'transcode.font';

export function getFont(): FontOption {
  const id = localStorage.getItem(STORAGE_KEY);
  return FONTS.find((f) => f.id === id) ?? DEFAULT_FONT;
}

export function setStoredFont(id: string) {
  localStorage.setItem(STORAGE_KEY, id);
}

/**
 * Everything under .chart reads --chart-font, so one write restyles every
 * chart and preview on the page. --app-font is deliberately untouched.
 */
export function applyFont(font: FontOption) {
  document.documentElement.style.setProperty('--chart-font', font.stack);
}
