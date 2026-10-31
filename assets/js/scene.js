/* Kavish Tuitions — the persistent 3D background.
   A set of matte plaster geometry models (the classroom set: sphere, cube, cone, cylinder, torus,
   icosahedron, pyramid, prism) lit like a studio still-life and re-composed per route.
   One model is in correction-pen red, one in ink. Contract: SPEC.md, "Scene contract".

   createScene(canvas, { onProgress, reducedMotion, fallback = true, adaptive = true })
     → Promise<API>. Never rejects. Without WebGL2 it resolves a stub ({ supported: false }) whose
       methods are no-ops; by default the stub also shows assets/img/scene-fallback.svg on the canvas
       (pass fallback: false to handle that yourself — the URL is exported as FALLBACK_URL).

   Layouts are defined in viewport-relative terms: (nx, ny) in -1..1 screen space plus a depth offset
   z (world units toward the camera from the focal plane), with landscape and portrait variants, so a
   composition holds from a 360px phone to a 2560px monitor. */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const LAYOUTS = ["loader", "hero", "shelf", "orbit", "stack", "scatter", "single", "grid", "away"];
export const FALLBACK_URL = new URL("../img/scene-fallback.svg", import.meta.url).href;

const COLORS = {
  plaster: "#e6e2d9",
  red: "#e0442a",
  ink: "#1d1c19",
  shadow: "#3b2e1f", // warm umber, never neutral grey
  rule: "#161513",
};
// display-referred --paper (#efebe3), mixed in after the sRGB encode so a fully faded model IS the page
const PAPER = new THREE.Vector3(0xef / 255, 0xeb / 255, 0xe3 / 255);

const FOV = 30;
const DIST = 15;
const PITCH = THREE.MathUtils.degToRad(8);
const WALL_Z = -4.4;
const SMALL_COUNT = 6;
const WALL_OPACITY = 0.16;
const FLOOR_OPACITY = 0.5;
const RULE_OPACITY = 0.26;

// shadow-light directions (shading comes from a separate key light; these only place shadows)
const LIGHTS = {
  front: new THREE.Vector3(-0.2, 0.36, 0.91).normalize(), // floating models: shadows tuck just behind
  frontPortrait: new THREE.Vector3(-0.1, 0.2, 0.97).normalize(),
  // grounded models: contact shadows fall right and back. Frontal enough that one shelf strip's
  // shadow lands behind the strip below it (VSM keeps receivers in its depth map).
  top: new THREE.Vector3(-0.42, 0.62, 0.66).normalize(),
};

/* ------------------------------------------------------------------ easing + maths */

function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 24; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-5) break;
      if (v < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}
const easeMove = bezier(0.22, 0, 0, 1); // gentle start, long confident settle (quart/expo-out feel)
const easeIntro = bezier(0.6, 0, 0.08, 1);
const easeDrift = bezier(0.5, 0, 0.3, 1);
const easeFade = bezier(0.33, 0, 0.2, 1);
const expoOut = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
// pulse envelope: rises in ~0.15s, settles over ~1s, never overshoots
const pulseEnv = (t) => (t < 0 ? 0 : (Math.exp(-3.2 * t) - Math.exp(-11 * t)) * 2.05);

/* ------------------------------------------------------------------ stub */

function makeStub(canvas, showFallback) {
  try {
    document.documentElement.classList.add("no-webgl");
    if (canvas && showFallback) {
      canvas.dataset.scene = "fallback";
      const s = canvas.style;
      s.backgroundImage = `url("${FALLBACK_URL}")`;
      s.backgroundRepeat = "no-repeat";
      const portrait = window.matchMedia && window.matchMedia("(max-aspect-ratio: 9/10)").matches;
      if (portrait) {
        s.backgroundSize = "auto min(32svh, 340px)";
        s.backgroundPosition = "center 9svh";
      } else {
        s.backgroundSize = "min(44vw, 680px) auto";
        s.backgroundPosition = "right max(4vw, 32px) center";
      }
    }
  } catch { /* ignore */ }
  const done = () => Promise.resolve();
  return {
    supported: false,
    count: 0,
    layout: "hero",
    layouts: LAYOUTS.slice(),
    fallbackUrl: FALLBACK_URL,
    setLoadProgress() {},
    intro: done,
    setLayout: done,
    setScroll() {},
    setVisible() {},
    pulse() {},
    focus() {},
    resize() {},
    setReducedMotion() {},
    destroy() {},
  };
}

/* ------------------------------------------------------------------ geometry */

// Lathe profile with filleted corners: real plaster models are never razor sharp.
function roundedProfile(pts, radii, steps = 6) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const [px, py] = pts[i];
    const r = radii[i] || 0;
    if (!r || i === 0 || i === pts.length - 1) { out.push(new THREE.Vector2(px, py)); continue; }
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i + 1];
    let v1x = ax - px, v1y = ay - py, v2x = bx - px, v2y = by - py;
    const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
    v1x /= l1; v1y /= l1; v2x /= l2; v2y /= l2;
    const ang = Math.acos(clamp(v1x * v2x + v1y * v2y, -1, 1));
    const t = Math.min(r / Math.tan(ang / 2), l1 * 0.45, l2 * 0.45);
    const rr = t * Math.tan(ang / 2);
    let bisx = v1x + v2x, bisy = v1y + v2y;
    const bl = Math.hypot(bisx, bisy) || 1;
    bisx /= bl; bisy /= bl;
    const cd = rr / Math.sin(ang / 2);
    const cx = px + bisx * cd, cy = py + bisy * cd;
    const sx = px + v1x * t, sy = py + v1y * t, ex = px + v2x * t, ey = py + v2y * t;
    const a0 = Math.atan2(sy - cy, sx - cx);
    let da = Math.atan2(ey - cy, ex - cx) - a0;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (da * k) / steps;
      out.push(new THREE.Vector2(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr));
    }
  }
  return out;
}

function flatShaded(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.computeVertexNormals();
  return g;
}

// Each spec: base geometry (≈1 unit across), resting orientation + half-height, footprint width.
function buildSpecs(q) {
  const qx = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
  const qz = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);

  const ico = new THREE.IcosahedronGeometry(0.58, 0);
  // rest the icosahedron on a face: rotate face 0's normal to -Y
  const pa = ico.attributes.position;
  const a = new THREE.Vector3().fromBufferAttribute(pa, 0);
  const b = new THREE.Vector3().fromBufferAttribute(pa, 1);
  const c = new THREE.Vector3().fromBufferAttribute(pa, 2);
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
  const icoRest = new THREE.Quaternion().setFromUnitVectors(n, new THREE.Vector3(0, -1, 0));
  const icoIn = Math.abs(a.clone().add(b).add(c).divideScalar(3).dot(n));

  const cyl = new THREE.LatheGeometry(
    roundedProfile([[0, -0.5], [0.4, -0.5], [0.4, 0.5], [0, 0.5]], [0, 0.035, 0.035, 0], q.fillet),
    q.radial
  );
  const cone = new THREE.LatheGeometry(roundedProfile([[0, -0.56], [0.5, -0.56], [0, 0.56]], [0, 0.03, 0], q.fillet), q.radial);

  const specs = [
    { key: "sphere", tone: "red", geo: new THREE.SphereGeometry(0.5, q.sphereW, q.sphereH), r: 0.5, rest: new THREE.Quaternion(), restH: 0.5, w: 1.0 },
    { key: "cube", tone: "plaster", geo: new RoundedBoxGeometry(0.9, 0.9, 0.9, q.box, 0.075), r: 0.78, rest: new THREE.Quaternion(), restH: 0.45, w: 1.1 },
    { key: "cone", tone: "plaster", geo: cone, r: 0.62, rest: new THREE.Quaternion(), restH: 0.56, w: 1.0 },
    { key: "cylinder", tone: "plaster", geo: cyl, r: 0.64, rest: new THREE.Quaternion(), restH: 0.5, w: 0.82 },
    { key: "torus", tone: "plaster", geo: new THREE.TorusGeometry(0.4, 0.165, q.tube, q.ring), r: 0.565, rest: new THREE.Quaternion(), restH: 0.565, w: 1.13, flat: qx(Math.PI / 2), flatH: 0.165 },
    { key: "ico", tone: "ink", geo: ico, r: 0.58, rest: icoRest, restH: icoIn, w: 1.0, faceted: true },
    { key: "pyramid", tone: "plaster", geo: flatShaded(new THREE.ConeGeometry(0.62, 0.92, 4, 1)), r: 0.66, rest: new THREE.Quaternion(), restH: 0.46, w: 1.05, faceted: true },
    { key: "prism", tone: "plaster", geo: flatShaded(new THREE.CylinderGeometry(0.5, 0.5, 1.05, 3, 1)), r: 0.62, rest: qx(-Math.PI / 2).multiply(qz(Math.PI / 2)), restH: 0.25, w: 1.05, faceted: true },
  ];
  // true extents, for keeping compositions clear of the page chrome: the farthest vertex from the
  // centre (any orientation) and the corners of the local box (models that only turn about the vertical)
  for (const sp of specs) {
    const pos = sp.geo.attributes.position;
    const v = new THREE.Vector3();
    let reach = 0;
    for (let i = 0; i < pos.count; i++) reach = Math.max(reach, v.fromBufferAttribute(pos, i).length());
    sp.reach = reach;
    sp.geo.computeBoundingBox();
    const { min, max } = sp.geo.boundingBox;
    sp.corners = [];
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) sp.corners.push(new THREE.Vector3(x, y, z));
  }
  return specs;
}

// The cone tipped over onto its side: the turn about z that lays its slant line flat on the floor,
// and the height its centre then rests at.
function tippedCone(sp) {
  const pos = sp.geo.attributes.position;
  let apex = 0, rim = 0, base = 0;
  for (let i = 0; i < pos.count; i++) {
    apex = Math.max(apex, pos.getY(i));
    base = Math.min(base, pos.getY(i));
    rim = Math.max(rim, Math.hypot(pos.getX(i), pos.getZ(i)));
  }
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI - Math.atan2(apex - base, rim));
  const v = new THREE.Vector3();
  let low = 0;
  for (let i = 0; i < pos.count; i++) low = Math.min(low, v.fromBufferAttribute(pos, i).applyQuaternion(q).y);
  return { q, h: -low };
}

