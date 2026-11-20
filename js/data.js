// Lectura de estado de la oficina VEXEL. Solo GET: este módulo nunca escribe.
// Fuente 1: GET api/office del servidor de la oficina (mismo origen, en vivo).
// Fuente 2: data/snapshot.json (última lectura guardada, sirve offline).
// Fuente 3: ?demo=1 para revisar el diseño; se marca DEMO en la cabecera.
//
// Privacidad (dictamen de Legal, 20-11-2026): el modo guardado NO publica salidas de modelo,
// errores, modelo usado ni el texto de los mensajes. En vivo sí, porque va tras la sesión de la oficina.
// La "bandeja" de la oficina es un total histórico, no una cola: aquí se muestra como mensajes.

const AREA_FALLBACK = { color: '#94a3b8' };

export const MOODS = {
  libre:     { label: 'Libre',     color: '#4ade80', load: 12 },
  enfocado:  { label: 'Enfocado',  color: '#22d3ee', load: 48 },
  esperando: { label: 'Esperando', color: '#fbbf24', load: 58 },
  saturado:  { label: 'Saturado',  color: '#fb923c', load: 88 },
  'en-riesgo':{ label: 'En riesgo', color: '#f87171', load: 94 },
  dormido:   { label: 'Dormido',   color: '#64748b', load: 0 },
};

const SIX_H = 6 * 3600 * 1000;

// Semáforo de carga derivado de hechos del estado. Reglas auditables:
//   attention → en riesgo · waiting → esperando · working/walking → enfocado
//   idle con actividad <6 h → libre · idle sin actividad → dormido
//   saturado solo si la oficina expone una cola real por agente (`queue`); hoy no la expone,
//   así que no se inventa. El histórico de mensajes no es una cola.
export function deriveMood(a, now = Date.now()) {
  const queue = Number(a.queue);
  const updated = a.updatedAt ? Date.parse(a.updatedAt) : 0;
  const fresh = updated && now - updated < SIX_H;
  if (a.status === 'attention') return { key: 'en-riesgo', ...MOODS['en-riesgo'] };
  if (a.status === 'working' || a.status === 'walking') {
    if (Number.isFinite(queue) && queue >= 3) return { key: 'saturado', ...MOODS.saturado };
    return { key: 'enfocado', ...MOODS.enfocado };
  }
  if (a.status === 'waiting') return { key: 'esperando', ...MOODS.esperando };
  if (fresh) return { key: 'libre', ...MOODS.libre };
  return { key: 'dormido', ...MOODS.dormido };
}

export const STATUS_LABEL = {
  working: 'Trabajando',
  walking: 'En movimiento',
  waiting: 'Esperando aprobación',
  attention: 'Necesita atención',
  idle: 'Disponible',
};

function normalize(raw, source) {
  const live = source === 'live';
  const areas = Array.isArray(raw.areas) ? raw.areas : [];
  const areaColor = (name) => {
    const hit = areas.find((x) => x.name === name || x.id === name);
    return hit?.color || AREA_FALLBACK.color;
  };
  const agents = (Array.isArray(raw.agents) ? raw.agents : []).map((a) => {
    const mood = deriveMood(a);
    return {
      id: a.id,
      name: a.name,
      area: a.area || '',
      role: a.role || '',
      description: a.description || '',
      color: a.color || areaColor(a.area),
      status: a.status || 'idle',
      inbox: Number(a.inbox) || 0,
      last_task: (a.last_task || '').trim() || null,
      // solo en vivo: salida de modelo, error, modelo y cola real
      last_output: live ? ((a.last_output || '').trim() || null) : null,
      has_error: Boolean(a.last_error),
      last_model: live ? (a.last_model || null) : null,
      queue: Number.isFinite(Number(a.queue)) ? Number(a.queue) : null,
      updatedAt: a.updatedAt || null,
      mood,
    };
  });
  const messages = (Array.isArray(raw.messages) ? raw.messages : []).map((m) => ({
    from: m.from,
    to: m.to,
    texto: live ? (m.texto || m.text || '') : '',
    at: m.at || m.ts || m.timestamp || m.createdAt || null,
  }));
  return {
    source,
    fetchedAt: raw.fetchedAt || new Date().toISOString(),
    business: raw.business || 'VEXEL Studio',
    owner: live ? (raw.owner || '') : '',
    areas: areas.length ? areas : dedupeAreas(agents),
    agents,
    messages,
  };
}

function dedupeAreas(agents) {
  const seen = new Map();
  for (const a of agents) if (a.area && !seen.has(a.area)) seen.set(a.area, { id: a.area, name: a.area, color: a.color });
  return [...seen.values()];
}

// Handoffs reales y recientes (últimos 90 s): pulsos entre áreas.
export function recentHandoffs(state, now = Date.now(), windowMs = 90_000) {
  const ids = new Set(state.agents.map((a) => a.id));
  return (state.messages || [])
    .map((m) => ({ ...m, ms: m.at ? Date.parse(m.at) : 0 }))
    .filter((m) => m.ms && now - m.ms >= 0 && now - m.ms < windowMs && ids.has(m.from) && ids.has(m.to))
    .slice(-6);
}

