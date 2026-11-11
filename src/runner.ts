/**
 * The runner's skeleton, animation and drawing. Pure canvas 2D with no Phaser dependency, so the
 * same code bakes the in-game sprite sheet (textures.ts) and drives the animation preview page.
 *
 * Angles are radians measured from straight down, positive towards the facing direction (+x).
 */

type Ctx = CanvasRenderingContext2D;

const TAU = Math.PI * 2;
const THIGH = 10.5;
const SHIN = 10.5;
const FOOT = 5.5;
const UPPER_ARM = 8.5;
const FOREARM = 8;
const TORSO = 15;
const AIR_HIP = 20.5;

export type RunStyle = 'sprint' | 'rotoscope' | 'glide';
export type JumpStyle = 'leap' | 'tuck' | 'airrun';

export const RUN_STYLES: Record<RunStyle, { label: string; note: string }> = {
  sprint: { label: 'Sprint', note: 'Athletic: high knee drive, heel kick, strong arm pump.' },
  rotoscope: { label: 'Rotoscope', note: 'Upright and weighty with a visible bounce and loose arms, closest to the 1989 look.' },
  glide: { label: 'Glide', note: 'Low forward lean, arms trailing behind, fast flat stride.' },
};

export const JUMP_STYLES: Record<JumpStyle, { label: string; note: string }> = {
  leap: { label: 'Leap', note: 'Running long jump: legs split wide at the apex, then gather for landing.' },
  tuck: { label: 'Tuck', note: 'Arms throw up, knees pull into a tight tuck, body opens on the way down.' },
  airrun: { label: 'Air-run', note: 'Keeps striding through the air with arms lifted.' },
};

export interface Palette {
  name: string;
  jacket: string;
  pants: string;
  shoes: string;
  accent: string; // scarf and collar
  hair: string;
  skin: string;
  visor: string;
}

export const PALETTES: Palette[] = [
  { name: 'Courier', jacket: '#fcee0a', pants: '#6a58a8', shoes: '#00f0ff', accent: '#ff2a6d', hair: '#ff3df0', skin: '#e9d8ff', visor: '#00f0ff' },
  { name: 'Ghost', jacket: '#e8f6ff', pants: '#3d528f', shoes: '#ff2a6d', accent: '#00f0ff', hair: '#9b4dff', skin: '#f3dcc8', visor: '#ff3df0' },
  { name: 'Ember', jacket: '#ff8a00', pants: '#70405a', shoes: '#fcee0a', accent: '#ff1744', hair: '#f4f0ff', skin: '#d9a98a', visor: '#fcee0a' },
  { name: 'Toxic', jacket: '#a6ff00', pants: '#3b5278', shoes: '#ff3df0', accent: '#9b4dff', hair: '#00f0ff', skin: '#e9d8ff', visor: '#ff3df0' },
  { name: 'Synth', jacket: '#ff2a6d', pants: '#4a3a8c', shoes: '#fcee0a', accent: '#00f0ff', hair: '#fcee0a', skin: '#b98568', visor: '#00f0ff' },
  { name: 'Deep', jacket: '#00c8ff', pants: '#5a4590', shoes: '#ff8a00', accent: '#fcee0a', hair: '#ff2a6d', skin: '#f3dcc8', visor: '#fcee0a' },
];

type Leg = [thigh: number, knee: number, foot: number]; // knee = flexion; foot = toe-down pitch from horizontal
type Arm = [upper: number, elbow: number]; // elbow = flexion

export interface Pose {
  lean: number;
  /** Hip height above the ground. */
  hip: number;
  /** Far leg, then near leg. */
  legs: [Leg, Leg];
  arms: [Arm, Arm];
  /** Shoulder twist in pixels; positive brings the near shoulder forward. */
  twist: number;
  head: number;
  /** Scarf direction (positive lifts it) and its wave phase. */
  flow: number;
  wave: number;
}

const toVec = (p: Pose): number[] => [p.lean, p.hip, ...p.legs[0], ...p.legs[1], ...p.arms[0], ...p.arms[1], p.twist, p.head, p.flow, p.wave];
const fromVec = (v: number[]): Pose => ({
  lean: v[0], hip: v[1],
  legs: [[v[2], v[3], v[4]], [v[5], v[6], v[7]]],
  arms: [[v[8], v[9]], [v[10], v[11]]],
  twist: v[12], head: v[13], flow: v[14], wave: v[15],
});

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { x = clamp01(x); return x * x * (3 - 2 * x); };