// Tileable value noise: a whisper of plaster grain (bump map).
function makeGrainTexture(size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) return null;
  const img = g.createImageData(size, size);
  const acc = new Float32Array(size * size);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [cells, amp] of [[8, 0.45], [24, 0.3], [64, 0.17], [256, 0.08]]) {
    const lat = new Float32Array(cells * cells);
    for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * cells, y0 = Math.floor(fy), ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells, x0 = Math.floor(fx), tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
        const v00 = lat[y0 * cells + x0], v10 = lat[y0 * cells + x1];
        const v01 = lat[y1 * cells + x0], v11 = lat[y1 * cells + x1];
        acc[y * size + x] += amp * lerp(lerp(v00, v10, sx), lerp(v01, v11, sx), sy);
      }
    }
  }
  for (let i = 0; i < acc.length; i++) {
    const v = clamp(Math.round(acc[i] * 255), 0, 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ------------------------------------------------------------------ materials */

const paperUniform = { value: PAPER };

function makeMaterial(spec, grain) {
  const tone = {
    plaster: { color: COLORS.plaster, roughness: 0.88, bump: 0.12, sheen: 0.3 },
    red: { color: COLORS.red, roughness: 0.66, bump: 0.08, sheen: 0.12 },
    ink: { color: COLORS.ink, roughness: 0.4, bump: 0.06, sheen: 0 },
  }[spec.tone];
  const m = new THREE.MeshPhysicalMaterial({
    color: tone.color,
    roughness: tone.roughness,
    metalness: 0,
    bumpMap: grain || null,
    bumpScale: grain ? tone.bump : 0,
    sheen: tone.sheen,
    sheenRoughness: 0.85,
    sheenColor: new THREE.Color(COLORS.plaster),
    flatShading: !!spec.faceted,
    dithering: true,
  });
  const fade = { value: 0 };
  m.userData.fade = fade;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFade = fade;
    sh.uniforms.uPaper = paperUniform;
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uFade;\nuniform vec3 uPaper;")
      .replace("#include <colorspace_fragment>", "#include <colorspace_fragment>\n\tgl_FragColor.rgb = mix( gl_FragColor.rgb, uPaper, uFade );");
  };
  m.customProgramCacheKey = () => "kt-plaster-fade";
  return m;
}

// Shadow-pass material that dithers coverage away: faded or distant models cast lighter shadows
// (the VSM blur turns the dither into a smooth tone).
function makeDepthMaterial(shadowFade) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uShadowFade = shadowFade;
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uShadowFade;")
      .replace("void main() {", "void main() {\n\tif ( fract( sin( dot( floor( gl_FragCoord.xy ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) < uShadowFade ) discard;");
  };
  m.customProgramCacheKey = () => "kt-depth-dither";
  return m;
}

class CircleCurve extends THREE.Curve {
  getPoint(t, target = new THREE.Vector3()) {
    const a = t * Math.PI * 2;
    return target.set(Math.cos(a), 0, Math.sin(a));
  }
}

/* ------------------------------------------------------------------ layouts
   Each layout returns { items[8], wall, floors?, light?, rules?, ring?, centre?, dynamic? }.
   Item: { p (world), q (base orientation), s (scale), upright, float, ff, phase, wobble, spin, fade, hidden } */

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _eu = new THREE.Euler();
const qE = (rx = 0, ry = 0, rz = 0) => new THREE.Quaternion().setFromEuler(_eu.set(rx, ry, rz));
const qY = (a) => new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), a);

function item(p, s, o = {}) {
  return {
    p,
    s,
    q: o.q || qE(...(o.r || [0, 0, 0])),
    upright: !!o.upright,
    still: !!o.still, // ignores the model's accumulated idle turn: its yaw is exactly q's
    float: o.float ?? 0.1,
    ff: o.ff ?? null,
    phase: o.phase ?? null,
    wobble: o.wobble ?? 0.06,
    spin: o.spin ?? 1,
    fade: o.fade ?? 0,
    hidden: false,
  };
}

// Models resting on a floor around an anchor. Entry: [index, dx, dz, scale, yaw, mode, dy]
// mode: "rest" (spec.rest) | "flat" (torus lying) | "stand" (identity); dy = explicit centre height.
function grounded(specs, anchor, unit, entries, extra = {}) {
  const items = [];
  for (const [i, dx, dz, s, yaw = 0, mode = "rest", dy = null] of entries) {
    const sp = specs[i];
    const sc = s * unit;
    const flat = mode === "flat" && sp.flat;
    const base = flat ? sp.flat : mode === "stand" ? new THREE.Quaternion() : sp.rest;
    const h = flat ? sp.flatH : sp.restH;
    const y = dy === null ? h * sc : dy * unit;
    items[i] = item(anchor.clone().add(V(dx * unit, y, dz * unit)), sc, { q: qY(yaw).multiply(base), upright: true, float: 0, wobble: 0, spin: extra.spin ?? 0.5, fade: extra.fade ?? 0 });
  }
  return items;
}

function fillHidden(items, n, L) {
  for (let i = 0; i < n; i++) {
    if (!items[i]) {
      items[i] = item(L.S(0.6, 0, -2), 0, { float: 0 });
      items[i].hidden = true;
    }
  }
  return items;
}

// Lay models out left→right on a shelf line at screen height ny between nx0..nx1. Returns world data.
function shelfRow(L, specs, idx, rel, ny, nx0, nx1, s) {
  const mid = L.S((nx0 + nx1) / 2, ny, 0);
  const left = L.S(nx0, ny, 0).x, right = L.S(nx1, ny, 0).x;
  const widths = idx.map((i) => specs[i].w * (rel[i] || 1) * s);
  const total = widths.reduce((a, b) => a + b, 0);
  const gap = idx.length > 1 ? (right - left - total) / (idx.length - 1) : 0;
  let x = idx.length > 1 ? left : mid.x - total / 2;
  const out = [];
  idx.forEach((i, k) => {
    out.push({ i, x: x + widths[k] / 2, s: s * (rel[i] || 1) });
    x += widths[k] + gap;
  });
  return { out, y: mid.y, z: mid.z, left, right, mid };
}

// shelf / grid: yaw per model (the torus does not spin, so it is turned three-quarters to the viewer)
const SHELF_YAW = [0, 0.55, 0, 0, -0.55, 0.3, 0.75, 2.25];
// scatter: tumbled, as if dropped on the page
const SCATTER_R = [[0, 0, 0], [0.6, 0.8, 0.3], [0.35, 0.2, -0.7], [1.3, 0.4, 2.2], [0.45, -0.5, 0.35], [0.3, 1.1, 0.2], [0.5, 0.9, 2.6], [1.2, 2.2, 1.6]];
// orbit: base orientations chosen so each model shows its most legible face
const ORBIT_R = [null, [0.45, 0.65, 0.1], [0.3, 0, -0.25], [0.9, 0.3, 0.6], [0.55, -0.4, 0.2], [0.2, 0.4, 0.1], [0.3, 0.75, 0.2], [0.5, 2.3, 0.4]];

