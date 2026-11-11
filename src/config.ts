import type { JumpStyle, RunStyle } from './runner';

export const WIDTH = 960;
export const HEIGHT = 540;

export const FONT_MONO = '"Share Tech Mono", monospace';
export const FONT_DISPLAY = 'Orbitron, sans-serif';

/** Neon palette, as numbers for Phaser and strings for canvas drawing. */
export const PAL = {
  cyan: 0x00f0ff,
  magenta: 0xff2a6d,
  pink: 0xff3df0,
  yellow: 0xfcee0a,
  violet: 0x9b4dff,
  orange: 0xff8a00,
  red: 0xff1744,
} as const;

export const CSS = {
  cyan: '#00f0ff',
  magenta: '#ff2a6d',
  pink: '#ff3df0',
  yellow: '#fcee0a',
  violet: '#9b4dff',
  orange: '#ff8a00',
  red: '#ff1744',
} as const;

export const NEON = [PAL.cyan, PAL.magenta, PAL.yellow, PAL.violet, PAL.pink];
export const NEON_CSS = [CSS.cyan, CSS.magenta, CSS.yellow, CSS.violet, CSS.pink];

/** Movement tuning, in pixels and seconds. */
export const RUN = {
  startSpeed: 330,
  maxSpeed: 920,
  accel: 11,
  gravity: 2600,
  /** Weaker gravity while the jump button is held during the rise. */
  holdGravity: 950,
  holdMax: 0.26,
  jumpVelocity: 760,
  maxFall: 1400,
  coyoteTime: 0.09,
  jumpBuffer: 0.12,
  crateSlowdown: 0.72,
  /** Hitbox half-width and height; the player's position is the bottom centre. */
  halfWidth: 9,
  height: 40,
  /** Pixels per displayed metre. */
  pxPerMetre: 12,
};

/** Runner animation styles (options in src/runner.ts). `jump: 'random'` picks a new style on every jump. */
export const RUNNER_STYLE: { run: RunStyle; jump: JumpStyle | 'random' } = { run: 'sprint', jump: 'random' };

export const KATAKANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン';
export const SIGN_WORDS = ['NOODLES', 'HOTEL', 'BAR', '24H', 'CLINIC', 'RAMEN', 'DATA', 'SYNTH', 'NEURAL', 'CHROME', 'PAWN', 'KARAOKE', 'ARCADE', 'MOTEL', 'IMPLANTS'];

export function randomGlyphs(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += KATAKANA[Math.floor(Math.random() * KATAKANA.length)];
  return s;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