function mix(a: Pose, b: Pose, k: number): Pose {
  const va = toVec(a);
  const vb = toVec(b);
  return fromVec(va.map((x, i) => x + (vb[i] - x) * k));
}

function hermite(v0: number, v1: number, v2: number, v3: number, t0: number, t1: number, t2: number, t3: number, p: number) {
  const h = t2 - t1;
  const u = (p - t1) / h;
  const m1 = ((v2 - v0) / (t2 - t0)) * h;
  const m2 = ((v3 - v1) / (t3 - t1)) * h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * v1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * v2 + (u3 - u2) * m2;
}

type Keys = ReadonlyArray<readonly [number, number]>;

/** Smooth periodic curve through keyframes over one cycle (first key must be at 0). */
function cyc(keys: Keys, p: number): number {
  const n = keys.length;
  p -= Math.floor(p);
  let i = 0;
  for (let k = 0; k < n; k++) if (keys[k][0] <= p) i = k;
  const at = (j: number): [number, number] => {
    const w = Math.floor(j / n);
    const key = keys[j - w * n];
    return [key[0] + w, key[1]];
  };
  const [t0, v0] = at(i - 1);
  const [t1, v1] = at(i);
  const [t2, v2] = at(i + 1);
  const [t3, v3] = at(i + 2);
  return hermite(v0, v1, v2, v3, t0, t1, t2, t3, p);
}

// One leg over a full stride. 0 = foot strike, 0.3 = toe-off, then the recovery swing.
const THIGH_KEYS: Keys = [[0, 0.5], [0.12, 0.15], [0.3, -0.45], [0.42, -0.35], [0.58, 0.35], [0.75, 1.05], [0.9, 0.8]];
const KNEE_KEYS: Keys = [[0, 0.25], [0.12, 0.65], [0.3, 0.25], [0.45, 1.7], [0.6, 2.0], [0.75, 1.5], [0.9, 0.55]];
const FOOT_KEYS: Keys = [[0, -0.2], [0.08, 0], [0.2, 0.1], [0.3, 0.8], [0.45, 1.9], [0.6, 1.5], [0.75, 0.5], [0.9, -0.15]];
const STANCE_END = 0.3;

interface RunParams {
  lean: number;
  thighAmp: number;
  thighBias: number;
  kneeAmp: number;
  hop: number;
  armAmp: number;
  armBias: number;
  elbow: number;
  elbowAmp: number;
  twist: number;
  /** Stride cycles per second at the starting speed. */
  rate: number;
}

const RUN_PARAMS: Record<RunStyle, RunParams> = {
  sprint: { lean: 0.3, thighAmp: 1, thighBias: 0, kneeAmp: 1, hop: 3, armAmp: 0.75, armBias: 0.1, elbow: 1.25, elbowAmp: 0.15, twist: 1.6, rate: 1.55 },
  rotoscope: { lean: 0.17, thighAmp: 0.82, thighBias: -0.03, kneeAmp: 0.85, hop: 4.2, armAmp: 0.5, armBias: 0.05, elbow: 0.95, elbowAmp: 0.25, twist: 1.2, rate: 1.35 },
  glide: { lean: 0.52, thighAmp: 1.1, thighBias: 0.08, kneeAmp: 1.05, hop: 1.5, armAmp: 0.1, armBias: -1.25, elbow: 0.25, elbowAmp: 0.1, twist: 0.6, rate: 1.8 },
};

/** Stride cycles per second for a given speed relative to the starting speed. */
export function cadence(style: RunStyle, speedRatio: number): number {
  return RUN_PARAMS[style].rate * Math.pow(speedRatio, 0.6);
}

function legPoints(hx: number, hy: number, leg: Leg) {
  const kx = hx + Math.sin(leg[0]) * THIGH;
  const ky = hy + Math.cos(leg[0]) * THIGH;
  const sa = leg[0] - leg[1];
  const ax = kx + Math.sin(sa) * SHIN;
  const ay = ky + Math.cos(sa) * SHIN;
  const tx = ax + Math.cos(leg[2]) * FOOT;
  const ty = ay + Math.sin(leg[2]) * FOOT;
  return { kx, ky, ax, ay, tx, ty };
}

/** Sets the hip height so the lowest foot rests on the ground, plus `lift`. */
function ground(pose: Pose, lift = 0): Pose {
  let low = 0;
  for (const leg of pose.legs) {
    const p = legPoints(0, 0, leg);
    low = Math.max(low, p.ay + 1.6, p.ty + 1.3);
  }
  pose.hip = low + lift;
  return pose;
}

