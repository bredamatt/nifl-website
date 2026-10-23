/*
 * Fog and rune-lightning background.
 * Uses WebGL when available, otherwise shows the CSS/SVG fallback.
 */

interface FogConfig {
  mist: number;
  speed: number;
  runes: number;
  renderScale: number;
}

type Stroke = readonly [number, number, number, number];
type Envelope = ReadonlyArray<readonly [number, number]>;

const MAX_SEG = 12;

const VERTEX_SHADER = 'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }';

const FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform float uDensity;
uniform float uRune;
uniform int uCount;
uniform vec4 uSeg[12];
uniform float uSegI[12];

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    v += amp * noise(p);
    p = m * p;
    amp *= 0.5;
  }
  return v;
}

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 frag = gl_FragCoord.xy / uRes;
  vec2 uv = gl_FragCoord.xy / uRes.y;
  float t = uTime;

  // Domain-warped noise: the fog drifts left and curls as it moves.
  vec2 p = vec2(uv.x * 1.4, uv.y * 2.2);
  p.x += t * 0.14;
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.06)), fbm(p + vec2(5.2, 1.3) - vec2(t * 0.05, 0.0)));
  vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + vec2(t * 0.11, 0.0)), fbm(p + 3.0 * q + vec2(8.3, 2.8) - vec2(0.0, t * 0.09)));
  float f = fbm(p + 2.6 * r);

  // Fog sits in a band across the middle and thins around the headline.
  float band = smoothstep(0.02, 0.38, frag.y) * (1.0 - smoothstep(0.62, 0.98, frag.y));
  float haze = 0.25 + 0.75 * band;
  vec2 dv = (frag - vec2(0.27, 0.5)) * vec2(1.6, 2.4);
  float clearing = mix(0.35, 1.0, smoothstep(0.25, 0.9, length(dv)));
  float fogAlpha = pow(smoothstep(0.3, 0.85, f), 1.6) * haze * clearing * uDensity;

  // Runes are drawn inside the fog and bent by the same warp.
  vec2 pr = uv + (r - vec2(0.5)) * 0.035;
  float core = 0.0;
  float halo = 0.0;
  for (int i = 0; i < 12; i++) {
    if (i >= uCount) break;
    vec4 s = uSeg[i];
    float d = sdSeg(pr, s.xy, s.zw);
    float k = d * 300.0;
    core += uSegI[i] * exp(-k * k);
    halo += uSegI[i] * exp(-d * 22.0);
  }
  core = min(core, 1.5);
  halo = min(halo, 1.5);
  float fogLit = smoothstep(0.2, 0.8, f);
  float runeA = core * (0.35 + 1.1 * fogLit) * mix(0.55, 1.0, clearing) * uRune;
  float glowA = halo * fogLit * haze * 0.45 * uRune;

  vec3 fogCol = vec3(0.90, 0.93, 0.96);
  vec3 runeCol = vec3(0.95, 0.98, 1.0);
  vec3 glowCol = vec3(0.78, 0.88, 1.0);
  float alpha = clamp(fogAlpha + runeA + glowA, 0.0, 1.0);
  vec3 rgb = fogCol * fogAlpha + runeCol * runeA + glowCol * glowA;
  gl_FragColor = vec4(min(rgb, vec3(alpha)), alpha);
}
`;

/** Rune strokes in a 24 x 36 box: [x1, y1, x2, y2]. */
const GLYPHS = {
  raidho: [[7, 4, 7, 32], [7, 4, 17, 11], [17, 11, 7, 18], [7, 18, 17, 32]],
  naudiz: [[12, 4, 12, 32], [6, 13, 18, 23]],
  ansuz: [[8, 4, 8, 32], [8, 4, 17, 12], [8, 13, 17, 21]],
  kaunan: [[16, 8, 7, 18], [7, 18, 16, 28]],
  jera: [[11, 7, 5, 13], [5, 13, 11, 19], [13, 17, 19, 23], [19, 23, 13, 29]],
  dagaz: [[4, 6, 4, 30], [20, 6, 20, 30], [4, 6, 20, 30], [20, 6, 4, 30]],
  isa: [[12, 4, 12, 32]],
  ingwaz: [[12, 7, 20, 18], [20, 18, 12, 29], [12, 29, 4, 18], [4, 18, 12, 7]],
} satisfies Record<string, Stroke[]>;

type GlyphName = keyof typeof GLYPHS;

/** Strike brightness over one cycle: [phase, intensity]. */
const STRIKE_SINGLE: Envelope = [
  [0, 0], [0.4, 0], [0.403, 1], [0.41, 0.1], [0.416, 0.95], [0.422, 0.2],
  [0.426, 1], [0.44, 0.6], [0.48, 0.15], [0.52, 0], [1, 0],
];
const STRIKE_DOUBLE: Envelope = [
  [0, 0], [0.3, 0], [0.303, 0.9], [0.309, 0.1], [0.314, 0.8], [0.325, 0.25], [0.335, 0],
  [0.42, 0], [0.423, 1], [0.429, 0.2], [0.435, 1], [0.45, 0.5], [0.5, 0.1], [0.54, 0], [1, 0],
];

interface RuneSpec {
  g: GlyphName;
  /** Start position along the wind path, 0 to 1. */
  x0: number;
  /** Height on screen, 0 bottom to 1 top. */
  y: number;
  /** Rune height as a fraction of the screen height. */
  s: number;
  dur: number;
  delay: number;
  k: Envelope;
}

const RUNES: RuneSpec[] = [
  { g: 'raidho', x0: 0.05, y: 0.36, s: 0.07, dur: 11, delay: -2, k: STRIKE_SINGLE },
  { g: 'naudiz', x0: 0.17, y: 0.62, s: 0.16, dur: 15, delay: -9, k: STRIKE_DOUBLE },
  { g: 'ansuz', x0: 0.3, y: 0.28, s: 0.06, dur: 9, delay: -5, k: STRIKE_SINGLE },
  { g: 'kaunan', x0: 0.42, y: 0.52, s: 0.055, dur: 13, delay: -11, k: STRIKE_DOUBLE },
  { g: 'jera', x0: 0.55, y: 0.64, s: 0.13, dur: 16, delay: -3, k: STRIKE_SINGLE },
  { g: 'dagaz', x0: 0.67, y: 0.33, s: 0.06, dur: 10, delay: -7, k: STRIKE_DOUBLE },
  { g: 'isa', x0: 0.79, y: 0.6, s: 0.18, dur: 14, delay: -13, k: STRIKE_SINGLE },
  { g: 'ingwaz', x0: 0.91, y: 0.45, s: 0.055, dur: 12, delay: -1, k: STRIKE_DOUBLE },
];

interface FallbackSpec {
  g: GlyphName;
  /** Left, as a percent of the screen width. */
  l: number;
  /** Top, as a percent of the screen height. */
  t: number;
  /** Height in pixels. */
  h: number;
  dur: number;
  delay: number;
}

const FALLBACK_LAYOUT: FallbackSpec[] = [
  { g: 'raidho', l: 8, t: 64, h: 44, dur: 11, delay: -2 },
  { g: 'naudiz', l: 22, t: 26, h: 120, dur: 15, delay: -9 },
  { g: 'ansuz', l: 37, t: 72, h: 38, dur: 9, delay: -5 },
  { g: 'kaunan', l: 51, t: 44, h: 34, dur: 13, delay: -11 },
  { g: 'jera', l: 63, t: 30, h: 96, dur: 16, delay: -3 },
  { g: 'dagaz', l: 75, t: 66, h: 42, dur: 10, delay: -7 },
  { g: 'isa', l: 85, t: 24, h: 140, dur: 14, delay: -13 },
  { g: 'ingwaz', l: 95, t: 56, h: 36, dur: 12, delay: -1 },
];

const reduceMotion = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function envelope(keys: Envelope, ph: number): number {
  for (let j = 1; j < keys.length; j++) {
    if (ph <= keys[j][0]) {
      const a = keys[j - 1];
      const b = keys[j];
      return a[1] + ((b[1] - a[1]) * (ph - a[0])) / (b[0] - a[0]);
    }
  }
  return 0;
}

function readConfig(root: HTMLElement): FogConfig {
  const num = (value: string | undefined, fallback: number): number => {
    const n = Number(value);
    return value !== undefined && Number.isFinite(n) ? n : fallback;
  };
  return {
    mist: num(root.dataset.mist, 0.8),
    speed: Math.max(0.25, num(root.dataset.speed, 1)),
    runes: num(root.dataset.runes, 0.7),
    renderScale: num(root.dataset.renderScale, 0.6),
  };
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Could not create shader');
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compile failed');
  }
  return shader;
}

function startWebGL(canvas: HTMLCanvasElement, config: FogConfig, onFail: () => void): boolean {
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
  } catch {
    gl = null;
  }
  if (!gl) return false;

  let prog: WebGLProgram | null = null;
  try {
    prog = gl.createProgram();
    if (!prog) throw new Error('Could not create program');
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) ?? 'Program link failed');
    }
  } catch (err) {
    console.warn('Fog shader failed, using fallback.', err);
    return false;
  }

  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const u = {
    res: gl.getUniformLocation(prog, 'uRes'),
    time: gl.getUniformLocation(prog, 'uTime'),
    density: gl.getUniformLocation(prog, 'uDensity'),
    rune: gl.getUniformLocation(prog, 'uRune'),
    count: gl.getUniformLocation(prog, 'uCount'),
    seg: gl.getUniformLocation(prog, 'uSeg'),
    segI: gl.getUniformLocation(prog, 'uSegI'),
  };

  const ctx = gl;
  const still = reduceMotion();
  const seg = new Float32Array(MAX_SEG * 4);
  const segI = new Float32Array(MAX_SEG);
  let raf = 0;
  let running = true;
  let t = 20;
  let last = performance.now();

  const resize = (): void => {
    const w = Math.max(1, Math.round(canvas.clientWidth * config.renderScale));
    const h = Math.max(1, Math.round(canvas.clientHeight * config.renderScale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      ctx.viewport(0, 0, w, h);
    }
  };

  const frame = (now: number): void => {
    if (!running) return;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    t += dt * config.speed;
    resize();

    // Work out which runes are striking right now and where they are.
    const tReal = now / 1000;
    const aspect = canvas.width / canvas.height;
    const W = aspect + 0.6;
    const active: { R: RuneSpec; I: number; cx: number; cy: number }[] = [];
    if (!still) {
      for (const R of RUNES) {
        const ph = ((((tReal - R.delay) % R.dur) + R.dur) % R.dur) / R.dur;
        const I = envelope(R.k, ph);
        if (I < 0.003) continue;
        let cx = -0.3 + ((((R.x0 * W - 0.1 * t) % W) + W) % W);
        let cy = R.y;
        if (cx < -0.25 || cx > aspect + 0.25) continue;
        if (I > 0.15) {
          cx += (Math.random() - 0.5) * 0.004 * I;
          cy += (Math.random() - 0.5) * 0.004 * I;
        }
        active.push({ R, I, cx, cy });
      }
      active.sort((a, b) => b.I - a.I);
    }

    let count = 0;
    for (const A of active) {
      if (count >= MAX_SEG) break;
      for (const sg of GLYPHS[A.R.g]) {
        if (count >= MAX_SEG) break;
        const o = count * 4;
        seg[o] = A.cx + ((sg[0] - 12) / 36) * A.R.s;
        seg[o + 1] = A.cy + ((18 - sg[1]) / 36) * A.R.s;
        seg[o + 2] = A.cx + ((sg[2] - 12) / 36) * A.R.s;
        seg[o + 3] = A.cy + ((18 - sg[3]) / 36) * A.R.s;
        segI[count] = A.I;
        count++;
      }
    }

    ctx.uniform2f(u.res, canvas.width, canvas.height);
    ctx.uniform1f(u.time, t);
    ctx.uniform1f(u.density, config.mist * 0.5);
    ctx.uniform1f(u.rune, config.runes);
    ctx.uniform1i(u.count, count);
    ctx.uniform4fv(u.seg, seg);
    ctx.uniform1fv(u.segI, segI);
    ctx.clearColor(0, 0, 0, 0);
    ctx.clear(ctx.COLOR_BUFFER_BIT);
    ctx.drawArrays(ctx.TRIANGLES, 0, 3);

    if (!still) raf = requestAnimationFrame(frame);
  };

  canvas.addEventListener(
    'webglcontextlost',
    (e) => {
      e.preventDefault();
      running = false;
      cancelAnimationFrame(raf);
    },
    { once: true },
  );

  canvas.addEventListener(
    'webglcontextrestored',
    () => {
      if (!startWebGL(canvas, config, onFail)) onFail();
    },
    { once: true },
  );

  raf = requestAnimationFrame(frame);
  return true;
}

function glyphPath(strokes: readonly Stroke[]): string {
  return strokes.map((s) => `M${s[0]} ${s[1]}L${s[2]} ${s[3]}`).join('');
}

function showFallback(fallback: HTMLElement | null, config: FogConfig): void {
  if (!fallback) return;
  fallback.hidden = false;

  const back = fallback.querySelector<HTMLElement>('.mist-back');
  const front = fallback.querySelector<HTMLElement>('.mist-front');
  const track = fallback.querySelector<HTMLElement>('.rune-track');
  if (back) {
    back.style.opacity = String(config.mist * 0.5);
    back.style.animationDuration = `${Math.round(60 / config.speed)}s`;
  }
  if (front) {
    front.style.opacity = String(config.mist * 0.35);
    front.style.animationDuration = `${Math.round(32 / config.speed)}s`;
  }
  if (!track || track.childElementCount) return;
  track.style.opacity = String(config.runes * 0.75);
  track.style.animationDuration = `${Math.round(36 / config.speed)}s`;

  const svgNS = 'http://www.w3.org/2000/svg';
  for (const off of [0, 50]) {
    FALLBACK_LAYOUT.forEach((b, i) => {
      const w = Math.round((b.h * 2) / 3);
      const gs = Math.round(b.h * 3.2);
      const variant = i % 2 ? 'b' : 'a';

      const holder = document.createElement('div');
      holder.className = 'rune';
      holder.style.left = `${off + b.l / 2}%`;
      holder.style.top = `${b.t}%`;
      holder.style.width = `${w}px`;
      holder.style.height = `${b.h}px`;

      const glow = document.createElement('div');
      glow.className = `rune-glow glow-${variant}`;
      glow.style.left = `${Math.round((w - gs) / 2)}px`;
      glow.style.top = `${Math.round((b.h - gs) / 2)}px`;
      glow.style.width = `${gs}px`;
      glow.style.height = `${gs}px`;
      glow.style.animationDuration = `${b.dur}s`;
      glow.style.animationDelay = `${b.delay}s`;

      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 36');
      svg.setAttribute('class', `rune-strike strike-${variant}`);
      svg.style.animationDuration = `${b.dur}s`;
      svg.style.animationDelay = `${b.delay}s`;

      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', glyphPath(GLYPHS[b.g]));
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#F2F7FF');
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      path.setAttribute('stroke-linecap', 'square');
      svg.appendChild(path);

      holder.append(glow, svg);
      track.appendChild(holder);
    });
  }
}

/** Starts the fog inside a [data-fog] element. Safe to call more than once. */
export function initFog(root: HTMLElement): void {
  if (root.dataset.fogReady) return;
  root.dataset.fogReady = 'true';

  const config = readConfig(root);
  const canvas = root.querySelector<HTMLCanvasElement>('[data-fog-canvas]');
  const fallback = root.querySelector<HTMLElement>('[data-fog-fallback]');

  const useFallback = (): void => {
    if (canvas) canvas.hidden = true;
    showFallback(fallback, config);
  };

  if (canvas && startWebGL(canvas, config, useFallback)) {
    if (fallback) fallback.hidden = true;
    return;
  }
  useFallback();
}
