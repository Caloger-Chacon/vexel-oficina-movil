// VEXEL · Oficina v2 â€” planta cortada (canvas 2D). Solo lectura.
// Reconstrucción según la referencia: planta de oficina en corte, muebles, personajes
// sentados en su puesto, etiquetas flotantes, dock inferior y cámara que baja al puesto.
import { loadState, relativeTime, STATUS_LABEL } from './data.js';

const MAUS_CHAT_URL = ''; // pendiente del dueño (esquema del enlace al chat)
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d', { alpha: false });
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const ISO = 42 * D2R;          // inclinación de la vista
const YAW = 45 * D2R;

// ---------- mundo ----------
const PLAN = { w: 880, d: 620 };
const WALL_H = 150;
const GLASS_H = 104;

const AGENTS = ['ciro', 'marketing-lead', 'design-lead', 'mentor-lead', 'commercial-lead',
  'ops-lead', 'billing-admin', 'finance-lead', 'legal-lead', 'people-lead'];

// puestos: x, y del escritorio; el personaje se sienta detrás (y - 38)
const DESKS = {
  ciro: { x: -320, y: -200, office: true },
  'marketing-lead': { x: -300, y: 10 },
  'design-lead': { x: -60, y: 10 },
  'mentor-lead': { x: 180, y: 10 },
  'commercial-lead': { x: 300, y: 275 },
  'ops-lead': { x: 265, y: -190 },
  'billing-admin': { x: 390, y: -190 },
  'finance-lead': { x: -300, y: 170 },
  'legal-lead': { x: -60, y: 170 },
  'people-lead': { x: 180, y: 170 },
};

const state = { data: null, agents: [], source: 'loading', draws: 0 };
const cam = { yaw: YAW, tilt: ISO, zoom: 1, px: 0, py: 0, scale: 0.4 };
const TOP_INSET = 74;          // alto de la cabecera
const DOCK_INSET = 116;        // dock inferior + aire
const OCC = 0.58;              // alto de la planta / alto útil (cabecera â†’ dock)
let layout = { minX: 0, maxX: 0, minY: 0, maxY: 0, occ: 0, px0: 0 };
const usableHeight = () => Math.max(260, H - DOCK_INSET - TOP_INSET);
let baseScale = 0.4, W = 0, H = 0, DPR = 1, originY = 0;
let anim = 0;

const view = { selected: null, now: false, plan: false };
const hits = [];

// ---------- utilidades ----------
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const px = (n) => Math.round(n * 2) / 2;

function hex2rgb(h) {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(hex, f, a = 1) {
  const [r, g, b] = hex2rgb(hex);
  const m = (v) => clamp(Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)), 0, 255);
  return `rgba(${m(r)},${m(g)},${m(b)},${a})`;
}
function rgba(hex, a) { const [r, g, b] = hex2rgb(hex); return `rgba(${r},${g},${b},${a})`; }

// ---------- proyección ----------
function p1(x, y, z) {
  const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
  return {
    x: x * c - y * s,
    y: (x * s + y * c) * Math.sin(cam.tilt) - z * Math.cos(cam.tilt),
  };
}
function P(x, y, z = 0) {
  const q = p1(x, y, z);
  return { x: W / 2 + cam.px + layout.px0 + q.x * cam.scale, y: originY + cam.py + q.y * cam.scale };
}
function poly(pts, fill, stroke, lw = 1) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

// caja isométrica: cara superior + dos caras laterales visibles
function box(x, y, z, w, d, h, color, opt = {}) {
  const x0 = x - w / 2, x1 = x + w / 2, y0 = y - d / 2, y1 = y + d / 2, z1 = z + h;
  const top = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)];
  const sx = [P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z), P(x1, y0, z)];
  const sy = [P(x1, y1, z1), P(x0, y1, z1), P(x0, y1, z), P(x1, y1, z)];
  poly(sx, shade(color, -0.28), opt.line || null, 1);
  poly(sy, shade(color, -0.46), opt.line || null, 1);
  poly(top, shade(color, 0.16), opt.line || null, 1);
  if (opt.glow) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(opt.glow, 0.22);
    poly(top, rgba(opt.glow, 0.22));
    ctx.restore();
  }
}

// caja con la cara superior "de cristal"
function glass(x, y, z, w, d, h, tint = '#a9d4ff') {
  const x0 = x - w / 2, x1 = x + w / 2, y0 = y - d / 2, y1 = y + d / 2, z1 = z + h;
  const longX = w > d;              // el panel corre en X o en Y
  const L = longX ? w : d;
  const l0 = longX ? x0 : y0, l1 = longX ? x1 : y1;
  // paños: la cara que mira al espectador pesa más que la de canto
  poly([P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z), P(x1, y0, z)], rgba(tint, 0.12));
  poly([P(x1, y1, z1), P(x0, y1, z1), P(x0, y1, z), P(x1, y1, z)], rgba(tint, 0.18));
  poly([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], rgba(tint, 0.08));
  // reflejo: franja inclinada en la cara frontal
  const r0 = l0 + L * 0.30, r1 = l0 + L * 0.42;
  poly([P(longX ? r0 : x1, longX ? y1 : r0, z + 2), P(longX ? r1 : x1, longX ? y1 : r1, z + 2),
    P(longX ? r1 + L * 0.08 : x1, longX ? y1 : r1 + L * 0.08, z1 - 2),
    P(longX ? r0 + L * 0.08 : x1, longX ? y1 : r0 + L * 0.08, z1 - 2)], 'rgba(255,255,255,.05)');
  // rieles y montantes
  const rail = (zz, a) => {
    const p0 = longX ? P(l0, y1, zz) : P(x1, l0, zz);
    const p1 = longX ? P(l1, y1, zz) : P(x1, l1, zz);
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
    ctx.strokeStyle = rgba('#d9ecff', a); ctx.lineWidth = zz === z1 ? 2 : 1.5; ctx.stroke();
  };
  rail(z1, 0.55); rail(z, 0.30);
  const n = Math.max(2, Math.round(L / 62));
  ctx.strokeStyle = rgba('#b7d8ff', 0.28); ctx.lineWidth = 1;
  for (let i = 1; i < n; i++) {
    const t = l0 + (L * i) / n;
    const a = longX ? P(t, y1, z) : P(x1, t, z);
    const b = longX ? P(t, y1, z1) : P(x1, t, z1);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  // sombra de contacto del panel en el suelo
  ctx.strokeStyle = 'rgba(4,7,12,.45)'; ctx.lineWidth = 3;
  const s0 = longX ? P(l0, y1 + 4, 0) : P(x1 + 4, l0, 0);
  const s1 = longX ? P(l1, y1 + 4, 0) : P(x1 + 4, l1, 0);
  ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.stroke();
}