function rawRunPose(o: RunParams, phase: number): Pose {
  const leg = (p: number): Leg => [o.thighBias + o.thighAmp * cyc(THIGH_KEYS, p), o.kneeAmp * cyc(KNEE_KEYS, p), cyc(FOOT_KEYS, p)];
  const s = Math.sin(TAU * phase);
  const arm = (k: number): Arm => [o.armBias + o.armAmp * k, o.elbow + o.elbowAmp * k];
  return {
    lean: o.lean + 0.035 * Math.sin(2 * TAU * phase + 0.6),
    hip: AIR_HIP,
    legs: [leg(phase + 0.5), leg(phase)],
    arms: [arm(-s), arm(s)],
    twist: o.twist * s,
    head: -0.04 * Math.sin(2 * TAU * phase),
    flow: 0.12,
    wave: 2 * TAU * phase,
  };
}

/** Run cycle pose; `phase` is in stride cycles (two steps per cycle). */
export function runPose(style: RunStyle, phase: number): Pose {
  const o = RUN_PARAMS[style];
  const step = (phase * 2) % 1;
  const stance = STANCE_END * 2;
  const lift = step > stance ? o.hop * Math.sin((Math.PI * (step - stance)) / (1 - stance)) : 0;
  return ground(rawRunPose(o, phase), lift);
}

const air = (lean: number, far: Leg, near: Leg, farArm: Arm, nearArm: Arm, flow: number, head = 0): Pose => ({
  lean, hip: AIR_HIP, legs: [far, near], arms: [farArm, nearArm], twist: 0, head, flow, wave: 0,
});

// Evenly spaced keys from take-off (0) through the apex (0.5) to a fast fall (1).
const AIR_KEYS: Record<Exclude<JumpStyle, 'airrun'>, Pose[]> = {
  leap: [
    air(0.36, [-0.65, 0.1, 0.9], [1.25, 1.5, 0.5], [1.5, 0.9], [-0.9, 0.7], -0.3),
    air(0.3, [-0.95, 0.45, 1.1], [1.35, 0.7, 0.2], [1.9, 0.5], [-1.2, 0.35], -0.25, -0.05),
    air(0.22, [-1.05, 0.85, 1.3], [1.3, 0.25, 0], [2.1, 0.3], [-1.4, 0.25], 0.1, -0.05),
    air(0.12, [0, 0.9, 0.8], [0.95, 0.3, -0.1], [1.9, 0.5], [-1.9, 0.3], 0.5, 0.1),
    air(0.05, [0.45, 0.5, 0.1], [0.7, 0.25, -0.25], [1.3, 0.9], [-2.3, 0.45], 0.8, 0.15),
  ],
  tuck: [
    air(0.3, [-0.6, 0.1, 0.9], [1.1, 1.4, 0.5], [1.9, 0.5], [1.3, 0.8], -0.3),
    air(0.3, [0.5, 1.3, 0.9], [1.2, 1.8, 0.6], [2.6, 0.3], [2.3, 0.4], -0.25, -0.1),
    air(0.5, [1.25, 2.1, 0.8], [1.5, 2.2, 0.7], [1.3, 0.7], [1.1, 0.9], 0.1, 0.1),
    air(0.25, [0.5, 1.1, 0.5], [0.9, 0.9, 0.3], [-0.3, 0.4], [-0.8, 0.5], 0.5, 0.1),
    air(0.05, [0.1, 0.3, 0.2], [0.45, 0.25, -0.2], [-2.2, 0.4], [-2.5, 0.3], 0.8, 0.15),
  ],
};

/** Airborne pose; `t` runs 0 (take-off) → 0.5 (apex) → 1 (falling fast). */
export function airPose(style: JumpStyle, t: number): Pose {
  t = clamp01(t);
  let pose: Pose;
  if (style === 'airrun') {
    const o = { ...RUN_PARAMS.sprint, thighAmp: 1.15, armAmp: 0.9, armBias: 0.7, elbow: 0.9 };
    pose = rawRunPose(o, 0.33 + 0.42 * t);
    pose.lean = 0.3 - 0.22 * t;
    pose.flow = -0.3 + 1.1 * t;
  } else {
    const keys = AIR_KEYS[style].map(toVec);
    const n = keys.length - 1;
    const i = Math.min(n - 1, Math.floor(t * n));
    const k = (j: number) => keys[Math.min(n, Math.max(0, j))];
    const [a, b, c, d] = [k(i - 1), k(i), k(i + 1), k(i + 2)];
    pose = fromVec(b.map((_, j) => hermite(a[j], b[j], c[j], d[j], i - 1, i, i + 1, i + 2, t * n)));
  }
  pose.wave = t * 9;
  return pose;
}