const LAYOUT_DEFS = {
  loader(L, specs) {
    const P = L.portrait;
    const unit = (P ? 0.95 : 1.12) * L.u;
    const a = L.S(0, P ? -0.06 : -0.16, 0);
    const items = grounded(specs, a, unit, [
      [1, -0.35, -0.2, 1.0, 0.62],
      [3, 0.62, -0.62, 0.86, 0],
      [2, 0.2, -1.5, 1.28, 0],
      [4, 0.8, 0.55, 0.86, 0, "flat"],
      [5, -1.12, 0.48, 0.74, 0.3],
      [6, 1.5, -0.1, 0.74, 0.45],
      [7, -1.38, -0.8, 0.76, 0.42],
    ]);
    // the red sphere sits on the cube
    items[0] = item(a.clone().add(V(-0.35 * unit, (0.9 + 0.31) * unit, -0.2 * unit)), 0.62 * unit, { upright: true, float: 0, wobble: 0, spin: 0.4 });
    return {
      items,
      wall: 0,
      light: "top",
      floors: [{ x: a.x + 0.6 * unit, y: a.y, z: a.z - 0.4 * unit, w: 7 * unit, d: 4.5 * unit, o: 1 }],
      centre: a.clone().add(V(0, 0.6 * unit, 0)),
    };
  },

  hero(L) {
    const P = L.portrait;
    // [nx, ny, z, scale, rx, ry, rz, fade] — a cluster with deliberate overlaps: the cube anchors,
    // the cone stands behind it, the torus leans in front, the red sphere floats free.
    // Portrait: the two dark accents (sphere, icosahedron) float in the strip between the chrome and
    // the copy, rising when the notice is dismissed; the plaster models sit lighter behind the headline.
    // On short phones the copy (about 590px, bottom-aligned in a full-height hero) reaches up to the
    // chrome and leaves no strip: the accents then shrink a little and dim, reading as background.
    const hi = (ny, r) => Math.min(ny, L.ceil - r * L.u);
    const dim = P ? 1 - smooth(30, 90, L.px - L.chrome - 590) : 0;
    const acc = 1 - 0.12 * dim, af = 0.06 + 0.34 * dim;
    const D = P
      ? [
          [-0.58 - 0.12 * dim, hi(0.6, 0.135), 1.3, 0.44 * acc, 0, 0, 0, af],
          [0.22, 0.3, 0.0, 0.96, 0.45, 0.68, 0.12, 0.3],
          [0.76, hi(0.46, 0.2), -1.7, 0.82, 0.32, 0, -0.22, 0.26],
          [-0.62, 0.2, -0.9, 0.7, 0.9, 0.2, 1.05, 0.42],
          [0.68, 0.1, 1.0, 0.72, 0.5, -0.5, 0.25, 0.16],
          [0.6, hi(0.74, 0.135), -0.9, 0.52 * acc, 0.2, 0.4, 0.1, af],
        ]
      : [
          [0.17, 0.34, 1.6, 0.62, 0, 0, 0],
          [0.44, -0.15, 0.0, 1.9, 0.45, 0.68, 0.12],
          [0.74, 0.26, -1.7, 1.42, 0.32, 0, -0.2],
          [0.22, -0.6, -1.1, 1.0, 0.9, 0.2, 1.05],
          [0.7, -0.52, 1.15, 1.32, 0.55, -0.55, 0.3],
          [0.53, 0.58, -0.7, 0.95, 0.2, 0.4, 0.1],
          [0.86, 0.64, -2.8, 0.86, 0.35, 0.75, 0.2],
          [0.4, -0.8, -2.4, 0.9, 0.55, 2.4, 0.5],
        ];
    // squarer landscape screens (tablets, 4:3 laptops): the copy column reaches further right, so the
    // two low models nearest it step aside, clear of the call-to-action row and the hero's base rule
    const nudge = P ? 0 : clamp((1.55 - L.aspect) * 0.6, 0, 0.18);
    if (nudge) {
      D[3] = [D[3][0] + nudge, D[3][1] + nudge * 0.4, ...D[3].slice(2)];
      D[7] = [0.97, 0.02, -2.6, ...D[7].slice(3)];
    }
    const items = D.map(([nx, ny, z, s, rx, ry, rz, fade = 0]) =>
      item(L.S(nx, ny, z), s * L.u, { r: [rx, ry, rz], fade: fade + smooth(-1.8, -3.2, z) * 0.16, float: 0.1, wobble: 0.06 })
    );
    return { items, wall: P ? 0.45 : 1 };
  },

  // courses: two shelves of specimens, top right (portrait: two short shelves across the top)
  shelf(L, specs) {
    const P = L.portrait;
    const act = (arr) => arr.filter((i) => i < L.count);
    const tiers = P ? [act([3, 0, 2]), act([1, 4, 5])] : [act([3, 0, 2, 1]), act([4, 6, 5, 7])];
    const rel = { 0: 0.78, 1: 0.88, 2: 1.0, 3: 0.95, 4: 0.9, 5: 0.86, 6: 0.92, 7: 0.9 };
    const ys = P ? [0.58, 0.24] : [0.42, -0.14];
    const nx0 = P ? -0.66 : 0.18, nx1 = P ? 0.66 : 0.82;
    // one scale for both shelves, so the specimens read as one set
    let s = (P ? 0.66 : 1.0) * L.u;
    for (const t of tiers) {
      if (t.length < 2) continue;
      const span = L.S(nx1, 0, 0).x - L.S(nx0, 0, 0).x;
      const w = t.reduce((acc, i) => acc + specs[i].w * rel[i], 0);
      s = Math.min(s, span / (w + 0.42 * (t.length - 1)));
    }
    const items = [], floors = [], rules = [];
    tiers.forEach((t, k) => {
      if (!t.length) return;
      const row = shelfRow(L, specs, t, rel, ys[k], nx0, nx1, s);
      for (const r of row.out) {
        const sp = specs[r.i];
        const base = r.i === 4 ? new THREE.Quaternion() : sp.rest;
        const h = r.i === 4 ? sp.restH : sp.restH;
        const yaw = SHELF_YAW[r.i];
        items[r.i] = item(V(r.x, row.y + h * r.s, row.z), r.s, { q: qY(yaw).multiply(base), upright: true, float: 0, wobble: 0, spin: r.i === 4 ? 0 : 0.45, fade: P ? 0.06 : 0 });
      }
      const pad = (P ? 0.3 : 0.42) * s, depth = 1.5 * s;
      floors.push({ x: (row.left + row.right) / 2, y: row.y, z: row.z, w: row.right - row.left + pad * 4, d: depth, o: 1 });
      const fz = row.z + depth * 0.5;
      rules.push([V(row.left - pad, row.y, fz), V(row.right + pad, row.y, fz), 1]);
    });
    return { items, wall: 0, light: "top", floors, rules };
  },

  // tutors: models on an inclined orbit around the red sphere, its path drawn as an ink line
  orbit(L) {
    const P = L.portrait;
    const c = L.S(P ? 0 : 0.5, P ? 0.5 : 0.02, -0.5);
    const R = (P ? 1.32 : 2.45) * L.u;
    const tilt = qE(0.5, 0, P ? 0.1 : 0.14);
    const n = L.count - 1;
    const items = [];
    items[0] = item(c.clone(), (P ? 0.62 : 1.0) * L.u, { float: 0.05, wobble: 0.04, spin: 0.6, fade: P ? 0.08 : 0 });
    const w = L.t * 0.07;
    for (let k = 0; k < n; k++) {
      const i = k + 1;
      const a = (k / n) * Math.PI * 2 + w + 0.5;
      const local = V(Math.cos(a), 0, Math.sin(a)).multiplyScalar(R).applyQuaternion(tilt);
      const back = clamp01(-Math.sin(a));
      items[i] = item(c.clone().add(local), (P ? 0.46 : 0.74) * L.u, {
        r: ORBIT_R[i],
        float: 0.04,
        wobble: 0.05,
        spin: 1.1,
        fade: back * 0.3 + (P ? 0.08 : 0),
      });
    }
    // dynamic: rebuilt every frame; period: the time after which the set repeats its arrangement
    return { items, wall: P ? 0.22 : 0.3, dynamic: true, period: (Math.PI * 2) / Math.max(1, n) / 0.07, centre: c, ring: { c, R, q: tilt } };
  },

  // plans: a balanced tower — cube, cylinder, torus, and the red sphere nested on top
  stack(L, specs) {
    const P = L.portrait;
    const unit = (P ? 0.58 : 0.92) * L.u;
    const a = L.S(P ? 0.16 : 0.5, P ? 0.2 : -0.6, 0);
    const cs = 1.3, ys = 1.0, ts = 1.05, ss = 0.8;
    const cubeTop = 0.9 * cs;
    const cylTop = cubeTop + 1.0 * ys;
    const tr = 0.165 * ts, tR = 0.4 * ts, cylR = 0.4 * ys;
    const torusY = cylTop + Math.sqrt(Math.max(tr * tr - (tR - cylR) ** 2, 0.0001));
    const sa = 0.5 * ss;
    const sphereY = torusY + Math.sqrt((sa + tr) ** 2 - tR * tR);
    const items = grounded(specs, a, unit, [
      [1, 0, 0, cs, 0.4, "stand"],
      [3, 0, 0, ys, 0, "stand", cubeTop + 0.5 * ys],
      [4, 0, 0, ts, 0, "flat", torusY],
      [0, 0, 0, ss, 0, "stand", sphereY],
      [2, 1.32, -0.62, 1.12, 0],
      [5, -1.12, 0.6, 0.9, 0.5],
      [6, 1.18, 0.82, 0.84, 0.35],
      [7, -1.32, -0.7, 0.95, 0.65],
    ], { spin: 0.3, fade: P ? 0.05 : 0 });
    return {
      items,
      wall: 0,
      light: "top",
      floors: [{ x: a.x + 0.6 * unit, y: a.y, z: a.z - 0.3 * unit, w: 7 * unit, d: 4.2 * unit, o: 1 }],
      centre: a.clone().add(V(0, 1.6 * unit, 0)),
    };
  },

  // resources: small models scattered to the edges of the page, lying close to it (tight shadows),
  // clear of the text column
  scatter(L) {
    const P = L.portrait;
    // [nx, ny, z, scale]
    const D = P
      ? [
          [0.8, 0.72, -1.6, 0.46],
          [-0.84, 0.58, -2.0, 0.62],
          [0.3, 0.3, -2.3, 0.58],
          [-0.36, 0.26, -1.7, 0.5],
          [0.9, 0.28, -2.4, 0.62],
          [-0.02, 0.7, -2.2, 0.54],
        ]
      : [
          [0.62, 0.1, -1.6, 0.5],
          [0.9, -0.66, -2.1, 0.78],
          [0.16, 0.5, -2.3, 0.62],
          [0.93, 0.44, -1.9, 0.7],
          [0.46, -0.8, -2.0, 0.72],
          [0.5, 0.62, -1.8, 0.6],
          [-0.12, -0.9, -2.4, 0.62],
          [0.3, -0.18, -2.5, 0.62],
        ];
    const items = D.map(([nx, ny, z, s], i) =>
      item(L.S(nx, ny, z), s * L.u * (P ? 1 : 1.15), { r: SCATTER_R[i], float: 0.06, wobble: 0.1, spin: 0.9, fade: P ? 0.18 : 0 })
    );
    return { items, wall: P ? 0.55 : 0.9 };
  },

  // quiz: one large model centre-right; the rest wait in a row like answer options. focus(i) swaps.
  single(L, specs) {
    const P = L.portrait;
    const F = L.focus === null || L.focus === undefined ? 5 : L.focus;
    const items = [];
    items[F] = item(L.S(P ? 0.04 : 0.5, P ? 0.52 : 0.08, P ? 0.6 : 1.0), (P ? 1.35 : 2.25) * L.u, { r: [0.35, 0.6, 0.1], float: 0.08, wobble: 0.05, spin: 0.8, fade: P ? 0.05 : 0 });
    const idx = [];
    for (let i = 0; i < L.count; i++) idx.push(i);
    const s = (P ? 0.4 : 0.48) * L.u;
    const row = shelfRow(L, specs, idx, {}, P ? 0.17 : -0.74, P ? -0.78 : 0.2, P ? 0.78 : 0.84, s);
    for (const r of row.out) {
      if (r.i === F) continue;
      const sp = specs[r.i];
      const base = r.i === 4 ? new THREE.Quaternion() : sp.rest;
      items[r.i] = item(V(r.x, row.y + sp.restH * r.s, row.z), r.s, { q: qY(SHELF_YAW[r.i]).multiply(base), upright: true, float: 0, wobble: 0, spin: r.i === 4 ? 0 : 0.5, fade: P ? 0.22 : 0.12 });
    }
    const pad = 0.4 * s;
    return {
      items,
      wall: P ? 0.25 : 0.8,
      rules: [[V(row.left - pad, row.y, row.z + 0.5 * s), V(row.right + pad, row.y, row.z + 0.5 * s), 0.8]],
    };
  },

  // enrol: a specimen cabinet, 3×3 pigeonholes with one left open (portrait 3×2, all filled).
  // The frame is drawn in the camera plane (no keystone); each shelf strip sits at its front edge.
  grid(L, specs) {
    const P = L.portrait;
    const cols = 3, rows = P ? 2 : 3;
    const cell = (P ? 0.98 : 1.36) * L.u;
    const depth = cell * 0.8;
    const c = L.S(P ? 0 : 0.5, P ? 0.5 : -0.04, 0.4 * cell);
    const R = L.right, U = L.up;
    const at = (cx, cy) => c.clone().addScaledVector(R, cx * cell).addScaledVector(U, cy * cell);
    const order = [1, 0, 2, 3, 5, 4, 6, 7].filter((i) => i < L.count);
    const items = [], floors = [], rules = [];
    for (let r = 0; r < rows; r++) {
      const edge = at(0, rows / 2 - r - 1); // front edge of row r's shelf
      floors.push({ x: edge.x, y: edge.y, z: edge.z - depth / 2, w: cols * cell, d: depth, o: 1 });
    }
    order.forEach((i, k) => {
      if (k >= cols * rows) return;
      const col = k % cols, row = Math.floor(k / cols);
      const f = floors[row];
      const sp = specs[i];
      const s = (0.56 * cell) / Math.max(sp.w, 2 * sp.restH);
      const base = i === 4 ? new THREE.Quaternion() : sp.rest;
      const p = V(c.x + (col - 1) * cell, f.y + sp.restH * s, f.z);
      items[i] = item(p, s, { q: qY(SHELF_YAW[i]).multiply(base), upright: true, float: 0, wobble: 0, spin: i === 4 ? 0 : 0.45, fade: P ? 0.06 : 0 });
    });
    for (let k = 0; k <= cols; k++) rules.push([at(k - cols / 2, -rows / 2), at(k - cols / 2, rows / 2), k === 0 || k === cols ? 1 : 0.7]);
    for (let r = 0; r <= rows; r++) rules.push([at(-cols / 2, r - rows / 2), at(cols / 2, r - rows / 2), r === 0 || r === rows ? 1 : 0.7]);
    return { items, wall: 0, light: "top", floors, rules };
  },

  // 404: the set has drifted out of frame, all but the cone, left behind tipped over on its side
  // with its point toward the copy (portrait: low on the page, under the buttons)
  away(L, specs) {
    const P = L.portrait;
    const items = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.35;
      const p = L.S(Math.cos(a) * 1.75, Math.sin(a) * 1.8, -1 + (i % 3));
      items[i] = item(p, 0.8 * L.u, { r: [i, i * 1.7, i * 0.5], float: 0.2, wobble: 0.2, spin: 2.2 });
    }
    const sp = specs[2];
    const tip = sp.tipped || (sp.tipped = tippedCone(sp));
    const s = (P ? 1.0 : 1.5) * L.u;
    const a = L.S(P ? 0.36 : 0.6, P ? -0.74 : -0.36, 0);
    items[2] = item(a.clone().add(V(0, tip.h * s, 0)), s, { q: qY(P ? -0.4 : -0.45).multiply(tip.q), upright: true, still: true, float: 0, wobble: 0, spin: 0 });
    // the shelf it was standing on, now empty: a hairline at the floor's front edge
    const fz = a.z + 0.5 * s;
    const x0 = L.S(P ? -0.3 : 0.3, 0, 0.5 * s).x, x1 = L.S(P ? 0.88 : 0.92, 0, 0.5 * s).x;
    return {
      items,
      wall: 0,
      light: "top",
      floors: [{ x: (x0 + x1) / 2, y: a.y, z: a.z - 0.5 * s, w: x1 - x0 + s, d: 2.5 * s, o: 1 }],
      rules: [[V(x0, a.y, fz), V(x1, a.y, fz), 1]],
      centre: a.clone(),
    };
  },
};