async function getJSON(url, timeoutMs = 4500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const stale = res.headers.get('x-vexel-stale') === '1' || navigator.onLine === false;
    return { data: await res.json(), stale };
  } finally {
    clearTimeout(t);
  }
}

// Demo local para revisar el diseño: datos marcados como DEMO, nunca como reales.
function demoState() {
  const base = {
    business: 'VEXEL Studio',
    owner: 'Tú',
    areas: [
      { id: 'direccion', name: 'Dirección', color: '#eab308' },
      { id: 'marketing', name: 'Marketing', color: '#f97316' },
      { id: 'diseno-video', name: 'Diseño y Video', color: '#a78bfa' },
      { id: 'mentoria', name: 'Consejos y Mentoría', color: '#22d3ee' },
      { id: 'comercial', name: 'Comercial', color: '#34d399' },
      { id: 'operaciones', name: 'Operaciones', color: '#f43f5e' },
      { id: 'finanzas', name: 'Finanzas', color: '#84cc16' },
      { id: 'legal', name: 'Legal y Cumplimiento', color: '#94a3b8' },
      { id: 'personas', name: 'Personas y Talento', color: '#ec4899' },
    ],
    agents: [
      { id: 'ciro', name: 'Ciro', area: 'Dirección', role: 'Jefe de gabinete', status: 'working', inbox: 2, last_task: 'Repartir la app móvil: escena, datos y pruebas', updatedAt: new Date().toISOString() },
      { id: 'marketing-lead', name: 'Director de Marketing', area: 'Marketing', role: 'Marketing, contenido y marca', status: 'working', inbox: 1, last_task: 'Nombre interno y textos de la sala de control', updatedAt: new Date().toISOString() },
      { id: 'design-lead', name: 'Director Creativo', area: 'Diseño y Video', role: 'Diseño, video y piezas', status: 'working', inbox: 0, last_task: 'Dirección de arte del diorama móvil', updatedAt: new Date().toISOString() },
      { id: 'mentor-lead', name: 'Mentor de Negocio', area: 'Consejos y Mentoría', role: 'Coach y criterio de negocio', status: 'idle', inbox: 0, updatedAt: null },
      { id: 'commercial-lead', name: 'Director Comercial', area: 'Comercial', role: 'Ventas, prospección y propuestas', status: 'waiting', inbox: 3, last_task: 'Propuesta de piloto para un cliente nuevo', updatedAt: new Date().toISOString() },
      { id: 'ops-lead', name: 'Director de Operaciones', area: 'Operaciones', role: 'Automatización, datos y soporte', status: 'attention', inbox: 4, last_task: 'Lectura de estado y caché offline', updatedAt: new Date().toISOString() },
      { id: 'billing-admin', name: 'Billing & Admin', area: 'Operaciones', role: 'Facturación y admin', status: 'idle', inbox: 1, updatedAt: new Date().toISOString() },
      { id: 'finance-lead', name: 'CFO', area: 'Finanzas', role: 'Dirección financiera', status: 'idle', inbox: 0, updatedAt: null },
      { id: 'legal-lead', name: 'Legal y Cumplimiento', area: 'Legal y Cumplimiento', role: 'Contratos, datos y obligaciones', status: 'working', inbox: 0, last_task: 'Checklist de solo lectura, PIN y HTTPS', updatedAt: new Date().toISOString() },
      { id: 'people-lead', name: 'People Lead', area: 'Personas y Talento', role: 'Equipo, cultura y formación', status: 'idle', inbox: 0, updatedAt: null },
    ],
    messages: [],
  };
  return normalize(base, 'demo');
}

export async function loadState() {
  const params = new URLSearchParams(location.search);
  if (params.get('demo') === '1') return demoState();
  try {
    const { data: live, stale } = await getJSON('api/office');
    if (live && Array.isArray(live.agents) && live.agents.length) return normalize(live, stale ? 'stale' : 'live');
  } catch { /* cae al snapshot */ }
  try {
    const { data: snap } = await getJSON('data/snapshot.json', 3000);
    return normalize(snap, 'snapshot');
  } catch {
    throw new Error('sin estado guardado');
  }
}

export function relativeTime(iso, now = Date.now()) {
  if (!iso) return 'sin registro';
  const ms = Date.parse(iso);
  if (!ms) return 'sin registro';
  const d = Math.max(0, now - ms);
  if (d < 60_000) return 'hace ' + Math.max(1, Math.round(d / 1000)) + ' s';
  if (d < 3_600_000) return 'hace ' + Math.round(d / 60_000) + ' min';
  if (d < 86_400_000) return 'hace ' + Math.round(d / 3_600_000) + ' h';
  return 'hace ' + Math.round(d / 86_400_000) + ' d';
}