// ---------- partes de la oficina ----------
function floorTiles() {
  // plataforma
  const x0 = -PLAN.w / 2, x1 = PLAN.w / 2, y0 = -PLAN.d / 2, y1 = PLAN.d / 2;
  poly([P(x0, y0, -14), P(x1, y0, -14), P(x1, y1, -14), P(x0, y1, -14)], '#070a10');
  poly([P(x0, y0, 0), P(x1, y0, 0), P(x1, y1, 0), P(x0, y1, 0)], '#18202d', 'rgba(140,180,240,.20)', 1);

  // losetas 60x60
  ctx.save();
  poly([P(x0, y0, 0), P(x1, y0, 0), P(x1, y1, 0), P(x0, y1, 0)], '#18202d');
  ctx.clip();
  for (let x = x0; x < x1; x += 60) {
    for (let y = y0; y < y1; y += 60) {
      const alt = ((x / 60 + y / 60) % 2 === 0);
      poly([P(x, y, 0), P(x + 60, y, 0), P(x + 60, y + 60, 0), P(x, y + 60, 0)],
        alt ? '#202b3c' : '#18202d');
    }
  }
  // junta: una línea por eje, no una por loseta
  ctx.strokeStyle = 'rgba(4,7,12,.55)'; ctx.lineWidth = 1;
  for (let x = x0; x <= x1; x += 60) { const a = P(x, y0, 0), b = P(x, y1, 0); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  for (let y = y0; y <= y1; y += 60) { const a = P(x0, y, 0), b = P(x1, y, 0); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  // salas de cristal: el suelo interior sube de valor
  ctx.fillStyle = 'rgba(52,66,86,.42)';
  poly([P(-440, -310, 0), P(-190, -310, 0), P(-190, -95, 0), P(-440, -95, 0)], 'rgba(54,68,88,.42)');
  poly([P(205, -310, 0), P(455, -310, 0), P(455, -95, 0), P(205, -95, 0)], 'rgba(40,54,66,.45)');
  // sombra de apoyo de los muros
  poly([P(x0, y0, 0), P(x1, y0, 0), P(x1, y0 + 14, 0), P(x0, y0 + 14, 0)], 'rgba(5,8,13,.4)');
  poly([P(x0, y0, 0), P(x0 + 14, y0, 0), P(x0 + 14, y1, 0), P(x0, y1, 0)], 'rgba(5,8,13,.4)');
  ctx.restore();
  // brillo
  const c = P(0, 0, 0);
  const g = ctx.createRadialGradient(c.x, c.y, 20, c.x, c.y, PLAN.w * 0.55 * cam.scale);
  g.addColorStop(0, 'rgba(150,195,255,.09)');
  g.addColorStop(0.5, 'rgba(90,140,220,.03)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.save();
  poly([P(x0, y0, 0), P(x1, y0, 0), P(x1, y1, 0), P(x0, y1, 0)], g);
  ctx.restore();
}

function rug(x, y, w, d, color, alpha = 0.5) {
  poly([P(x - w / 2, y - d / 2, 1), P(x + w / 2, y - d / 2, 1), P(x + w / 2, y + d / 2, 1), P(x - w / 2, y + d / 2, 1)],
    rgba(color, alpha), rgba(color, 0.7), 1);
}

function wallSegment(x, y, len, vertical, h, kind = 'solid') {
  // vertical: el muro corre en Y; si no, en X
  const w = vertical ? 12 : len, d = vertical ? len : 12;
  if (kind === 'glass') {
    glass(x, y, 0, w, d, h);
    // postes
    box(x, y, 0, w, 6, h, '#243244');
    return;
  }
  box(x, y, 0, w, d, h, '#212c3d', { line: 'rgba(6,9,14,.55)' });
  // sombra bajo el remate
  box(x, y, h - 20, w + 1, d + 1, 11, '#0d141e');
  // remate claro: la línea más brillante de la escena
  box(x, y, h - 8, w, d, 8, '#a3b9d6');
  // zócalo
  box(x, y, 0, w + 2, d + 2, 7, '#0b1119');
}

function doorGap(x, y, vertical, h) {
  // vano: dos jambas cortas, sin puerta
  if (vertical) {
    box(x, y - 46, 0, 12, 10, h, '#243244');
    box(x, y + 46, 0, 12, 10, h, '#243244');
  } else {
    box(x - 46, y, 0, 10, 12, h, '#243244');
    box(x + 46, y, 0, 10, 12, h, '#243244');
  }
}

// ---------- muebles ----------
function plant(x, y, s = 1) {
  box(x, y, 0, 22 * s, 22 * s, 20 * s, '#2a3546');
  box(x, y, 20 * s, 4 * s, 4 * s, 18 * s, '#2f4a3a');
  box(x - 9 * s, y + 2, 34 * s, 20 * s, 12 * s, 12 * s, '#2f6b4a');
  box(x + 8 * s, y - 3, 38 * s, 16 * s, 10 * s, 10 * s, '#3c855c');
  box(x, y + 4, 44 * s, 12 * s, 8 * s, 8 * s, '#57a874');
}

function shelf(x, y, w = 90) {
  box(x, y, 0, w, 22, 96, '#1b2534');
  for (let i = 0; i < 4; i++) {
    box(x - w / 2 + 12 + i * 20, y - 2, 18 + (i % 2) * 34, 12, 14, 26,
      ['#3b82f6', '#eab308', '#ef4444', '#22c55e'][i % 4]);
  }
}

function coffeeCorner(x, y) {
  box(x, y, 0, 130, 34, 46, '#1b2534');
  box(x - 34, y, 46, 26, 22, 30, '#39485c');   // cafetera
  box(x - 34, y + 2, 60, 20, 10, 5, '#6b7f99');
  box(x + 30, y, 46, 14, 14, 10, '#2b3a4f');   // tazas
  plant(x + 84, y - 4, 0.8);
}

function reception(x, y) {
  box(x, y, 0, 160, 32, 46, '#1b2534');
  box(x, y - 2, 46, 160, 24, 5, '#2e3d52');
  box(x + 54, y - 6, 51, 18, 10, 6, '#eab308');
  plant(x + 94, y - 16, 0.7);
}

function sofa(x, y) {
  box(x, y, 0, 104, 38, 16, '#22303f');
  box(x, y - 14, 16, 104, 12, 22, '#2b3a4f');
  box(x - 46, y, 16, 12, 38, 14, '#2b3a4f');
  box(x + 46, y, 16, 12, 38, 14, '#2b3a4f');
}

function armchair(x, y) {
  shadow(x, y, 44, 38, 0.34);
  box(x, y + 4, 0, 58, 50, 22, '#2c3a4b');
  box(x, y + 2, 22, 44, 34, 5, '#37475c');
  box(x, y - 20, 0, 58, 12, 42, '#334355');
  box(x - 23, y + 2, 22, 11, 48, 12, '#2b3a4f');
  box(x + 23, y + 2, 22, 11, 48, 12, '#2b3a4f');
}

function lowTable(x, y, w = 74, d = 46) {
  box(x, y, 26, w, d, 5, '#2c3849');
  box(x - w / 2 + 6, y - d / 2 + 5, 0, 6, 6, 26, '#1b2534');
  box(x + w / 2 - 6, y - d / 2 + 5, 0, 6, 6, 26, '#1b2534');
  box(x - w / 2 + 6, y + d / 2 - 5, 0, 6, 6, 26, '#1b2534');
  box(x + w / 2 - 6, y + d / 2 - 5, 0, 6, 6, 26, '#1b2534');
  box(x - 12, y, 31, 18, 14, 3, '#c9d6e8');
  box(x + 14, y + 4, 31, 9, 9, 7, '#e8d5bd');
}

function tallTable(x, y) {
  box(x, y, 48, 96, 54, 5, '#33414f');
  box(x, y, 0, 8, 8, 48, '#1b2534');
  box(x, y, 0, 44, 6, 3, '#1b2534');
  box(x - 44, y - 34, 0, 22, 22, 4, '#243244');
  box(x - 44, y - 34, 0, 22, 7, 44, '#1f2a3a');
  box(x + 40, y + 30, 0, 22, 22, 4, '#243244');
  box(x + 40, y + 30, 0, 22, 7, 44, '#1f2a3a');
}

function whiteboard(x, y, w = 220, h = 84, z = 62) {
  box(x, y, z, w, 5, h, '#c6d2e2');
  box(x, y - 1, z + h, w + 6, 9, 5, '#a3b9d6');
  box(x - w * 0.22, y - 3, z + h * 0.55, w * 0.3, 2, 4, '#22d3ee');
  box(x + w * 0.12, y - 3, z + h * 0.28, w * 0.24, 2, 4, '#8b98ab');
}

function poster(x, y, c) {
  box(x, y, 74, 4, 54, 46, '#121a26');
  box(x, y, 78, 4, 40, 16, c);
}

function printer(x, y) {
  box(x, y, 0, 84, 54, 52, '#2a3546');
  box(x, y - 4, 52, 74, 34, 5, '#37475c');
  box(x, y + 6, 30, 62, 8, 22, '#1a2331');
  box(x + 20, y - 16, 57, 26, 18, 3, '#d7e3f5');
}

function bin(x, y) {
  box(x, y, 0, 17, 17, 20, '#1a2331');
  box(x, y, 20, 18, 18, 2, '#2b3a4f');
}

function stack(x, y, z, c = '#39485c') {
  box(x, y, z, 20, 15, 6, c);
  box(x + 1, y - 1, z + 6, 18, 14, 4, '#d7e3f5');
}

function pouf(x, y) {
  box(x, y, 0, 32, 32, 19, '#2b3849');
  box(x, y, 19, 30, 30, 4, '#3a4a5e');
}

function floorLamp(x, y) {
  box(x, y, 0, 16, 16, 3, '#1b2534');
  box(x, y, 3, 3, 3, 96, '#243244');
  box(x, y, 99, 26, 26, 10, '#e8d9b0');
  const p = P(x, y, 99);
  const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 44 * cam.scale);
  g.addColorStop(0, 'rgba(255,226,160,.55)');
  g.addColorStop(1, 'rgba(255,205,120,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(p.x, p.y, 44 * cam.scale, 0, TAU); ctx.fill();
  ctx.restore();
}

function shadow(x, y, rx, ry, a = 0.45) {
  const c = P(x, y, 1);
  const g = ctx.createRadialGradient(c.x, c.y, 1, c.x, c.y, Math.max(rx, ry) * cam.scale);
  g.addColorStop(0, `rgba(0,0,0,${a})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(1, 0.5);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(rx, ry) * cam.scale, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function desk(x, y, color, o = {}) {
  const w = o.w || 128, d = 62, h = 40;
  shadow(x, y + 8, 96, 60, 0.42);
  // patas
  box(x - w / 2 + 8, y - d / 2 + 6, 0, 7, 7, h, '#1a2331');
  box(x + w / 2 - 8, y - d / 2 + 6, 0, 7, 7, h, '#1a2331');
  box(x - w / 2 + 8, y + d / 2 - 6, 0, 7, 7, h, '#1a2331');
  box(x + w / 2 - 8, y + d / 2 - 6, 0, 7, 7, h, '#1a2331');
  // tablero
  box(x, y, h, w, d, 7, color);
  // monitor (pantalla encendida)
  box(x + 24, y - 8, h + 7, 34, 14, 3, '#0c1420');
  box(x + 24, y - 12, h + 10, 34, 4, 22, '#0b111b');
  const scr = [P(x + 10, y - 14, h + 29), P(x + 38, y - 14, h + 29), P(x + 38, y - 14, h + 12), P(x + 10, y - 14, h + 12)];
  poly(scr, rgba(o.glow || '#22d3ee', 0.7));
  poly(scr, null, rgba(o.glow || '#22d3ee', 0.35), 1);
  // luz de pantalla derramada sobre la mesa y el personaje
  const sc = P(x + 24, y + 4, h + 24);
  const sg = ctx.createRadialGradient(sc.x, sc.y, 1, sc.x, sc.y, 56 * cam.scale);
  sg.addColorStop(0, rgba(o.glow || '#22d3ee', 0.15));
  sg.addColorStop(0.5, rgba(o.glow || '#22d3ee', 0.05));
  sg.addColorStop(1, rgba(o.glow || '#22d3ee', 0));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.arc(sc.x, sc.y, 56 * cam.scale, 0, TAU); ctx.fill();
  ctx.restore();
  // teclado y ratón
  box(x - 22, y + 12, h + 7, 44, 14, 3, '#243244');
  box(x + 6, y + 14, h + 7, 8, 10, 3, '#243244');
  // papeles y taza
  box(x - 44, y - 2, h + 7, 14, 18, 2, '#d7e3f5');
  box(x + 46, y + 16, h + 7, 9, 9, 8, '#e8d5bd');
  if (o.extra) o.extra(x, y, h + 7);
}

function chair(x, y) {
  box(x, y - 18, 0, 28, 6, 34, '#1c2735');
  box(x, y + 6, 16, 32, 26, 6, '#202c3d');
  box(x, y + 12, 18, 6, 6, 16, '#243244');
}

function person(x, y, color, o = {}) {
  const z = 22;               // altura del asiento
  const bob = reduce ? 0 : Math.sin(anim * 1.6 + (o.phase || 0)) * 0.8;
  const typing = o.status === 'working' || o.status === 'walking';
  const t = reduce ? 0 : Math.sin(anim * 9 + (o.phase || 0)) * 1.8;
  box(x, y + 7, 0, 32, 24, 22, '#1a2331');
  const bodyY = y + 2 + bob * 0.4;
  box(x, bodyY, z, 36, 26, 34 + bob, color);
  box(x - 23, bodyY + 7, z + 6 + (typing ? t : 0), 26, 10, 11, color);
  box(x + 23, bodyY + 7, z + 6 - (typing ? t : 0), 26, 10, 11, color);
  const hz = z + 36 + bob;
  box(x, bodyY, hz, 32, 26, 32, '#e8c9a8');
  box(x, bodyY + 1, hz + 30, 33, 27, 6, o.hair || '#171c26');
  box(x, bodyY - 10, hz + 16, 33, 5, 18, o.hair || '#171c26');
  const e1 = P(x - 7.5, bodyY + 14, hz + 17), e2 = P(x + 7.5, bodyY + 14, hz + 17);
  const r = Math.max(1, 1.4 * cam.scale * 2);
  ctx.fillStyle = 'rgba(24,28,36,.9)';
  ctx.beginPath(); ctx.arc(e1.x, e1.y, r, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(e2.x, e2.y, r, 0, TAU); ctx.fill();
  return { x, y: bodyY, z: hz + 38 + bob };
}

function lamp(x, y) {
  const p = P(x, y, 210);
  ctx.save();
  ctx.strokeStyle = 'rgba(160,190,230,.35)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(p.x, p.y - 34); ctx.lineTo(p.x, p.y); ctx.stroke();
  const g = ctx.createRadialGradient(p.x, p.y + 3, 1, p.x, p.y + 3, 30 * cam.scale);
  g.addColorStop(0, 'rgba(255,226,160,.9)');
  g.addColorStop(0.4, 'rgba(255,205,120,.25)');
  g.addColorStop(1, 'rgba(255,205,120,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(p.x, p.y + 3, 30 * cam.scale, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff4d0';
  ctx.beginPath(); ctx.arc(p.x, p.y + 3, 2, 0, TAU); ctx.fill();
  ctx.restore();
}

// ---------- carga de estado ----------
const ui = {
  sheet: document.getElementById('sheet'),
  dock: document.getElementById('dock'),
  back: document.getElementById('back'),
  summary: document.getElementById('summary'),
  live: document.getElementById('live'),
  liveLabel: document.getElementById('liveLabel'),
  offline: document.getElementById('offline'),
  offlineAt: document.getElementById('offlineAt'),
  toast: document.getElementById('toast'),
  hint: document.getElementById('hint'),
  a11y: document.getElementById('a11y'),
  sheetName: document.getElementById('sheetName'),
  sheetRole: document.getElementById('sheetRole'),
  sheetState: document.getElementById('sheetState'),
  sheetInbox: document.getElementById('sheetInbox'),
  sheetTask: document.getElementById('sheetTask'),
  sheetDelivery: document.getElementById('sheetDelivery'),
  sheetActivity: document.getElementById('sheetActivity'),
  sheetAvatar: document.getElementById('sheetAvatar'),
  sheetChat: document.getElementById('sheetChat'),
  loadBar: document.getElementById('loadBar'),
  loadLabel: document.getElementById('loadLabel'),
};

const SOURCE_LABEL = { live: 'en vivo', stale: 'guardado', snapshot: 'guardado', demo: 'demo', loading: '…' };

async function boot() {
  resize();
  try { await refresh(); } catch (e) { ui.liveLabel.textContent = 'sin datos'; }
  if (!reduce) {
    cam.tilt = 20 * D2R; cam.zoom = 1.9; cam.scale = baseScale * cam.zoom;
    tween = { from: { ...cam }, to: { ...cam, tilt: ISO, zoom: 1, px: 0, py: 0 }, t0: performance.now(), ms: 1500 };
  }
  requestAnimationFrame(frame);
  setInterval(() => refresh().catch(() => {}), 20000);
  setInterval(() => { if (!ui.offline.hidden) ui.offlineAt.textContent = relativeTime(state.data?.fetchedAt); }, 1000);
  setTimeout(() => ui.hint.classList.add('gone'), 7000);
}

async function refresh() {
  const data = await loadState();
  const first = !state.data;
  state.data = data;
  state.source = data.source;
  state.agents = AGENTS.map((id) => data.agents.find((a) => a.id === id)).filter(Boolean)
    .concat(data.agents.filter((a) => !AGENTS.includes(a.id)));
  paintChrome();
  buildDock();
  buildA11y();
  if (first) resize();
  if (view.selected) fillSheet(view.selected);
  ui.offline.hidden = state.source === 'live';
  if (!ui.offline.hidden) {
    ui.offline.firstChild.textContent = state.source === 'demo' ? 'Modo demo · datos de diseño ' : 'Estado guardado ';
    ui.offlineAt.textContent = relativeTime(state.data?.fetchedAt);
  }
  render();
}

function paintChrome() {
  const working = state.agents.filter((a) => ['working', 'walking'].includes(a.status)).length;
  const waiting = state.agents.filter((a) => a.status === 'waiting').length;
  const risk = state.agents.filter((a) => a.status === 'attention').length;
  const bits = [];
  if (working) bits.push(`${working} activos`);
  if (waiting) bits.push(`${waiting} espera`);
  if (risk) bits.push(`${risk} aviso`);
  ui.summary.textContent = bits.length ? bits.join(' · ') : 'todo en calma';
  const strip = document.getElementById('strip');
  if (strip) strip.textContent = `${state.agents.length} puestos · ${bits.length ? bits.join(' · ') : 'todo en calma'} · ${relativeTime(state.data?.fetchedAt)}`;
  ui.live.dataset.source = state.source;
  ui.liveLabel.textContent = SOURCE_LABEL[state.source] || 'â€”';
}

const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function buildDock() {
  const frag = document.createDocumentFragment();
  for (const a of state.agents) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dock-item' + (view.selected === a ? ' sel' : '') + (view.now && !['working', 'walking', 'waiting', 'attention'].includes(a.status) ? ' dim' : '');
    b.dataset.id = a.id;
    b.setAttribute('aria-label', `${a.name}, ${a.mood.label}`);
    b.innerHTML = `<span class="dock-ava" style="background:linear-gradient(150deg,${a.color},${rgba(a.color, .45)});--dot:${a.mood.color}">${initials(a.name)}</span><span class="dock-name">${DOCK_NAME[a.id] || a.name}</span>`;
    b.addEventListener('click', () => selectAgent(a));
    frag.append(b);
  }
  ui.dock.replaceChildren(frag);
}

function buildA11y() {
  const frag = document.createDocumentFragment();
  for (const a of state.agents) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${a.name}, ${a.area}, ${a.mood.label}${a.inbox ? ', ' + a.inbox + ' mensajes' : ''}`;
    b.addEventListener('click', () => selectAgent(a));
    frag.append(b);
  }
  ui.a11y.replaceChildren(frag);
}

// ---------- ficha ----------
let cameraBefore = null;
function selectAgent(a) {
  if (!a) return;
  if (!view.selected) cameraBefore = { yaw: cam.yaw, tilt: cam.tilt, zoom: cam.zoom, px: cam.px, py: cam.py };
  view.selected = a;
  const d = DESKS[a.id];
  if (d) {
    const q = p1(d.x, d.y - 24, 0);
    const z = 2.15;
    const s = baseScale * z;
    // la cámara baja de verdad: 42° -> 31° mientras acerca
    flyTo({ zoom: z, tilt: 31 * D2R, px: -q.x * s, py: -q.y * s - (originY - H * 0.2) }, 600);
  }
  fillSheet(a);
  ui.sheet.hidden = false;
  requestAnimationFrame(() => ui.sheet.classList.add('open'));
  ui.back.hidden = false;
  buildDock();
  render();
}

function closeSheet() {
  view.selected = null;
  ui.sheet.classList.remove('open');
  setTimeout(() => { if (!view.selected) ui.sheet.hidden = true; }, 340);
  ui.back.hidden = true;
  if (cameraBefore) { flyTo(cameraBefore, 520); cameraBefore = null; }
  buildDock();
  render();
}

function fillSheet(a) {
  ui.sheetName.textContent = a.name;
  ui.sheetRole.textContent = a.role ? `${a.role} · ${a.area}` : a.area;
  ui.sheetAvatar.textContent = initials(a.name);
  ui.sheetAvatar.style.background = `linear-gradient(150deg, ${a.color}, ${rgba(a.color, .4)})`;
  ui.sheetState.textContent = a.mood.label;
  ui.sheetState.style.color = a.mood.color;
  ui.sheetInbox.textContent = `${a.inbox} mensajes`;
  ui.sheetTask.textContent = a.last_task || 'Sin tarea registrada';
  ui.sheetTask.classList.toggle('muted', !a.last_task);
  const saved = state.source !== 'live';
  ui.sheetDelivery.textContent = a.last_output ? a.last_output.slice(0, 380) : (saved ? 'Oculto en modo guardado' : 'Sin entregas registradas');
  ui.sheetDelivery.classList.toggle('muted', !a.last_output);
  ui.sheetActivity.textContent = a.updatedAt
    ? `${STATUS_LABEL[a.status] || a.status} · ${relativeTime(a.updatedAt)}`
    : (STATUS_LABEL[a.status] || a.status);
  ui.loadBar.style.width = `${Math.round(a.mood.load)}%`;
  ui.loadBar.style.background = a.mood.color;
  ui.loadLabel.textContent = `${a.mood.label} · ${Math.round(a.mood.load)}%`;
  ui.sheet.dataset.agent = a.id;
  if (MAUS_CHAT_URL) {
    ui.sheetChat.href = MAUS_CHAT_URL.replace('%s', encodeURIComponent(a.id));
    ui.sheetChat.removeAttribute('aria-disabled');
  } else {
    ui.sheetChat.href = '#';
    ui.sheetChat.setAttribute('aria-disabled', 'true');
  }
}

let toastTimer = 0;
function toast(msg) {
  ui.toast.textContent = msg;
  ui.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 3200);
}

// ---------- cámara ----------
let tween = null;
function flyTo(to, ms = 600) {
  tween = { from: { ...cam }, to: { ...cam, ...to }, t0: performance.now(), ms };
}
function fitView() { flyTo({ zoom: 1, px: 0, py: 0, tilt: ISO }, 520); }

function resize() {
  W = canvas.clientWidth; H = canvas.clientHeight;
  DPR = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  originY = H * 0.47;
  const z = cam.zoom, pxx = cam.px, pyy = cam.py;
  cam.zoom = 1; cam.px = 0; cam.py = 0;
  const s0 = cam.scale;
  cam.scale = 1;
  const pts = [
    p1(-PLAN.w / 2, -PLAN.d / 2, WALL_H), p1(PLAN.w / 2, -PLAN.d / 2, WALL_H),
    p1(-PLAN.w / 2, PLAN.d / 2, 0), p1(PLAN.w / 2, PLAN.d / 2, 0),
  ];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  // Encuadre: manda el alto. La planta ocupa OCC del alto útil (cabecera â†’ dock);
  // el ancho se desborda y se recorre con arrastre, como en la referencia.
  const widthFit = (W - 6) / (maxX - minX);
  const heightFit = (usableHeight() * OCC) / (maxY - minY);
  baseScale = Math.max(widthFit, heightFit);
  const availTop = TOP_INSET, availBottom = H - DOCK_INSET;
  originY = (availTop + availBottom) / 2 - ((minY + maxY) / 2) * baseScale;
  // centrar en los puestos, no en las paredes: las 10 cabezas caben aunque se corte muro lateral
  const headsX = Object.values(DESKS).map((d) => p1(d.x, d.y - 36, 104).x);
  const cx = (Math.min(...headsX) + Math.max(...headsX)) / 2;
  layout.px0 = clamp(-cx * baseScale, -W * 0.12, W * 0.12);
  cam.zoom = z; cam.px = pxx; cam.py = pyy;
  cam.scale = baseScale * z || s0 || baseScale;
  layout = { minX, maxX, minY, maxY, px0: layout.px0, occ: ((maxY - minY) * baseScale) / usableHeight() };
}

// ---------- dibujo ----------
function draw(now) {
  const t0 = performance.now();
  state.draws++;
  anim = reduce ? 0 : now / 1000;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a1220');
  bg.addColorStop(0.55, '#070b13');
  bg.addColorStop(1, '#04060a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const gl = ctx.createRadialGradient(W / 2, H * 0.42, 10, W / 2, H * 0.42, Math.max(W, H) * 0.7);
  gl.addColorStop(0, 'rgba(58,112,190,.16)');
  gl.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gl;
  ctx.fillRect(0, 0, W, H);
  if (!state.data) return;

  hits.length = 0;
  floorTiles();
  drawRugs();
  drawParts();
  drawLamps();
  drawLabels();
  state.drawMs = Math.round((performance.now() - t0) * 10) / 10;
  window.__vexel = { hits: hits.map((h) => ({ id: h.id, x: h.x, y: h.y })), draws: state.draws, drawMs: state.drawMs, tiles: 165, source: state.source, cam: { ...cam },
    metrics: {
      occ: Math.round((((layout.maxY - layout.minY) * cam.scale) / usableHeight()) * 1000) / 1000,
      figurePx: Math.round(Math.abs(P(0, 0, 94).y - P(0, 0, 22).y) * 10) / 10,
      labels: state.labelCount || 0,
      labelOverlaps: state.labelOverlaps || 0,
      labelMinGap: state.labelMinGap === null || state.labelMinGap === undefined ? null : Math.round(state.labelMinGap * 10) / 10,
      planW: Math.round((layout.maxX - layout.minX) * cam.scale),
      planH: Math.round((layout.maxY - layout.minY) * cam.scale),
      labelRects: state.labelRects || [],
    } };
}

function drawRugs() {
  rug(-320, -196, 210, 150, '#eab308', 0.14);      // oficina de Ciro
  rug(0, 100, 560, 330, '#1e3a5f', 0.24);          // open plan
  rug(340, 250, 180, 130, '#22d3ee', 0.10);
  rug(-330, 275, 200, 110, '#a78bfa', 0.10);
  rug(0, -198, 300, 176, '#2b4d78', 0.34);         // sala de estar
}

function drawParts() {
  const parts = [];
  const add = (depth, fn) => parts.push({ depth, fn });

  // muros perimetrales
  add(-400, () => wallSegment(0, -PLAN.d / 2, PLAN.w, false, WALL_H));
  add(-420, () => wallSegment(-PLAN.w / 2, 0, PLAN.d, true, WALL_H));
  add(-330, () => wallSegment(PLAN.w / 2, -160, 300, true, WALL_H));

  // oficina de Ciro (cristal + vano)
  add(-260, () => glass(-190, -205, 0, 12, 210, GLASS_H));       // pared este
  add(-250, () => box(-420, -95, 0, 66, 12, GLASS_H, '#243244'));
  add(-250, () => glass(-302, -95, 0, 170, 12, GLASS_H));        // pared sur
  add(-250, () => box(-205, -95, 0, 34, 12, GLASS_H, '#243244'));

  // sala de operaciones (cristal)
  add(-180, () => glass(205, -205, 0, 12, 210, GLASS_H));
  add(-170, () => glass(330, -95, 0, 250, 12, GLASS_H));

  // puestos
  for (const a of state.agents) {
    const d = DESKS[a.id];
    if (!d) continue;
    const dim = view.now && !['working', 'walking', 'waiting', 'attention'].includes(a.status);
    add(d.y - 52, () => chair(d.x, d.y - 40));
    add(d.y - 40, () => {
      const head = person(d.x, d.y - 36, a.color, { status: a.status, phase: (a.id.length * 1.7) % 6, hair: '#171c26' });
      const p = P(head.x, head.y - 6, head.z + 18);
      hits.push({ id: a.id, x: p.x, y: p.y });
      if (!dim && (view.selected === a || a.status === 'attention')) drawBubble(a, p);
    });
    add(d.y, () => desk(d.x, d.y, d.office ? '#46371f' : '#3a3024', {
      glow: a.mood.color,
      extra: (x, y, z) => {
        if (d.office) {
          box(x - 52, y - 14, z, 18, 26, 12, '#eab308'); // placa de Ciro
        } else if (a.id === 'design-lead') {
          box(x - 50, y - 4, z, 26, 18, 20, '#a78bfa'); // tablero de dibujo
        } else if (a.id === 'ops-lead') {
          box(x - 52, y - 8, z, 20, 14, 6, '#f43f5e');
        } else if (a.id === 'legal-lead' || a.id === 'commercial-lead') {
          box(x - 50, y + 4, z, 22, 15, 1, '#2b3a4f');  // libreta abierta
        }
      },
    }));
    add(d.y + 6, () => stack(d.x - 54, d.y + 22, 47));
  }

  // decoración
  add(-300, () => shelf(-390, -292, 96));
  add(-290, () => plant(-455, -280, 1));
  add(-290, () => plant(430, -285, 1));
  add(90, () => coffeeCorner(-380, 250));
  add(286, () => reception(-110, 296));
  add(300, () => sofa(-330, 292));
  add(240, () => plant(430, 282, 1.1));
  add(250, () => plant(-455, 300, 1));
  add(120, () => plant(20, 265, 1));

  // sala de estar: el hueco más grande de la planta
  add(-168, () => sofa(-2, -238));
  add(-164, () => pouf(-104, -178));
  add(-162, () => pouf(96, -178));
  add(-150, () => lowTable(0, -174, 76, 46));
  add(-140, () => floorLamp(0, -252));
  add(-130, () => plant(146, -264, 1.1));
  add(-120, () => plant(-150, -256, 0.8));

  // paredes y rincones
  add(-305, () => whiteboard(0, -302, 168, 62, 52));
  add(-305, () => poster(-434, -210, '#22d3ee'));
  add(-305, () => poster(-434, -110, '#eab308'));
  add(-300, () => box(330, -300, 92, 74, 6, 42, '#0b111b'));
  add(-299, () => poly([P(296, -297, 100), P(364, -297, 100), P(364, -297, 116), P(296, -297, 116)], 'rgba(244,63,94,.55)'));
  add(120, () => printer(-180, 100));
  add(270, () => printer(66, 288));
  add(160, () => tallTable(404, 150));
  add(300, () => plant(430, 40, 0.9));
  add(280, () => plant(-455, 40, 0.9));
  add(240, () => bin(-436, 186));
  add(250, () => bin(436, 210));
  add(260, () => bin(-24, 302));

  parts.sort((a, b) => a.depth - b.depth).forEach((p) => p.fn());
}

function drawLamps() {
  lamp(-300, -40);
  lamp(0, -40);
  lamp(300, -40);
  lamp(0, 240);
}

// nombres cortos para las etiquetas y el dock
const SHORT = {
  ciro: 'Ciro', 'marketing-lead': 'Marketing', 'design-lead': 'Creativo', 'mentor-lead': 'Mentoría',
  'commercial-lead': 'Comercial', 'ops-lead': 'Operaciones', 'billing-admin': 'Admin',
  'finance-lead': 'CFO', 'legal-lead': 'Legal', 'people-lead': 'Personas',
};
// nombres del dock: cortos y sin truncar
const DOCK_NAME = {
  ciro: 'Ciro', 'marketing-lead': 'Marketing', 'design-lead': 'Diseño', 'mentor-lead': 'Mentoría',
  'commercial-lead': 'Comercial', 'ops-lead': 'Ops', 'billing-admin': 'Admin',
  'finance-lead': 'Finanzas', 'legal-lead': 'Legal', 'people-lead': 'Personas',
};

function drawBubble(a, p) {
  const text = a.last_task;
  if (!text) return;
  ctx.font = '600 10px system-ui,sans-serif';
  const w = Math.min(170, Math.max(96, ctx.measureText(text).width * 0.6) + 16);
  const lines = wrap2(text, w - 14, 2);
  const h = lines.length * 12 + 8;
  const x = clamp(p.x - w / 2, 6, W - w - 6);
  const y = clamp(p.y - 10 - h, 58, H - 150);
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, 8) : ctx.rect(x, y, w, h);
  ctx.fillStyle = 'rgba(9,14,24,.94)';
  ctx.fill();
  ctx.strokeStyle = rgba(a.color, 0.6);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = 'rgba(228,237,250,.95)';
  lines.forEach((l, i) => ctx.fillText(l, x + 7, y + 13 + i * 12));
}

function wrap2(text, maxW, maxLines) {
  const words = text.split(' ');
  const out = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      out.push(line);
      line = word;
      if (out.length === maxLines) break;
    } else line = test;
  }
  if (line && out.length < maxLines) out.push(line);
  const res = out.slice(0, maxLines);
  if (res.length === maxLines) {
    let lastL = res[res.length - 1];
    while (ctx.measureText(lastL + '…').width > maxW && lastL.length > 4) lastL = lastL.slice(0, -1);
    res[res.length - 1] = lastL + '…';
  }
  return res;
}