/* ------------------------------------------------------------------ main */

export async function createScene(canvas, options = {}) {
  const { onProgress = () => {}, reducedMotion = false, fallback = true, adaptive = true, debug = false } = options || {};
  const report = (p) => { try { onProgress(clamp01(p)); } catch { /* the shell's callback is not ours to fail on */ } };
  if (!canvas || typeof window === "undefined" || typeof canvas.getContext !== "function") {
    report(1);
    return makeStub(canvas, fallback);
  }
  let gl = null;
  const attrs = { alpha: true, antialias: true, premultipliedAlpha: true, depth: true, stencil: false, powerPreference: "high-performance", preserveDrawingBuffer: false };
  try { gl = canvas.getContext("webgl2", attrs); } catch { gl = null; }
  if (!gl) {
    try { gl = canvas.getContext("webgl2", { ...attrs, antialias: false, powerPreference: "default" }); } catch { gl = null; }
  }
  if (!gl) {
    report(1);
    return makeStub(canvas, fallback);
  }
  try {
    return await build(canvas, gl, { report, reducedMotion: !!reducedMotion, adaptive, debug });
  } catch (err) {
    console.warn("[scene] 3D disabled:", err && err.message ? err.message : err);
    try { document.querySelectorAll("[data-scene-probe]").forEach((n) => n.remove()); } catch { /* ignore */ }
    report(1);
    return makeStub(canvas, fallback);
  }
}

const nextFrame = () => new Promise((r) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => r()) : setTimeout(r, 16)));
const nowS = () => performance.now() / 1000;