/** Run phase the landing recovery ends on; continue the run cycle from here. */
export const LAND_EXIT_PHASE = 0.28;

const CROUCH: Pose = { lean: 0.55, hip: 0, legs: [[-0.1, 1.35, 0.6], [0.8, 1.35, 0]], arms: [[0.9, 1.0], [-1.0, 0.8]], twist: 0.8, head: 0.1, flow: 0.9, wave: 0 };

/** Landing recovery, `k` 0 → 1: touch-down, absorb in a crouch, then drive out into the run. */
export function landPose(run: RunStyle, jump: JumpStyle, k: number): Pose {
  k = clamp01(k);
  const pose = k < 0.3
    ? mix(airPose(jump, 1), CROUCH, smooth(k / 0.3))
    : mix(CROUCH, runPose(run, 0.1 + (LAND_EXIT_PHASE - 0.1) * k), smooth((k - 0.3) / 0.7));
  pose.wave = k * 5;
  return ground(pose);
}

export function standPose(): Pose {
  return ground({ lean: 0.03, hip: 0, legs: [[-0.08, 0.05, 0], [0.1, 0.08, 0]], arms: [[-0.12, 0.35], [0.12, 0.45]], twist: 0, head: 0, flow: -1.25, wave: 0 });
}

// ---------------------------------------------------------------- drawing

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(((n >> s) & 255) * k);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

function taper(ctx: Ctx, x1: number, y1: number, r1: number, x2: number, y2: number, r2: number, color: string) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1 + nx * r1, y1 + ny * r1);
  ctx.lineTo(x2 + nx * r2, y2 + ny * r2);
  ctx.lineTo(x2 - nx * r2, y2 - ny * r2);
  ctx.lineTo(x1 - nx * r1, y1 - ny * r1);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x1, y1, r1, 0, TAU);
  ctx.moveTo(x2 + r2, y2);
  ctx.arc(x2, y2, r2, 0, TAU);
  ctx.fill();
}

