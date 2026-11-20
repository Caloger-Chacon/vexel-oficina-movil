#!/usr/bin/env node
// VEXEL · Oficina — servidor de publicación con PIN.
// Un solo archivo, sin dependencias. Sirve la app (solo GET) detrás de una sesión por cookie.
//
//   PIN=123456 node publish/server-pin.mjs
//
// Variables: PIN (obligatoria, 6–12 dígitos), PORT (8080), HOST (0.0.0.0),
// SESSION_HOURS (12), COOKIE_SECURE (auto por X-Forwarded-Proto), TRUST_PROXY (0),
// OFFICE_URL (opcional: proxy GET /api/office a la oficina real).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const PIN = String(process.env.PIN || '').trim();
const SESSION_HOURS = Math.max(1, Math.min(72, Number(process.env.SESSION_HOURS || 12)));
const OFFICE = (process.env.OFFICE_URL || '').replace(/\/$/, '');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const COOKIE = 'vexel_sid';

if (!/^\d{6,12}$/.test(PIN)) {
  console.error('PIN inválido: define PIN con 6 a 12 dígitos. Ejemplo:  PIN=483920 node publish/server-pin.mjs');
  process.exit(1);
}

const PIN_HASH = crypto.createHash('sha256').update(PIN).digest();
const sessions = new Map();          // token -> expira (ms)
const attempts = new Map();          // ip -> { n, until }
const MAX_TRIES = 6;
const WINDOW_MS = 15 * 60 * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const isHttps = (req) => (String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https')
  || process.env.COOKIE_SECURE === '1';

const clientIp = (req) => (TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '')
  || req.socket.remoteAddress || '?';

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sessionOf(req) {
  const token = cookies(req)[COOKIE];
  if (!token) return null;
  const exp = sessions.get(token);
  if (!exp) return null;
  if (exp < Date.now()) { sessions.delete(token); return null; }
  return token;
}

function securityHeaders(res, req) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; " +
    "form-action 'self'; frame-ancestors 'none'");
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