async function build(canvas, gl, { report, reducedMotion, adaptive, debug }) {
  report(0.05);
  const sizeOf = () => {
    const w = canvas.clientWidth || window.innerWidth || 1;
    const h = canvas.clientHeight || window.innerHeight || 1;
    return [Math.max(1, w), Math.max(1, h)];
  };
  let [W, H] = sizeOf();
  const coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  const smallScreen = Math.min(W, H) < 600 || (coarse && Math.min(screen.width || W, screen.height || H) < 600);
  const cores = navigator.hardwareConcurrency || 4;
  const low = smallScreen || cores <= 4 || (navigator.deviceMemory && navigator.deviceMemory <= 4);
  const Q = {
    dprCap: smallScreen || coarse ? 1.5 : 1.75,
    // soft shadows need few texels: a small map keeps the VSM blur radius within its sample count
    shadow: smallScreen ? 768 : 1024,
    blurSamples: smallScreen ? 12 : 16,
    sphereW: smallScreen ? 48 : 72,
    sphereH: smallScreen ? 32 : 48,
    radial: smallScreen ? 48 : 72,
    fillet: smallScreen ? 4 : 6,
    tube: smallScreen ? 24 : 36,
    ring: smallScreen ? 64 : 112,
    box: smallScreen ? 4 : 6,
    grain: !low,
  };

  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: true, premultipliedAlpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  let dpr = Math.min(window.devicePixelRatio || 1, Q.dprCap);
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  report(0.2);
  await nextFrame();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.5, 80);
  let pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  const makeEnv = () => {
    if (envRT) envRT.dispose();
    envRT = null;
    const room = new RoomEnvironment();
    envRT = pmrem.fromScene(room, 0.035);
    room.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    scene.environment = envRT.texture;
  };
  makeEnv();
  scene.environmentIntensity = 0.62;
  scene.environmentRotation.set(0, -0.6, 0);
  report(0.45);
  await nextFrame();

  // key light (shading only): upper left, slightly in front, faintly warm
  const keyLight = new THREE.DirectionalLight(0xfff8f0, 2.0);
  keyLight.position.set(-0.62, 0.72, 0.42).multiplyScalar(30);
  scene.add(keyLight);
  // warm bounce from the paper below, so shadow sides read as lit plaster rather than grey CG
  const bounce = new THREE.HemisphereLight(0xfffaf3, 0xd6c3a2, 0.7);
  scene.add(bounce);
  // shadow light: zero intensity, it only drives the shadow catchers; its direction is per layout
  const LDIR = LIGHTS.front.clone();
  const key = new THREE.DirectionalLight(0xffffff, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(Q.shadow, Q.shadow);
  key.shadow.radius = 16;
  key.shadow.blurSamples = Q.blurSamples;
  key.shadow.bias = -0.0004;
  scene.add(key, key.target);

  const shadowMat = () => new THREE.ShadowMaterial({ color: new THREE.Color(COLORS.shadow), opacity: 0, transparent: true, depthWrite: false });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat());
  wall.receiveShadow = true;
  wall.position.z = WALL_Z;
  wall.renderOrder = -2;
  scene.add(wall);
  // floor catchers (shelves, the still-life table). VSM needs receivers in its depth pass; a visible
  // wall in that pass makes grazing floors shade themselves, so wall and floors are never shown together.
  const floorGeo = new THREE.PlaneGeometry(1, 1);
  const floors = [0, 1, 2, 3, 4, 5].map(() => {
    const m = new THREE.Mesh(floorGeo, shadowMat());
    m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    m.renderOrder = -1;
    m.visible = false;
    scene.add(m);
    return m;
  });

  const grain = Q.grain ? makeGrainTexture(256) : null;
  if (grain) grain.repeat.set(3, 3);
  const specs = buildSpecs(Q);
  report(0.65);
  await nextFrame();

  // hairline rules: two banks so one layout's lines fade out while the next layout's draw in
  const ruleGeo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
  const ruleBanks = [0, 1].map(() => ({ meshes: [], segs: [], o: 0, target: 0, draw: 0, drawT0: 0 }));
  const ensureRules = (bank, n) => {
    while (bank.meshes.length < n) {
      const m = new THREE.Mesh(ruleGeo, new THREE.MeshBasicMaterial({ color: COLORS.rule, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      m.visible = false;
      m.renderOrder = 1;
      scene.add(m);
      bank.meshes.push(m);
    }
  };
  let activeBank = 0;

  // the orbit path: a hairline tube that draws itself in
  const ringMat = new THREE.MeshBasicMaterial({ color: COLORS.rule, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.BufferGeometry(), ringMat);
  ring.visible = false;
  ring.renderOrder = 1;
  scene.add(ring);
  let ringKey = "";
  const ringState = { o: 0, target: 0, drawT0: 0 };

  const objects = specs.map((sp, i) => {
    const mat = makeMaterial(sp, grain);
    const mesh = new THREE.Mesh(sp.geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    const shadowFade = { value: 0 };
    mesh.customDepthMaterial = makeDepthMaterial(shadowFade);
    mesh.visible = false;
    scene.add(mesh);
    // idle spin axis: roughly the model's own vertical; the torus turns about its symmetry axis so it
    // never spins edge-on
    const axis = (sp.key === "torus" ? V(0.12, 0.18, 1) : V(Math.sin(i * 2.1) * 0.2, 1, Math.cos(i * 1.7) * 0.16)).normalize();
    return {
      i, sp, mesh, mat, shadowFade, axis,
      rate: (0.14 + ((i * 37) % 10) / 100) * (i % 2 ? -1 : 1),
      phase: i * 1.37,
      ff: 0.42 + ((i * 53) % 17) / 60,
      angle: i * 0.9,
      cur: { p: V(), q: new THREE.Quaternion(), s: 0, fade: 0 },
      from: { p: V(), q: new THREE.Quaternion(), s: 0, fade: 0 },
      live: { p: V(), q: new THREE.Quaternion(), s: 0, fade: 0 },
      appearAt: null,
      fx: 0,
      dir: V(),
    };
  });
  report(0.8);

  /* ---------------- view geometry */

  // The page's fixed chrome (announcement + header) is transparent at rest, so nothing the scene draws
  // may sit under it. Its height is the page's --top-offset, turned into pixels by an invisible probe
  // that follows it; a ResizeObserver on the probe re-composes the layout when the notice is dismissed
  // or rewraps.
  let chromePx = 0;
  let chromeProbe = null;
  try {
    chromeProbe = document.createElement("div");
    chromeProbe.setAttribute("aria-hidden", "true");
    chromeProbe.setAttribute("data-scene-probe", "");
    chromeProbe.style.cssText = "position:fixed;top:0;left:0;width:0;height:var(--top-offset,0px);visibility:hidden;pointer-events:none;contain:strict";
    (document.body || document.documentElement).appendChild(chromeProbe);
  } catch { chromeProbe = null; }
  const readChrome = () => {
    const h = chromeProbe && chromeProbe.isConnected ? chromeProbe.getBoundingClientRect().height : 0;
    return Number.isFinite(h) && h > 0 ? h : 0;
  };

  const basePos = V(), fwd = V(), right = V(1, 0, 0), up = V();
  let aspect = W / H, portrait = false, count = 8, unit = 1;
  const variantKey = () => `${portrait}|${count}|${Math.round(chromePx)}`;
  const tanH = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const halfH = (d) => d * tanH;
  const S = (nx, ny, z = 0) => {
    const d = DIST - z;
    return basePos.clone().addScaledVector(fwd, d).addScaledVector(right, nx * halfH(d) * aspect).addScaledVector(up, ny * halfH(d));
  };

  function computeView() {
    [W, H] = sizeOf();
    aspect = W / H;
    portrait = aspect < 0.9;
    count = Math.min(W, H) < 600 || W < 720 ? SMALL_COUNT : 8;
    basePos.set(0, Math.sin(PITCH) * DIST, Math.cos(PITCH) * DIST);
    fwd.copy(basePos).multiplyScalar(-1).normalize();
    up.crossVectors(right, fwd).normalize();
    const hh0 = halfH(DIST), hw0 = hh0 * aspect;
    unit = portrait ? clamp(hw0 / 1.857, 0.85, 1.3) : clamp(hw0 / (1.6 * hh0), 0.72, 1);
    chromePx = Math.min(readChrome(), H * 0.4);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }

  const wallBox = { minX: -10, maxX: 10, minY: -10, maxY: 10 };
  function fitWall() {
    // cover the frustum (with parallax / scroll-drift margin) where it meets z = WALL_Z
    const ray = V();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [nx, ny] of [[-1.3, -1.7], [1.3, -1.7], [-1.3, 1.4], [1.3, 1.4]]) {
      ray.copy(fwd).addScaledVector(right, nx * tanH * aspect).addScaledVector(up, ny * tanH).normalize();
      const t = (WALL_Z - basePos.z) / ray.z;
      const px = basePos.x + ray.x * t, py = basePos.y + ray.y * t;
      minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    }
    Object.assign(wallBox, { minX, maxX, minY, maxY });
    wall.scale.set(maxX - minX, maxY - minY, 1);
    wall.position.set((minX + maxX) / 2, (minY + maxY) / 2, WALL_Z);
  }

  const _inv = new THREE.Matrix4();
  const shadowPts = [];
  function fitShadowCamera() {
    // orthographic shadow camera fitted, in light space, to the wall + the volume the models live in
    key.target.position.set(0, 0, 0);
    key.position.copy(LDIR).multiplyScalar(30);
    key.updateMatrixWorld();
    key.target.updateMatrixWorld();
    const sc = key.shadow.camera;
    sc.position.copy(key.position);
    sc.lookAt(key.target.position);
    sc.updateMatrixWorld();
    _inv.copy(sc.matrixWorld).invert();
    shadowPts.length = 0;
    const { minX, maxX, minY, maxY } = wallBox;
    for (const [x, y] of [[minX, minY], [maxX, minY], [minX, maxY], [maxX, maxY]]) shadowPts.push(V(x, y, WALL_Z));
    for (const z of [3.5, -3.8]) for (const [nx, ny] of [[-1.25, -1.6], [1.25, -1.6], [-1.25, 1.35], [1.25, 1.35]]) shadowPts.push(S(nx, ny, z));
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity, n = Infinity, f = -Infinity;
    for (const p of shadowPts) {
      p.applyMatrix4(_inv);
      a = Math.min(a, p.x); b = Math.max(b, p.x); c = Math.min(c, p.y); d = Math.max(d, p.y);
      n = Math.min(n, -p.z); f = Math.max(f, -p.z);
    }
    sc.left = a - 0.5; sc.right = b + 0.5; sc.bottom = c - 0.5; sc.top = d + 0.5;
    sc.near = Math.max(0.1, n - 6); sc.far = f + 2;
    sc.updateProjectionMatrix();
    // keep the blur roughly constant in world units whatever the map covers
    const texel = (sc.right - sc.left) / Q.shadow;
    key.shadow.radius = clamp(0.3 / texel, 3, Q.blurSamples * 0.75);
  }

  /* ---------------- state */

  let layoutName = "loader";
  let pendingLayout = null;
  let introDone = false;
  let anyProgress = false;
  let targets = null;
  let focusIndex = null;
  let focusSetAt = -10;
  let simTime = 0;
  let trans = null;
  let reduced = reducedMotion;
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  const scr = { p: 0, tp: 0, v: 0, tv: 0, drift: 0 };
  let pulseAt = -10;
  let lastAppear = 0;
  let loadP = 0;
  const env = { wall: 0, wallFrom: 0, floors: [], floorsFrom: [], fadeExtra: 0, light: LIGHTS.top.clone(), lightFrom: LIGHTS.top.clone(), ring: 0 };
  let autoIntroTimer = 0;

  // ceil: the highest screen ny (+1 = the canvas's top edge) anything may reach, just under the chrome
  const SAFE_GAP = 8; // CSS px between the chrome's lower edge and anything drawn
  const ceilNy = () => 1 - (2 * (chromePx + SAFE_GAP)) / H;
  // px: canvas height in CSS px; chrome: the chrome's height in CSS px
  const ctx = (t = simTime) => ({ aspect, portrait, count, u: unit, t, focus: focusIndex, ceil: ceilNy(), px: H, chrome: chromePx, S, halfH, right, up, fwd });
  const lightFor = (t) => (t.light === "top" ? LIGHTS.top : portrait ? LIGHTS.frontPortrait : LIGHTS.front);

  /* ---------------- keeping clear of the chrome
     Layouts are authored for the full canvas. When one would reach under the chrome, it is refitted:
     everything above the composition's lowest point is drawn down toward it (factor k) and the models
     shrink a little with it, so a composition keeps its shape and its footing just above the copy. Only
     if that is not enough does the whole thing step down (dy). Every layout positions through L.S and
     sizes through L.u, so grounded groups, shelves, the grid and the orbit stay intact. */

  const FIT_KMIN = 0.45;
  const _mv = V(), _mc = V(), _mp = V();
  const nyAt = (p) => {
    _mv.subVectors(p, basePos);
    return _mv.dot(up) / halfH(_mv.dot(fwd));
  };
  // screen extent (ny: +1 = the canvas's top edge) of what a layout draws, seen from the resting camera:
  // model silhouettes with their float and the pulse's breath, hairline rules and the orbit path
  // (shadows fall below and behind the models that cast them)
  function extent(out, acc) {
    const breath = 0.14 * unit;
    const add = (n) => { if (n > acc.top) acc.top = n; if (n < acc.bottom) acc.bottom = n; };
    out.items.forEach((it, i) => {
      if (!it || it.hidden || !(it.s > 0)) return;
      const sp = specs[i];
      if (it.upright) {
        // turns about the vertical only: its height is fixed, its depth swings through ±rh
        for (const c of sp.corners) {
          _mc.copy(c).applyQuaternion(it.q).multiplyScalar(it.s * 1.05);
          const rh = Math.hypot(_mc.x, _mc.z), y = it.p.y + _mc.y + Math.sign(_mc.y) * breath;
          add(nyAt(_mp.set(it.p.x, y, it.p.z - rh)));
          add(nyAt(_mp.set(it.p.x, y, it.p.z + rh)));
        }
      } else {
        const n = nyAt(it.p), r = (sp.reach * it.s * 1.05 + it.float + breath) / halfH(_mv.dot(fwd));
        add(n + r);
        add(n - r);
      }
    });
    const hair = 3 / H; // a rule's own antialiased width, ~1.5 CSS px
    for (const seg of out.rules || []) for (const p of [seg[0], seg[1]]) { const n = nyAt(p); add(n + hair); add(n - hair); }
    if (out.ring) {
      const { c, R, q } = out.ring;
      for (let k = 0; k < 48; k++) {
        const a = (k / 48) * Math.PI * 2;
        add(nyAt(_mp.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(R).applyQuaternion(q).add(c)));
      }
    }
    return acc;
  }

  function compose(def, f, t = simTime) {
    const L = ctx(t);
    if (f && (f.k < 1 || f.dy)) {
      const { k, dy, piv } = f;
      L.S = (nx, ny, z = 0) => S(nx, (ny > piv ? piv + (ny - piv) * k : ny) - dy, z);
      L.u = unit * (0.4 + 0.6 * k);
    }
    return def(L, specs);
  }

  function solveFit(def) {
    const ceil = ceilNy();
    const measure = (f) => {
      const out = compose(def, f);
      const acc = extent(out, { top: -Infinity, bottom: Infinity });
      // a moving layout (the orbit) is measured over a whole cycle
      if (out.dynamic && out.period) for (let j = 1; j < 10; j++) extent(compose(def, f, simTime + (j / 10) * out.period), acc);
      return acc;
    };
    const e0 = measure(null);
    if (!(e0.top > ceil)) return null;
    const piv = Math.min(e0.bottom, ceil - 0.2);
    let f = { k: FIT_KMIN, dy: 0, piv };
    let top = measure(f).top;
    if (top > ceil) {
      // drawing it down is not enough: the (drawn-down) composition steps down as a whole
      for (let j = 0; j < 4 && top > ceil; j++) {
        f = { ...f, dy: f.dy + (top - ceil) + 0.002 };
        top = measure(f).top;
      }
      return f;
    }
    let lo = FIT_KMIN, hi = 1;
    for (let j = 0; j < 9; j++) {
      const k = (lo + hi) / 2;
      if (measure({ k, dy: 0, piv }).top > ceil) hi = k;
      else lo = k;
    }
    return { k: lo, dy: 0, piv };
  }

  let fit = { key: "", f: null };
  function buildTargets(name = layoutName) {
    const def = LAYOUT_DEFS[name] || LAYOUT_DEFS.hero;
    // the loader covers the chrome; the 404 layout is authored clear of it (its models leave the frame)
    if (name !== "loader" && name !== "away") {
      const key = `${name}|${W}x${H}|${variantKey()}|${focusIndex}`;
      if (fit.key !== key) fit = { key, f: solveFit(def) };
    }
    const out = compose(def, name !== "loader" && name !== "away" ? fit.f : null);
    const L = ctx();
    fillHidden(out.items, 8, L);
    for (let i = 0; i < 8; i++) if (i >= count) { out.items[i].s = 0; out.items[i].hidden = true; }
    const shown = out.items.filter((it) => !it.hidden);
    const centre = out.centre || shown.reduce((acc, it) => acc.add(it.p), V()).divideScalar(Math.max(1, shown.length));
    out.items.forEach((it, i) => objects[i].dir.subVectors(it.p, centre).normalize());
    out.floors = out.floors || [];
    return out;
  }

  /* ---------------- rules + ring */

  function setRules(rules) {
    const old = ruleBanks[activeBank];
    old.target = 0;
    activeBank = 1 - activeBank;
    const bank = ruleBanks[activeBank];
    const segs = rules || [];
    ensureRules(bank, segs.length);
    bank.segs = segs;
    bank.target = segs.length ? 1 : 0;
    bank.o = 0;
    bank.draw = 0;
    bank.drawT0 = nowS() + (reduced ? 0 : 0.5);
    layoutRules(bank);
  }
  function layoutRules(bank) {
    const m4 = new THREE.Matrix4();
    bank.meshes.forEach((m, k) => {
      const seg = bank.segs[k];
      if (!seg) { m.visible = false; return; }
      const [a, b] = seg;
      const dir = V().subVectors(b, a);
      const len = dir.length();
      dir.normalize();
      const toCam = V().subVectors(basePos, a).normalize();
      const zAx = toCam.addScaledVector(dir, -toCam.dot(dir)).normalize();
      const yAx = V().crossVectors(zAx, dir).normalize();
      m.quaternion.setFromRotationMatrix(m4.makeBasis(dir, yAx, zAx));
      m.position.copy(a);
      m.userData.len = len;
      m.userData.thick = (2 * halfH(a.distanceTo(basePos))) / H; // one CSS pixel at that depth
      m.userData.alpha = seg[2] ?? 1;
    });
  }
  function refreshRules() {
    const bank = ruleBanks[activeBank];
    const segs = (targets && targets.rules) || [];
    ensureRules(bank, segs.length);
    bank.segs = segs;
    layoutRules(bank);
  }
  function setRing(r, animate) {
    if (!r) { ringState.target = 0; return; }
    const d = r.c.distanceTo(basePos);
    const tube = Math.max(0.0035, (0.62 * 2 * halfH(d)) / H); // ~1.2 CSS px wide
    const keyStr = `${r.R.toFixed(3)}|${tube.toFixed(5)}`;
    if (keyStr !== ringKey) {
      ring.geometry.dispose();
      ring.geometry = new THREE.TubeGeometry(new CircleCurve(), 240, tube / r.R, 4, true);
      ringKey = keyStr;
    }
    ring.position.copy(r.c);
    ring.quaternion.copy(r.q);
    ring.scale.setScalar(r.R);
    ringState.target = 1;
    if (animate) { ringState.o = 0; ringState.drawT0 = nowS() + (reduced ? 0 : 0.45); }
  }

  /* ---------------- transitions */

  function snapshot() {
    for (const o of objects) {
      o.from.p.copy(o.cur.p);
      o.from.q.copy(o.cur.q);
      o.from.s = o.cur.s;
      o.from.fade = o.cur.fade;
    }
    env.wallFrom = env.wall;
    env.floorsFrom = env.floors.map((f) => ({ ...f }));
    env.lightFrom.copy(env.light);
  }

  function finishTransition() {
    if (!trans) return;
    const t = trans;
    trans = null;
    clearTimeout(t.timer);
    env.wall = targets.wall ?? 1;
    env.floors = targets.floors.map((f) => ({ ...f }));
    env.light.copy(lightFor(targets));
    env.fadeExtra = 0;
    t.resolve();
  }

  // redraw: the same layout re-composed for a new frame (resize, chrome change): its rules and orbit
  // path are drawn afresh rather than snapped to the new size
  function startTransition(name, { duration = 1.6, ease = easeMove, stagger = 0.05, extra = 0, arc = 0.35, order = null, redraw = false } = {}) {
    if (trans) { const t = trans; trans = null; clearTimeout(t.timer); t.resolve(); }
    snapshot();
    const prevName = layoutName;
    layoutName = name;
    targets = buildTargets(name);
    if (name !== prevName || redraw) setRules(targets.rules);
    else refreshRules();
    setRing(targets.ring, prevName !== name || redraw);
    const n = objects.length;
    const delays = new Float32Array(n);
    let dur = Math.max(0.05, duration);
    let type = "move";
    if (reduced) {
      type = "fade";
      dur = 0.24;
    } else {
      const ord = order || objects.map((o) => o.i).sort((a, b) => targets.items[b].p.x - targets.items[a].p.x);
      const st = Math.min(stagger, (dur * 0.35) / Math.max(1, n - 1));
      ord.forEach((idx, k) => (delays[idx] = k * st));
    }
    const per = type === "fade" ? dur : dur - Math.max(...delays);
    return new Promise((resolve) => {
      trans = { t0: nowS(), dur, per, delays, ease, extra, arc, type, resolve };
      // a safety net so the promise settles even while rendering is paused (hidden tab, scrolled away)
      trans.timer = setTimeout(() => { if (trans && trans.resolve === resolve) finishTransition(); }, (dur + 0.4) * 1000);
      kick();
    });
  }

  /* ---------------- per frame */

  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
  const _v = V(), _e2 = new THREE.Euler();
  const Y = V(0, 1, 0);

  function liveTarget(o, T, t) {
    const L = o.live;
    const fa = reduced ? 0 : T.float;
    const ff = T.ff ?? o.ff;
    const ph = T.phase ?? o.phase;
    L.p.copy(T.p);
    if (fa) {
      L.p.y += Math.sin(t * ff + ph) * fa;
      L.p.x += Math.cos(t * ff * 0.63 + ph * 1.7) * fa * 0.35;
    }
    if (T.upright) {
      _q.setFromAxisAngle(Y, T.still ? 0 : o.angle);
      L.q.copy(T.q).premultiply(_q);
    } else {
      _q.setFromAxisAngle(o.axis, o.angle);
      L.q.copy(T.q).multiply(_q);
      const w = reduced ? 0 : T.wobble;
      if (w) {
        _q2.setFromEuler(_e2.set(Math.sin(t * 0.37 + ph) * w, 0, Math.sin(t * 0.29 + ph * 1.3) * w));
        L.q.premultiply(_q2);
      }
    }
    L.s = T.hidden ? 0 : T.s;
    L.fade = T.fade;
  }

  const lightNow = V();
  let lastLightKey = "";
  const scrollFrac = () => clamp((window.scrollY || 0) / (window.innerHeight || H), 0, 1.6);
  // portrait: the copy scrolls up over the models (they drift at a third of its speed), so they recede
  // toward the paper as it arrives. Reduced motion: no drift, but they still recede (a fade, not motion)
  const recedeFor = (v) => (portrait ? smooth(0.03, 0.4, v) * 0.6 : 0);
  let recede = 0;

  function update(dt, tNow) {
    if (!reduced) simTime += dt;
    const t = simTime;
    if (!reduced) {
      ptr.x = damp(ptr.x, ptr.tx, 2.4, dt);
      ptr.y = damp(ptr.y, ptr.ty, 2.4, dt);
      scr.drift = damp(scr.drift, scrollFrac(), 7, dt);
      scr.p = damp(scr.p, scr.tp, 5, dt);
      scr.v = damp(scr.v, scr.tv, 4, dt);
      scr.tv = damp(scr.tv, 0, 3, dt);
    } else {
      ptr.x = ptr.y = 0;
      scr.drift = scr.v = scr.p = 0;
    }
    recede = recedeFor(reduced ? scrollFrac() : scr.drift);

    if (!targets) targets = buildTargets(layoutName);
    if (targets.dynamic) {
      const keep = { rules: targets.rules };
      targets = buildTargets(layoutName);
      targets.rules = keep.rules;
    }

    // global (catchers, light, rules) progress
    let eg = 1;
    env.fadeExtra = 0;
    if (trans) {
      const k = clamp01((tNow - trans.t0) / trans.dur);
      if (trans.type === "fade") {
        env.fadeExtra = k < 0.45 ? easeFade(k / 0.45) : 1 - easeFade((k - 0.45) / 0.55);
        eg = k < 0.45 ? 0 : 1;
      } else eg = trans.ease(k);
      if (k >= 1) finishTransition();
    }
    const tl = lightFor(targets);
    if (trans) {
      // old catchers fade during the first half, new ones settle in the second; wall and floors
      // never overlap (see the floor note above)
      const outK = 1 - smooth(0, 0.42, eg), inK = smooth(0.52, 1, eg);
      const fromFloors = env.floorsFrom.some((f) => f.o > 0.01), toFloors = targets.floors.length > 0;
      const tw = targets.wall ?? 1;
      env.wall = toFloors ? env.wallFrom * outK : fromFloors ? tw * inK : lerp(env.wallFrom, tw, eg);
      env.floors = [];
      for (const f of env.floorsFrom) env.floors.push({ ...f, o: f.o * outK });
      for (const f of targets.floors) env.floors.push({ ...f, o: f.o * inK });
      lightNow.lerpVectors(env.lightFrom, tl, eg).normalize();
      env.light.copy(lightNow);
    } else {
      env.wall = targets.wall ?? 1;
      env.floors = targets.floors;
      env.light.copy(tl);
    }
    const lk = `${env.light.x.toFixed(4)},${env.light.y.toFixed(4)},${env.light.z.toFixed(4)}`;
    if (lk !== lastLightKey) {
      lastLightKey = lk;
      LDIR.copy(env.light);
      fitShadowCamera();
    }
    let floorPresence = 0;
    for (const f of env.floors) floorPresence = Math.max(floorPresence, f.o);

    const pe = reduced ? 0 : pulseEnv(tNow - pulseAt);
    const velAbs = Math.min(Math.abs(scr.v), 60);
    const towardCam = _v.copy(fwd).multiplyScalar(-1);
    const singleMode = layoutName === "single";
    let busy = !!trans || pe > 0.002;

    for (const o of objects) {
      const T = targets.items[o.i];
      if (!reduced) o.angle += dt * o.rate * T.spin * (1 + pe * 3 + velAbs * 0.03);
      liveTarget(o, T, t);
      const C = o.cur;
      if (trans) {
        if (trans.type === "fade") {
          const src = eg < 1 ? o.from : o.live;
          C.p.copy(src.p); C.q.copy(src.q); C.s = src.s; C.fade = src.fade;
        } else {
          const k = clamp01((tNow - trans.t0 - trans.delays[o.i]) / trans.per);
          const e = trans.ease(k);
          C.p.lerpVectors(o.from.p, o.live.p, e);
          if (trans.arc && o.from.s > 0.01 && o.live.s > 0.01) C.p.addScaledVector(towardCam, Math.sin(Math.PI * e) * trans.arc);
          if (trans.extra) {
            _q3.setFromAxisAngle(o.axis, -(1 - e) * trans.extra * (o.i % 2 ? 1 : -1));
            _q2.copy(o.live.q).multiply(_q3);
            C.q.slerpQuaternions(o.from.q, _q2, e);
          } else C.q.slerpQuaternions(o.from.q, o.live.q, e);
          C.s = lerp(o.from.s, o.live.s, e);
          C.fade = lerp(o.from.fade, o.live.fade, e);
        }
      } else {
        C.p.copy(o.live.p); C.q.copy(o.live.q); C.s = o.live.s; C.fade = o.live.fade;
      }

      // layered effects (never stored in cur)
      const m = o.mesh;
      m.position.copy(C.p);
      m.quaternion.copy(C.q);
      let s = C.s;
      let fade = C.fade + env.fadeExtra + recede;

      // loader appearance: scale in (expo-out), settle down, unwind a little. Reduced motion: appear
      // at once (the loader may be ink, so no fade through the paper colour)
      let ap = 0;
      if (o.appearAt !== null) ap = reduced ? (tNow >= o.appearAt ? 1 : 0) : clamp01((tNow - o.appearAt) / 0.95);
      if (ap < 1) busy = true;
      if (reduced) s *= ap;
      else {
        const ea = expoOut(ap);
        s *= ea;
        m.position.y += (1 - ea) * 0.5 * unit;
        _q.setFromAxisAngle(Y, (1 - ea) * -1.3);
        m.quaternion.premultiply(_q);
      }

      // focus: one model forward, the others recede toward the paper
      const ft = focusIndex === null || singleMode ? 0 : o.i === focusIndex ? 1 : -1;
      o.fx = reduced ? ft : damp(o.fx, ft, 4.5, dt);
      if (Math.abs(o.fx - ft) > 0.002) busy = true;
      if (o.fx > 0) {
        if (T.upright) {
          // grounded models are picked up off their shelf rather than flown at the camera
          s *= 1 + 0.1 * o.fx;
          m.position.y += 0.22 * C.s * o.fx;
          m.position.addScaledVector(towardCam, 0.3 * o.fx);
        } else {
          s *= 1 + 0.16 * o.fx;
          m.position.addScaledVector(towardCam, 1.1 * o.fx);
        }
      } else if (o.fx < 0) {
        s *= 1 + (T.upright ? 0.04 : 0.1) * o.fx;
        if (!T.upright) m.position.addScaledVector(towardCam, 1.0 * o.fx);
        fade += -o.fx * 0.38;
      }

      // pulse: a soft breath outward
      if (pe > 0) {
        s *= 1 + 0.05 * pe;
        m.position.addScaledVector(o.dir, 0.16 * pe * unit);
      }

      // pointer + scroll velocity: a small turn toward the cursor, a lean with fast scrolling
      if (!reduced && !T.upright) {
        _q.setFromEuler(_e2.set(-ptr.y * 0.1 + clamp(scr.v * 0.004, -0.22, 0.22), ptr.x * 0.16, 0));
        m.quaternion.premultiply(_q);
      }

      m.scale.setScalar(Math.max(s, 1e-4));
      fade = clamp01(fade);
      m.visible = s > 0.002 && fade < 0.995;
      o.mat.userData.fade.value = fade;
      // floating models far from the page cast fainter shadows (light wraps around them)
      const wallDist = m.position.z - WALL_Z;
      o.shadowFade.value = clamp01(fade * 1.2 + smooth(2.2, 6.4, wallDist) * 0.82 * (1 - floorPresence));
    }

    // catchers
    let anyFloor = false;
    floors.forEach((fm, k) => {
      const f = env.floors[k];
      if (!f || f.o <= 0.002) { fm.visible = false; return; }
      anyFloor = true;
      fm.visible = true;
      fm.position.set(f.x, f.y, f.z);
      fm.scale.set(f.w, f.d, 1);
      fm.material.opacity = FLOOR_OPACITY * f.o * (1 - env.fadeExtra) * (1 - recede);
    });
    wall.material.opacity = WALL_OPACITY * env.wall * (1 - env.fadeExtra) * (1 - recede);
    wall.visible = wall.material.opacity > 0.002 && !anyFloor;

    // hairline rules
    for (let b = 0; b < 2; b++) {
      const bank = ruleBanks[b];
      if (reduced) bank.o = bank.target * (b === activeBank ? 1 - env.fadeExtra : 0);
      else bank.o = damp(bank.o, bank.target, bank.target > bank.o ? 3 : 7, dt);
      if (Math.abs(bank.o - bank.target) > 0.003) busy = true;
      bank.draw = reduced ? 1 : clamp01((tNow - bank.drawT0) / 1.2);
      if (bank.draw < 1 && bank.target > 0) busy = true;
      bank.meshes.forEach((mm, k) => {
        if (!bank.segs[k] || bank.o < 0.003) { mm.visible = false; return; }
        const dk = easeMove(clamp01(bank.draw * 1.3 - k * 0.06));
        mm.visible = dk > 0.001;
        mm.scale.set(Math.max(1e-4, mm.userData.len * dk), mm.userData.thick, 1);
        mm.material.opacity = RULE_OPACITY * bank.o * mm.userData.alpha * (1 - recede);
      });
    }
    // orbit path
    ringState.o = reduced ? ringState.target * (1 - env.fadeExtra) : damp(ringState.o, ringState.target, ringState.target ? 3 : 8, dt);
    if (Math.abs(ringState.o - ringState.target) > 0.003) busy = true;
    if (ringState.o > 0.003 && ring.geometry.index) {
      ring.visible = true;
      ringMat.opacity = RULE_OPACITY * 0.9 * ringState.o * (1 - recede);
      const dk = reduced ? 1 : easeMove(clamp01((tNow - ringState.drawT0) / 1.6));
      if (dk < 1) busy = true;
      ring.geometry.setDrawRange(0, Math.floor((ring.geometry.index.count / 6) * dk) * 6);
      if (targets.ring) { ring.position.copy(targets.ring.c); }
    } else ring.visible = false;

    // camera: pointer parallax, scroll drift (models rise at ~30% of page speed), slight dolly
    const drift = scr.drift * halfH(DIST) * 2 * 0.3;
    const dolly = scr.p * 1.4;
    camera.position.copy(basePos)
      .addScaledVector(right, ptr.x * 0.45)
      .addScaledVector(up, ptr.y * 0.28)
      .addScaledVector(fwd, -dolly);
    camera.position.y -= drift;
    _v.set(0, -drift, 0);
    camera.lookAt(_v);
    return busy;
  }

  /* ---------------- loop */

  let raf = 0, last = 0, visible = true, lost = false, destroyed = false;
  let frames = 0, slowAcc = 0, slowN = 0, downgrades = 0;
  const shouldRun = () => visible && !document.hidden && !lost && !destroyed;

  function frame(ms) {
    raf = 0;
    if (!shouldRun()) return;
    const tNow = ms / 1000;
    const dt = last ? Math.min(Math.max(tNow - last, 0), 1 / 20) : 1 / 60;
    if (adaptive && last && !reduced) adapt(tNow - last);
    last = tNow;
    const busy = update(dt, nowS());
    renderer.render(scene, camera);
    // reduced motion renders on demand only; otherwise the loop runs while visible
    if (!reduced || busy) raf = requestAnimationFrame(frame);
  }
  // lower the pixel ratio (at most twice) if frames are consistently slow
  function adapt(ft) {
    frames++;
    if (frames < 90 || downgrades >= 2) return;
    slowAcc += ft; slowN++;
    if (slowN >= 90) {
      const avg = slowAcc / slowN;
      slowAcc = 0; slowN = 0;
      if (avg > 0.03 && dpr > 1) {
        dpr = Math.max(1, dpr - 0.35);
        downgrades++;
        renderer.setPixelRatio(dpr);
        renderer.setSize(W, H, false);
      }
    }
  }
  function kick() {
    if (raf || !shouldRun()) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  /* ---------------- events */

  let resizeTimer = 0;
  let lastVariant = "";
  function applySize() {
    computeView();
    renderer.setSize(W, H, false);
    fitWall();
    lastLightKey = "";
  }
  function settleResize() {
    if (destroyed) return;
    const variant = variantKey();
    if (lastVariant && variant !== lastVariant && introDone && !reduced) {
      lastVariant = variant;
      startTransition(layoutName, { duration: 1.1, redraw: true });
    } else {
      lastVariant = variant;
      targets = buildTargets(layoutName);
      refreshRules();
      setRing(targets.ring, false);
    }
    kick();
  }
  const onResize = () => {
    if (destroyed) return;
    clearTimeout(resizeTimer);
    // follow the viewport immediately (the composition stays locked to the screen), then settle
    applySize();
    if (variantKey() === lastVariant) {
      targets = buildTargets(layoutName);
      refreshRules();
      setRing(targets.ring, false);
    }
    kick();
    resizeTimer = setTimeout(settleResize, 180);
  };
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null;
  if (ro) {
    ro.observe(canvas);
    if (chromeProbe) ro.observe(chromeProbe);
  }
  window.addEventListener("resize", onResize, { passive: true });

  const onPointer = (e) => {
    if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    ptr.tx = clamp((e.clientX / (window.innerWidth || W)) * 2 - 1, -1, 1);
    ptr.ty = clamp(-((e.clientY / (window.innerHeight || H)) * 2 - 1), -1, 1);
  };
  const onLeave = () => { ptr.tx = 0; ptr.ty = 0; };
  window.addEventListener("pointermove", onPointer, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave, { passive: true });
  window.addEventListener("blur", onLeave);
  const onVis = () => { if (!document.hidden) kick(); };
  document.addEventListener("visibilitychange", onVis);
  const onLost = (e) => { e.preventDefault(); lost = true; if (raf) cancelAnimationFrame(raf); raf = 0; };
  const onRestored = () => {
    // three.js re-initialises its GL state; GPU objects made before the loss are dead, so they are
    // dropped (not disposed, which would delete handles from the old context) and rebuilt
    lost = false;
    envRT = null;
    key.shadow.map = null;
    key.shadow.mapPass = null;
    try {
      pmrem = new THREE.PMREMGenerator(renderer);
      makeEnv();
    } catch { /* render without the environment */ }
    lastLightKey = "";
    kick();
  };
  canvas.addEventListener("webglcontextlost", onLost, false);
  canvas.addEventListener("webglcontextrestored", onRestored, false);

  let mq = null;
  const onMq = (e) => api.setReducedMotion(e.matches);
  if (window.matchMedia) {
    mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.addEventListener) mq.addEventListener("change", onMq);
  }

  /* ---------------- boot */

  applySize();
  lastVariant = variantKey();
  targets = buildTargets("loader");
  env.wall = targets.wall;
  env.floors = targets.floors;
  env.light.copy(lightFor(targets));
  LDIR.copy(env.light);
  fitShadowCamera();
  for (const o of objects) {
    liveTarget(o, targets.items[o.i], 0);
    o.cur.p.copy(o.live.p); o.cur.q.copy(o.live.q); o.cur.s = o.live.s; o.cur.fade = o.live.fade;
  }
  // compile every program before the first visible frame (no hitch when the loader starts)
  for (const o of objects) o.mesh.visible = true;
  for (const f of floors) f.visible = true;
  try {
    if (renderer.compileAsync && renderer.extensions.has("KHR_parallel_shader_compile")) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
  } catch { /* compile lazily instead */ }
  for (const o of objects) o.mesh.visible = false;
  for (const f of floors) f.visible = false;
  report(0.95);

  const appearOrder = () => [1, 3, 2, 4, 6, 7, 5, 0].filter((i) => i < count);
  function appearUpTo(n, tNow) {
    const ord = appearOrder();
    for (let k = 0; k < Math.min(n, ord.length); k++) {
      const o = objects[ord[k]];
      if (o.appearAt === null) {
        lastAppear = Math.max(tNow, lastAppear + (reduced ? 0.05 : 0.11));
        o.appearAt = lastAppear;
      }
    }
  }
  function appearAll(gap = 0.06) {
    const t0 = nowS();
    let k = 0;
    for (const i of appearOrder()) {
      const o = objects[i];
      if (o.appearAt === null) o.appearAt = t0 + k++ * gap;
    }
    for (const o of objects) if (o.appearAt === null) o.appearAt = t0;
  }

  const resolveName = (name) => (LAYOUTS.includes(name) ? name : "hero");

  const api = {
    supported: true,
    get count() { return count; },
    get layout() { return pendingLayout && !introDone ? pendingLayout : layoutName; },
    layouts: LAYOUTS.slice(),
    names: specs.map((s) => s.key),
    fallbackUrl: FALLBACK_URL,

    setLoadProgress(p) {
      if (destroyed || introDone) return;
      anyProgress = true;
      loadP = Math.max(loadP, clamp01(+p || 0));
      const n = appearOrder().length;
      appearUpTo(loadP >= 1 ? n : Math.min(Math.floor(loadP * (n + 1) + 1e-6), n), nowS());
      kick();
    },

    intro(name) {
      if (destroyed) return Promise.resolve();
      clearTimeout(autoIntroTimer);
      const target = resolveName(name || pendingLayout || (layoutName !== "loader" ? layoutName : "hero"));
      pendingLayout = null;
      if (introDone) return api.setLayout(target);
      introDone = true;
      appearAll(0.05);
      return startTransition(target, { duration: 1.45, ease: easeIntro, stagger: 0.055, extra: 1.5, arc: 0.7, order: appearOrder().reverse() });
    },

    setLayout(name, { duration = 1.6 } = {}) {
      if (destroyed) return Promise.resolve();
      const target = resolveName(name);
      if (!introDone) {
        if (!anyProgress) return api.intro(target); // the shell skipped the loader
        pendingLayout = target;
        clearTimeout(autoIntroTimer);
        autoIntroTimer = setTimeout(() => { if (!introDone) api.intro(); }, 7000);
        return Promise.resolve();
      }
      if (target === layoutName && !trans) {
        api.pulse();
        return Promise.resolve();
      }
      // focus belongs to the view that set it: a view that sets focus while mounting (just before the
      // shell calls setLayout) keeps it; otherwise a route change clears it
      if (target !== layoutName && focusIndex !== null && nowS() - focusSetAt > 0.6) focusIndex = null;
      appearAll(0.04);
      const away = target === "away";
      return startTransition(target, { duration: away ? Math.max(duration, 2.4) : duration, ease: away ? easeDrift : easeMove, arc: away ? 0 : 0.35 });
    },

    setScroll(progress, velocity) {
      scr.tp = clamp01(+progress || 0);
      scr.tv = clamp(+velocity || 0, -80, 80);
      if (!reduced) kick();
      else if (Math.abs(recedeFor(scrollFrac()) - recede) > 0.02) kick(); // renders on demand

    },

    setVisible(v) {
      visible = !!v;
      if (visible) kick();
      else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    },

    pulse() {
      if (reduced || destroyed) return;
      pulseAt = nowS();
      kick();
    },

    focus(index) {
      if (destroyed) return;
      let next = null;
      if (index !== null && index !== undefined && Number.isFinite(+index)) next = ((Math.trunc(+index) % count) + count) % count;
      focusSetAt = nowS();
      if (next === focusIndex) return;
      focusIndex = next;
      if (layoutName === "single" && introDone) startTransition("single", { duration: 1.15, arc: 0.5 });
      else kick();
    },

    resize() { onResize(); },

    setReducedMotion(v) {
      reduced = !!v;
      kick();
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(resizeTimer);
      clearTimeout(autoIntroTimer);
      if (trans) { clearTimeout(trans.timer); trans.resolve(); trans = null; }
      if (ro) ro.disconnect();
      if (chromeProbe) chromeProbe.remove();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      if (mq && mq.removeEventListener) mq.removeEventListener("change", onMq);
      for (const o of objects) {
        o.mesh.geometry.dispose();
        o.mat.dispose();
        o.mesh.customDepthMaterial.dispose();
      }
      for (const bank of ruleBanks) for (const m of bank.meshes) m.material.dispose();
      ruleGeo.dispose();
      ring.geometry.dispose();
      ringMat.dispose();
      wall.geometry.dispose();
      wall.material.dispose();
      floorGeo.dispose();
      for (const f of floors) f.material.dispose();
      if (grain) grain.dispose();
      if (envRT) envRT.dispose();
      pmrem.dispose();
      if (key.shadow.map) key.shadow.map.dispose();
      if (key.shadow.mapPass) key.shadow.mapPass.dispose();
      scene.clear();
      renderer.renderLists.dispose();
      renderer.dispose();
    },
  };

  if (debug) api._debug = { THREE, scene, renderer, camera, key, keyLight, bounce, wall, floors, objects, kick, get targets() { return targets; } };
  kick();
  report(1);
  return api;
}

export default createScene;
