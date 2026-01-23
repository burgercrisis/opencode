import { createSignal } from "solid-js"

/**
 * Collection of spinner styles for the TUI.
 * Each spinner is an array of frames that cycle during animation.
 */
export const SPINNERS: Record<string, string[]> = {
  // --- WIDE / MULTI-CELL (2+ Blocks) ---
  WIDE_SCAN: ["▐ ", "▊ ", "▉ ", "█ ", " █", " ▉", " ▊", " ▐"],
  KITT_SCANNER: ["▌ ", " ▌", " ▐", "▐ "],
  LOW_BOUNCE: ["▖ ", " ▖", " ▖", " ▗", " ▗", "▗ "],
  LOW_KITT: ["▖ ", " ▖", " ▗", "▗ "],
  HIGH_KITT: ["▘ ", " ▘", " ▝", "▝ "],
  DOUBLE_PULSE: ["░░", "▒▒", "▓▓", "██", "▓▓", "▒▒"],
  CURTAINS: ["▐▌", "▊▋", "▉▍", "█▎", "▉▍", "▊▋", "▐▌"],
  RUBIKS_TWIST: ["▙▛", "▚▞", "▟▜", "▞▚"],
  DNA_HELIX: ["▚▞", "▞▚"],
  BINARY_COUNT: ["00", "01", "10", "11"],
  SIGNAL_BARS: ["  ", "▂ ", "▂▃", "▄▅", "▆▇", "█▇", "▅▄", "▃▂", " "],
  EYES_BLINK: ["●●", "○○", "◡◡", "○○", "●●", "●●", "●●"],
  PAC_CHASE: ["ᗧ ", "ᗧ•", "ᗤ•", "ᗧ•"],
  WAVE_FLOW: [" ▂", "▃▄", "▅▆", "▇█", "▆▅", "▄▃", "▂ "],
  ARROWS_PASS: ["▹▹", "▸▹", "▸▸", "▹▸", "▹▹"],
  BRACKET_BREATHE: ["[]", "[ ]", "[  ]", "[   ]", "[  ]", "[ ]"],
  ZIPPERS: ["▖▗", "▝▘", "▚▞"],

  // --- WIDE SPINNING (Simulated Rotation) ---
  WIDE_ORBIT_CW: ["⠁ ", "⠈ ", " ⠁", " ⠈", " ⠂", " ⠄", "⠄ ", "⠂ "],
  WIDE_BLOCK_TUMBLE: ["▖ ", "▘ ", "▝ ", " ▘", " ▝", " ▗", " ▖", "▗ "],
  SQUISH_SPIN: ["▙▜", "▚▚", "▟▛", "▞▞"],
  DIGITAL_8: [" ▙", " ▛", " ▜", " ▟", "▙ ", "▛ ", "▜ ", "▟ "],
  FLIP_3D: ["▖▗", "▅▅", "▘▝", "▀▀"],
  OFF_AXIS: ["▃ ", " ▍", " ▀", "▋ ", "▃ "],
  BLADE_SPIN: ["◵ ", " ◵", " ◴", "◴ "],
  WIDE_CLOCK: ["🕐🕑", "🕒🕓", "🕔🕕", "🕖🕗", "🕘🕙", "🕚🕛"],
  DANCING_SQUARES: ["▖▖", "▘▘", "▝▝", "▗▗"],

  // --- WIDE BRAILLE ---
  DUAL_DOTS_SPIN: ["⠋⠋", "⠙⠙", "⠹⠹", "⠸⠸", "⠼⠼", "⠴⠴", "⠦⠦", "⠧⠧", "⠇⠇", "⠏⠏"],
  BRAILLE_RIPPLE_WIDE: ["⣀⣀", "⣤⣤", "⣶▽", "████", "▽▽", "▽▽", "▽▽"],
  BRAILLE_SNAKE_WIDE: ["⠁⠁", "⠂⠂", "⠄⠄", "⠐⠐", "⠠⠠", "██", "⠠⠠", "⠐⠐", "⠄⠄", "⠂⠂", "⠁⠁"],
  MATRIX_RAIN: ["████", " ██", " ░█", " ░░", "░░░", "░░ ", " █ ", "██ "],
  MICRO_SCAN: ["⠂██", "⠆██", "⠇██", "⠏██", "⠟██", "⠿██", "████", "██ ", "██▂", "██▆", "██▇", "██▏", "██▟", "██▿", "████", "███"],
  BRAILLE_EQUALIZER: ["███", " ██", " █░", " ░░", "░░░", "░░ ", " █ ", "██ "],
  PIXEL_MORPH: ["▚▚", "▞▞", "▟▟", "████", "▟▟", "▞▞", "▚▚"],
  BINARY_NOISE: ["░▒", "▒░", "▓░", "░▓", "█░", "░█", "▓▒", "▒▓"],

  // --- HIGH FIDELITY BLOCKS ---
  SHADE_PULSE: ["░", "▒", "▓", "█", "▓", "▒"],
  VERT_FILL: [" ", "▂", "▃", "▄", "▅", "▆", "▇", "█", "▇", "▆", "▅", "▄", "▃", "▂"],
  HORIZ_FILL: ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█", "▉", "▊", "▋", "▌", "▍", "▎", "▏"],
  QUAD_GROW: ["▖", "▞", "▟", "█", "▟", "▞", "▖"],
  QUAD_SPIN: ["▖", "▘", "▝", "▗"],
  HALF_SPIN: ["▌", "▀", "▐", "▄"],
  TETRIS: ["▙", "▛", "▜", "▟"],
  RETRO_NOISE: ["▚", "▞"],
  INVERT: ["█", " "],

  // --- GEOMETRIC SHAPES ---
  ARC: ["◜", "◝", "◞", "◟"],
  CIRCLE_QUARTERS: ["◴", "◷", "◶", "◵"],
  SQUARE_CORNERS: ["◰", "◳", "◲", "◱"],
  TRIANGLE_DANCE: ["◢", "◣", "◤", "◥"],
  DIAMOND_BREATHE: ["◇", "◈", "◆", "◈"],
  TARGET: ["◎", "◉", "●", "◉"],

  // --- BRAILLE ART ---
  DOTS: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  BRAILLE_FILL: ["███", " ██", " ░█", " ░░", "░░░", "░░ ", " █ ", "██ "],
  BRAILLE_SPIN: ["⠋", "⠙", "⠚", "⠞", "⠖", "⠦", "⠴", "⠲", "⠳", "⠓"],
  WATER: ["█", "▓", "▒", "░", " ", "░", "▒", "▓"],
  SNAKE: ["▓", "█", "▒", "░", "▓", "█", "▒", "░"],

  // --- CLASSIC CLI ---
  LINE: ["-", "\\", "|", "/"],
  ARROW_SPIN: ["←", "↖", "↑", "↗", "→", "↘", "↓", "↙"],
  PIPE_FLIP: ["┤", "┘", "┴", "└", "├", "┌", "┬", "┐"],
  STAR_TWINKLE: ["✶", "✸", "✹", "✺", "✹", "✸"],

  // --- CREATIVE CONCEPTS ---
  MOON_PHASE: ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"],
  CLOCK_SWEEP: ["🕐", "🕑", "🕒", "🕓", "🕔", "🕕", "🕖", "🕗", "🕘", "🕙", "🕚", "🕛"],
  EQ_RHYTHM: ["▅", "▇", "█", "▇", "▅", "▃", " ", "▃"],
  WIFI_FADE: [" ", "·", "•", "●", "•", "·"],
  BOUNCE_BALL: [
    "( ●    )",
    "(  ●   )",
    "(   ●  )",
    "(    ● )",
    "(     ●)",
    "(    ● )",
    "(   ●  )",
    "(  ●   )",
    "( ●    )",
  ],
  FISH: [">))'>", " >))'>", "  >))'>", "   >))'>", "    >))'>", "   <'((<", "  <'((<", " <'((<"],
  BATTERY_CHARGE: ["🪫 ", "🔋"],
  HEART_BEAT: ["❤️ ", "🤍"],
  DICE_ROLL: ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"],
  WEATHER_CYCLE: ["☀️ ", "🌤️ ", "⛅", "☁️ ", "🌦️ ", "🌧️ ", "🌩️ ", "❄️ "],
  DOMINOES: ["🀰", "🀱", "🀲", "🀳", "🀴", "🀵"],
  MAHJONG_WINDS: ["🀀", "🀁", "🀂", "🀃"],

  // --- TEXT BASED ---
  KAOMOJI_SQUINT: ["(   )", "(-  )", "(-- )", "(---)", "(-- )", "(-  )"],
  PULSE_TEXT: ["o", "O", "0", "O", "o", "."],
}