function loginPage(error = '') {
  const msg = error ? `<p class="err">${error}</p>` : '<p class="muted">Acceso privado. Introduce el PIN.</p>';
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>VEXEL · Oficina</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;min-height:100dvh;display:grid;place-items:center;background:
    radial-gradient(120% 80% at 50% 0%,#0d1830 0%,#070b13 55%,#04060a 100%);
    font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#e8eefc;padding:24px}
  form{width:100%;max-width:320px;background:rgba(13,20,33,.72);border:1px solid rgba(148,178,220,.18);
    border-radius:18px;padding:22px 20px 18px;backdrop-filter:blur(10px);box-shadow:0 24px 60px rgba(0,0,0,.45)}
  .mark{width:34px;height:34px;border-radius:10px;background:linear-gradient(150deg,#22d3ee,#0e7490);
    box-shadow:0 6px 18px rgba(34,211,238,.35);margin-bottom:14px}
  h1{margin:0 0 2px;font-size:16px;letter-spacing:.14em;text-transform:uppercase}
  h1 span{color:#8fb4cc;font-weight:600;letter-spacing:.18em;font-size:10px;display:block;margin-top:4px}
  label{display:block;margin:16px 0 6px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8fa3c0}
  input{width:100%;padding:13px 14px;border-radius:12px;border:1px solid rgba(148,178,220,.26);
    background:rgba(5,9,16,.75);color:#e8eefc;font:600 20px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
    letter-spacing:.35em;text-align:center}
  input:focus{outline:none;border-color:rgba(34,211,238,.7);box-shadow:0 0 0 3px rgba(34,211,238,.16)}
  button{width:100%;margin-top:14px;padding:12px;border-radius:12px;border:0;cursor:pointer;
    background:#22d3ee;color:#04121a;font:650 13px/1 system-ui;letter-spacing:.04em}
  button:active{transform:translateY(1px)}
  p{margin:12px 0 0;font-size:12px;line-height:1.5}
  .err{color:#fca5a5}
  .muted{color:#7c8ba3}
  .foot{margin-top:18px;padding-top:12px;border-top:1px solid rgba(148,178,220,.12);color:#5f708c;font-size:11px}
</style></head>
<body>
<form method="post" action="/login" autocomplete="off">
  <div class="mark" aria-hidden="true"></div>
  <h1>VEXEL <span>Oficina · solo lectura</span></h1>
  <label for="pin">PIN de acceso</label>
  <input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="12"
         autocomplete="current-password" required autofocus aria-describedby="estado">
  ${msg}
  <button type="submit">Entrar</button>
  <p class="foot">Solo lectura: no aprueba, no lanza tareas ni escribe nada.</p>
</form>
</body></html>`;
}

function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), ...extra });
  res.end(body);
}

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return send(res, 400, 'Solicitud inválida'); }
  if (rel.includes('\0')) return send(res, 400, 'Solicitud inválida');
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(ROOT, '.' + rel);
  if (!file.startsWith(ROOT + path.sep)) return send(res, 403, 'No');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'No encontrado');
    const ext = path.extname(file).toLowerCase();
    const name = path.basename(file);
    const cache = name === 'sw.js' || ext === '.html' ? 'no-cache' : 'public, max-age=3600';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': cache,
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  securityHeaders(res, req);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const ip = clientIp(req);

  // salud (sin sesión, sin datos)
  if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/health') {
    res.setHeader('Cache-Control', 'no-store');
    return send(res, 200, req.method === 'HEAD' ? '' : JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
  }

  // login
  if (url.pathname === '/login') {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET') {
      if (sessionOf(req)) return res.writeHead(302, { Location: '/' }).end();
      return send(res, 200, loginPage(), 'text/html; charset=utf-8');
    }
    if (req.method === 'POST') {
      const rec = attempts.get(ip) || { n: 0, until: 0 };
      if (Date.now() < rec.until && rec.n >= MAX_TRIES) {
        return send(res, 429, loginPage('Demasiados intentos. Espera 15 minutos.'), 'text/html; charset=utf-8');
      }
      if (rec.until && Date.now() > rec.until) { rec.n = 0; rec.until = 0; }
      let form;
      try { form = new URLSearchParams(await readBody(req)); }
      catch { return send(res, 413, 'Solicitud demasiado grande'); }
      const given = crypto.createHash('sha256').update(String(form.get('pin') || '')).digest();
      const ok = given.length === PIN_HASH.length && crypto.timingSafeEqual(given, PIN_HASH);
      if (!ok) {
        rec.n++;
        if (rec.n >= MAX_TRIES) { rec.until = Date.now() + WINDOW_MS; }
        attempts.set(ip, rec);
        return send(res, 401, loginPage(`PIN incorrecto. Intentos restantes: ${Math.max(0, MAX_TRIES - rec.n)}.`), 'text/html; charset=utf-8');
      }
      attempts.delete(ip);
      const token = crypto.randomBytes(32).toString('base64url');
      sessions.set(token, Date.now() + SESSION_HOURS * 3600 * 1000);
      const secure = isHttps(req) ? '; Secure' : '';
      res.setHeader('Set-Cookie',
        `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}${secure}`);
      return res.writeHead(303, { Location: '/' }).end();
    }
    return send(res, 405, 'Método no permitido', 'text/plain; charset=utf-8', { Allow: 'GET, POST' });
  }

  // logout
  if (url.pathname === '/logout') {
    if (req.method !== 'POST') return send(res, 405, 'Método no permitido', 'text/plain; charset=utf-8', { Allow: 'POST' });
    const token = sessionOf(req);
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    return res.writeHead(303, { Location: '/login' }).end();
  }

  // de aquí en adelante: solo GET y con sesión
  if (req.method !== 'GET') {
    return send(res, 405, 'Solo lectura', 'text/plain; charset=utf-8', { Allow: 'GET' });
  }

  if (!sessionOf(req)) {
    res.setHeader('Cache-Control', 'no-store');
    if (String(req.headers.accept || '').includes('text/html')) {
      return res.writeHead(302, { Location: '/login' }).end();
    }
    return send(res, 401, 'Sesión requerida', 'text/plain; charset=utf-8');
  }

  // proxy opcional al estado real de la oficina
  if (OFFICE && (url.pathname === '/api/office' || url.pathname === '/api/state')) {
    try {
      const upstream = await fetch(OFFICE + url.pathname, { headers: { accept: 'application/json' } });
      const body = await upstream.text();
      res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(body);
    } catch (e) {
      return send(res, 502, JSON.stringify({ error: 'oficina no disponible' }), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
    }
  }

  if (url.pathname === '/api/office' || url.pathname === '/api/state') {
    return send(res, 404, JSON.stringify({ unavailable: 'sin OFFICE_URL: se usa data/snapshot.json' }), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
  }

  serveStatic(req, res, url.pathname);
});

const timer = setInterval(() => {
  const now = Date.now();
  for (const [t, exp] of sessions) if (exp < now) sessions.delete(t);
  for (const [ip, rec] of attempts) if (rec.until && rec.until < now) attempts.delete(ip);
}, 10 * 60 * 1000);
timer.unref();

server.listen(PORT, HOST, () => {
  console.log(`VEXEL · Oficina en http://${HOST}:${PORT}`);
  console.log(`PIN de ${PIN.length} dígitos desde el entorno · sesión de ${SESSION_HOURS} h · solo GET`);
  console.log(OFFICE ? `Estado en vivo desde ${OFFICE}` : 'Sin OFFICE_URL: se sirve data/snapshot.json');
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT', () => { server.close(() => process.exit(0)); });