// Etiquetas: en reposo solo activos o en riesgo (máx. 3); todas al acercar.
const LABEL_GAP = 26;                 // separación mínima entre píldoras
const ACTIVE = ['working', 'walking', 'attention'];

function drawLabels() {
  const items = [];
  const zoomed = cam.zoom >= 1.25;
  for (const a of state.agents) {
    const d = DESKS[a.id];
    if (!d) continue;
    if (view.now && !ACTIVE.includes(a.status) && a.status !== 'waiting') continue;
    if (view.selected) continue;                    // con la ficha abierta, ella ya nombra al agente
    const sel = view.selected === a;
    const busy = ACTIVE.includes(a.status);
    const tier = sel ? 1 : busy ? 2 : 3;
    const fs = tier === 1 ? 12 : tier === 2 ? 11 : 10.5;
    const h = tier === 1 ? 20 : tier === 2 ? 18 : 17;
    const label = SHORT[a.id] || a.name;
    ctx.font = `${tier === 1 ? 700 : 600} ${fs}px system-ui,sans-serif`;
    const w = ctx.measureText(label).width + 22;
    const head = P(d.x, d.y - 36, 104);
    items.push({ a, label, sel, tier, fs, h, w, x: head.x, y: head.y - h - 10, head });
  }

  const prio = (it) => it.a.status === 'attention' ? 0
    : (it.a.status === 'working' || it.a.status === 'walking') ? 1
    : it.a.status === 'waiting' ? 2 : 3;
  // orden: activos o en riesgo primero; en reposo, después por actividad más reciente
  const ranked = items.slice().sort((p, q) => zoomed
    ? (p.tier - q.tier || p.y - q.y)
    : (prio(p) - prio(q) || (Date.parse(q.a.updatedAt || 0) || 0) - (Date.parse(p.a.updatedAt || 0) || 0) || p.y - q.y));

  const placed = [];
  const shown = [];
  const intersects = (r, s, gap = 0) => r.x < s.x + s.w + gap && r.x + r.w + gap > s.x && r.y < s.y + s.h + gap && r.y + r.h + gap > s.y;
  const MAX_LEADER = 40;                     // línea guía corta

  for (const it of ranked) {
    if (!zoomed && shown.length >= 3) break; // en reposo, máximo 3
    if (it.head.x < 10 || it.head.x > W - 10 || it.head.y < TOP_INSET || it.head.y > H - DOCK_INSET) continue; // cabeza fuera: sin etiqueta
    it.x = clamp(it.x, it.w / 2 + 8, W - it.w / 2 - 8);
    let y = it.y;
    let r = { x: it.x - it.w / 2, y, w: it.w, h: it.h };
    const hits = () => placed.filter((s) => intersects(r, s, LABEL_GAP));
    if (hits().length) {
      const push = Math.min(...hits().map((s) => s.y)) - it.h - LABEL_GAP;
      const r2 = { ...r, y: push };
      const leader = it.head.y - (push + it.h);
      if (leader <= MAX_LEADER && push >= TOP_INSET + 8 && !placed.some((s) => intersects(r2, s, LABEL_GAP))) {
        y = push; r = r2;
      } else if (it.tier === 1) {
        y = clamp(push, TOP_INSET + 8, H - DOCK_INSET - it.h - 8);
        r = { ...r, y };
      } else continue;                        // si no cabe con guía corta, no se pinta
    }
    if (r.y < TOP_INSET + 8 || r.y + it.h > H - DOCK_INSET - 8) continue;
    it.y = y;
    it.alpha = it.tier === 1 ? 1 : 0.95;
    placed.push(r);
    shown.push(it);
  }

  state.labelCount = shown.length;
  state.labelRects = shown.map((it) => ({
    id: it.a.id, x: Math.round(it.x - it.w / 2), y: Math.round(it.y), w: Math.round(it.w), h: it.h, headY: Math.round(it.head.y),
  }));
  state.labelOverlaps = 0;
  state.labelMinGap = null;
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const A = placed[i], B = placed[j];
      const gx = Math.max(0, A.x - (B.x + B.w), B.x - (A.x + A.w));
      const gy = Math.max(0, A.y - (B.y + B.h), B.y - (A.y + A.h));
      const g = Math.hypot(gx, gy);
      if (g <= 0) { state.labelOverlaps++; state.labelMinGap = 0; continue; }
      state.labelMinGap = state.labelMinGap === null ? g : Math.min(state.labelMinGap, g);
    }
  }

  for (const it of shown) {
    if (it.alpha === undefined) continue;
    const { a, label, sel, h, w, x } = it, y = it.y;
    // línea guía corta del personaje a la píldora
    if (y + h < it.head.y - 4) {
      ctx.strokeStyle = 'rgba(232,238,252,.20)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(it.head.x, it.head.y); ctx.lineTo(x, y + h); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(232,238,252,.45)';
    ctx.beginPath(); ctx.arc(it.head.x, it.head.y, 1.5, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - w / 2, y, w, h, 9) : ctx.rect(x - w / 2, y, w, h);
    ctx.fillStyle = `rgba(8,13,22,${it.alpha * 0.94})`;
    ctx.fill();
    ctx.strokeStyle = rgba(a.mood.color, sel ? 0.9 : 0.5);
    ctx.lineWidth = sel ? 1.5 : 1;
    ctx.stroke();
    ctx.fillStyle = rgba(a.mood.color, 1);
    ctx.beginPath(); ctx.arc(x - w / 2 + 9, y + h / 2, 2.6, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(232,238,252,${0.95 * it.alpha})`;
    ctx.textAlign = 'left';
    ctx.fillText(label, x - w / 2 + 14, y + h / 2 + it.fs * 0.36);
    ctx.textAlign = 'start';
  }
}

// ---------- bucle ----------
function frame(now) {
  if (document.hidden) { requestAnimationFrame(frame); return; }
  if (tween) {
    const t = clamp((now - tween.t0) / tween.ms, 0, 1);
    const k = easeInOut(t);
    cam.tilt = lerp(tween.from.tilt, tween.to.tilt, k);
    cam.zoom = lerp(tween.from.zoom, tween.to.zoom, k);
    cam.px = lerp(tween.from.px, tween.to.px, k);
    cam.py = lerp(tween.from.py, tween.to.py, k);
    cam.scale = baseScale * cam.zoom;
    if (t >= 1) tween = null;
    draw(now);
  } else if (now - last >= 1000 / 30 - 4) {   // -4 ms: con rAF a 60 Hz cae un frame sí y otro no, sin bordes
    last = now;
    draw(now);
  }
  requestAnimationFrame(frame);
}
let last = 0, raf = null;
function render() { if (raf) return; raf = requestAnimationFrame((t) => { raf = null; draw(t); }); }

// ---------- gestos ----------
const pts = new Map();
let gesture = null;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 1) gesture = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, panX: cam.px, panY: cam.py };
  if (pts.size === 2) {
    const [a, b] = [...pts.values()];
    gesture = { ...gesture, pinch: Math.hypot(a.x - b.x, a.y - b.y), zoom: cam.zoom, px: cam.px, py: cam.py };
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!pts.has(e.pointerId)) return;
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 1 && gesture && !gesture.pinch) {
    const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
    gesture.moved = Math.max(gesture.moved, Math.hypot(dx, dy));
    if (gesture.moved > 5) { cam.px = gesture.panX + dx; cam.py = gesture.panY + dy; tween = null; render(); }
  } else if (pts.size === 2 && gesture?.pinch) {
    const [a, b] = [...pts.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const next = clamp((gesture.zoom * dist) / gesture.pinch, 0.85, 3.2);
    const ratio = next / cam.zoom;
    cam.px = gesture.px + (mx - (W / 2 + gesture.px)) * (1 - ratio);
    cam.py = gesture.py + (my - (originY + gesture.py)) * (1 - ratio);
    cam.zoom = next; cam.scale = baseScale * cam.zoom;
    gesture.moved = 99; render();
  }
});
function endPointer(e) {
  const st = gesture;
  pts.delete(e.pointerId);
  if (pts.size === 0) {
    if (st && !st.pinch && st.moved < 6 && performance.now() - st.t < 450) tap(e.clientX, e.clientY);
    gesture = null;
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

let lastTap = 0;
function tap(x, y) {
  const now = performance.now();
  if (now - lastTap < 320) { fitView(); if (view.selected) closeSheet(); lastTap = 0; return; }
  lastTap = now;
  let best = null, bestD = 44;
  for (const h of hits) {
    const d = Math.hypot(x - h.x, y - h.y);
    if (d < bestD) { best = h; bestD = d; }
  }
  if (best) {
    const a = state.agents.find((k) => k.id === best.id);
    if (a) selectAgent(a);
  } else if (view.selected) closeSheet();
}

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.zoom = clamp(cam.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.85, 3.2);
  cam.scale = baseScale * cam.zoom;
  tween = null; render();
}, { passive: false });

document.getElementById('sheetClose').addEventListener('click', closeSheet);
document.getElementById('grab').addEventListener('click', closeSheet);
ui.back.addEventListener('click', () => { if (view.selected) closeSheet(); else fitView(); });
ui.sheetChat.addEventListener('click', (e) => {
  if (!MAUS_CHAT_URL) { e.preventDefault(); toast('Falta la URL del chat de Maus.'); }
});
document.getElementById('wipe').addEventListener('click', async () => {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('vexel-oficina')).map((k) => caches.delete(k)));
    toast('Datos guardados borrados.');
    setTimeout(() => location.reload(), 700);
  } catch { toast('No pude borrar la caché.'); }
});
window.addEventListener('resize', () => { resize(); render(); });
window.addEventListener('online', () => refresh().catch(() => {}));

// 'Ahora' por doble toque en la cabecera (provisional) â€” sin dock extra
document.getElementById('nowBtn').addEventListener('click', (e) => {
  view.now = !view.now;
  e.currentTarget.setAttribute('aria-pressed', String(view.now));
  buildDock();
  render();
});

boot();

// PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