/** Default spinner key */
export const DEFAULT_SPINNER_KEY = "DOTS"

/** Default spinner interval in milliseconds */
export const DEFAULT_SPINNER_INTERVAL_MS = 60

/** Minimum spinner interval in milliseconds */
export const MIN_SPINNER_INTERVAL_MS = 20

/** Maximum spinner interval in milliseconds */
export const MAX_SPINNER_INTERVAL_MS = 500

/** @deprecated Use DEFAULT_SPINNER_INTERVAL_MS instead */
export const SPINNER_INTERVAL_MS = DEFAULT_SPINNER_INTERVAL_MS

/** Preset interval options for the UI */
export const SPINNER_INTERVAL_PRESETS = [
  { label: "Fastest (20ms)", value: 20 },
  { label: "Fast (40ms)", value: 40 },
  { label: "Default (60ms)", value: 60 },
  { label: "Moderate (80ms)", value: 80 },
  { label: "Slow (120ms)", value: 120 },
  { label: "Slower (200ms)", value: 200 },
  { label: "Slowest (500ms)", value: 500 },
] as const

/**
 * Get all available spinner keys sorted alphabetically
 */
export function getSpinnerKeys(): string[] {
  return Object.keys(SPINNERS).sort()
}

/**
 * Get a display name for a spinner key (title case with underscores replaced by spaces)
 */
export function getSpinnerDisplayName(key: string): string {
  return key
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

const [spinnerStyle, setSpinnerStyleSignal] = createSignal<string>(DEFAULT_SPINNER_KEY)
const [spinnerInterval, setSpinnerIntervalSignal] = createSignal<number>(DEFAULT_SPINNER_INTERVAL_MS)

/**
 * Get the current spinner style from persistent storage or default
 */
export function getSpinnerStyle(): string {
  return spinnerStyle()
}

/**
 * Set the spinner style in persistent storage
 */
export function setSpinnerStyle(value: string) {
  setSpinnerStyleSignal(value)
}

/**
 * Get the current spinner interval from persistent storage or default
 */
export function getSpinnerInterval(): number {
  return spinnerInterval()
}

/**
 * Set the spinner interval in persistent storage
 */
export function setSpinnerInterval(value: number) {
  setSpinnerIntervalSignal(value)
}