/** Draws the runner facing +x, with the origin on the ground directly below the hips. */
export function drawRunner(ctx: Ctx, pose: Pose, pal: Palette): void {
  const hipX = 0;
  const hipY = -pose.hip;
  const shX = hipX + Math.sin(pose.lean) * TORSO;
  const shY = hipY - Math.cos(pose.lean) * TORSO;
  const tw = pose.twist;

  const drawLeg = (leg: Leg, dx: number, dim: number) => {
    const p = legPoints(hipX + dx, hipY, leg);
    const pants = shade(pal.pants, dim);
    taper(ctx, hipX + dx, hipY, 3.3, p.kx, p.ky, 2.6, pants);
    taper(ctx, p.kx, p.ky, 2.5, p.ax, p.ay, 1.8, pants);
    const bx = Math.cos(leg[2]);
    const by = Math.sin(leg[2]);
    ctx.save();
    ctx.shadowColor = pal.shoes;
    ctx.shadowBlur = dim < 1 ? 0 : 4;
    taper(ctx, p.ax - bx * 1.2, p.ay - by * 1.2, 1.9, p.tx, p.ty, 1.3, shade(pal.shoes, dim));
    ctx.restore();
  };

  const drawArm = (arm: Arm, dx: number, dim: number) => {
    const sx = shX + dx;
    const sy = shY + 1.5;
    const ex = sx + Math.sin(arm[0]) * UPPER_ARM;
    const ey = sy + Math.cos(arm[0]) * UPPER_ARM;
    const fa = arm[0] + arm[1];
    const hx = ex + Math.sin(fa) * FOREARM;
    const hy = ey + Math.cos(fa) * FOREARM;
    const sleeve = shade(pal.jacket, dim * 0.88);
    taper(ctx, sx, sy, 2.3, ex, ey, 1.9, sleeve);
    taper(ctx, ex, ey, 1.8, hx, hy, 1.4, sleeve);
    ctx.fillStyle = shade(pal.skin, dim);
    ctx.beginPath();
    ctx.arc(hx, hy, 1.7, 0, TAU);
    ctx.fill();
  };

  // Far-side limbs, dimmed.
  drawArm(pose.arms[0], -tw, 0.55);
  drawLeg(pose.legs[0], tw * 0.5, 0.6);

  // Scarf streaming behind the neck.
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = pal.accent;
  ctx.shadowColor = pal.accent;
  ctx.shadowBlur = 5;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  let sx = shX - 2.5;
  let sy = shY - 1.5;
  ctx.moveTo(sx, sy);
  const SEGS = 6;
  for (let i = 1; i <= SEGS; i++) {
    const a = pose.flow + 0.45 * (i / SEGS) * Math.sin(pose.wave - i * 0.9);
    sx -= Math.cos(a) * 3.6;
    sy -= Math.sin(a) * 3.6;
    ctx.lineTo(sx, sy);
  }
  ctx.stroke();
  ctx.restore();

  // Jacket: tapered torso with a flapping tail.
  const flap = Math.sin(pose.wave - 0.6) * 1.6;
  ctx.fillStyle = shade(pal.jacket, 0.78);
  ctx.beginPath();
  ctx.moveTo(hipX - 2.5, hipY - 5);
  ctx.lineTo(hipX - 9.5, hipY + 2.5 - pose.flow * 3 + flap);
  ctx.lineTo(hipX + 2, hipY + 2);
  ctx.closePath();
  ctx.fill();
  taper(ctx, hipX, hipY - 1, 3.7, shX, shY, 4.6, pal.jacket);
  ctx.save();
  ctx.strokeStyle = pal.accent;
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(shX - 3.5, shY - 1);
  ctx.lineTo(shX + 3, shY - 3);
  ctx.stroke();
  ctx.restore();

  // Head, swept-back hair and a glowing visor.
  const ha = pose.lean * 0.7 + pose.head;
  ctx.save();
  ctx.translate(shX + Math.sin(ha) * 7.8, shY - Math.cos(ha) * 7.8);
  ctx.rotate(ha * 0.6);
  ctx.fillStyle = pal.skin;
  ctx.beginPath();
  ctx.arc(0, 0, 4.6, 0, TAU);
  ctx.fill();
  const hw = Math.sin(pose.wave + 0.8) * 1.2 - pose.flow * 2;
  ctx.fillStyle = pal.hair;
  ctx.beginPath();
  ctx.moveTo(4.2, -2.6);
  ctx.quadraticCurveTo(1, -7.2, -4.2, -4.4);
  ctx.lineTo(-11.5, -4 + hw);
  ctx.lineTo(-6, -1.2);
  ctx.lineTo(-9, 1.5 + hw * 0.6);
  ctx.lineTo(-4.4, 1.2);
  ctx.quadraticCurveTo(-3, -2.2, 4.2, -2.6);
  ctx.fill();
  ctx.shadowColor = pal.visor;
  ctx.shadowBlur = 6;
  ctx.fillStyle = pal.visor;
  ctx.fillRect(0.2, -1.9, 5.4, 2.4);
  ctx.restore();

  // Near-side limbs.
  drawLeg(pose.legs[1], -tw * 0.5, 1);
  drawArm(pose.arms[1], tw, 1);
}

// ---------------------------------------------------------------- sprite sheet layout

export const FRAME = { w: 72, h: 64, originX: 30, groundY: 60 };
export const RUN_FRAMES = 32;
export const AIR_FRAMES = 16;
export const LAND_FRAMES = 10;
/** Seconds the landing recovery takes. */
export const LAND_TIME = 0.17;

export interface SheetFrame {
  name: string;
  pose: Pose;
}

export const JUMP_KEYS = Object.keys(JUMP_STYLES) as JumpStyle[];

/** Every frame of the baked sprite sheet, in sheet order: one run style and all jump styles. */
export function sheetFrames(run: RunStyle): SheetFrame[] {
  const frames: SheetFrame[] = [];
  for (let i = 0; i < RUN_FRAMES; i++) frames.push({ name: `run${i}`, pose: runPose(run, i / RUN_FRAMES) });
  for (const jump of JUMP_KEYS) {
    for (let i = 0; i < AIR_FRAMES; i++) frames.push({ name: `${jump}-air${i}`, pose: airPose(jump, i / (AIR_FRAMES - 1)) });
    for (let i = 0; i < LAND_FRAMES; i++) frames.push({ name: `${jump}-land${i}`, pose: landPose(run, jump, (i + 1) / LAND_FRAMES) });
  }
  frames.push({ name: 'stand', pose: standPose() });
  return frames;
}
