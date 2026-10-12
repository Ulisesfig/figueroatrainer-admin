// Modelo del editor de planes: borrador en memoria ⇄ formato de la API.
// Reglas del backend que este modelo respeta (planController.normalizeStructuredPlan):
//   - una variante solo se conserva si tiene nombre Y link de YouTube;
//   - los items de sección (calentamiento, movilidad, core, cardio) que no tienen
//     series/reps/link/id se guardan como {name, notes, duration}; si los tienen,
//     la "duración" se pierde → acá se la pasa a las notas para no perder datos;
//   - RIR válido: 0, 1 o 2; unidad de reps: 'reps' o 'seconds'.

export const SECTION_TYPES = ['warmup', 'mobility', 'core', 'cardio'];
export const DAY_SECTION_TYPES = ['exercises', ...SECTION_TYPES];
export const SECTION_LABELS = { exercises: 'Ejercicios', warmup: 'Calentamiento', mobility: 'Movilidad', core: 'Core', cardio: 'Cardio' };

let keyCounter = 0;
export function newKey() {
  keyCounter += 1;
  return `k${Date.now().toString(36)}${keyCounter}`;
}

const str = (v) => (v === null || v === undefined ? '' : String(v));

export function emptyExercise(patch = {}) {
  return { key: newKey(), id: null, name: '', sets: '', reps: '', reps_unit: 'reps', rir: '', suggested_weight: '', notes: '', youtube_url: '', duration: '', series_breakdown: null, variant: null, superset: [], ...patch };
}

export function emptySuperset(patch = {}) {
  return { key: newKey(), id: null, name: '', sets: '', reps: '', reps_unit: 'reps', rir: '', suggested_weight: '', notes: '', youtube_url: '', ...patch };
}

export function emptyDay(index = 0) {
  return { key: newKey(), name: '', sectionOrder: DAY_SECTION_TYPES.slice(), warmup: [], mobility: [], core: [], cardio: [], exercises: [], _label: `Día ${index + 1}` };
}

export function emptyDraft(category = 'training') {
  return {
    id: null,
    title: '',
    description: '',
    category,
    general: { warmup: [], mobility: [], core: [], cardio: [], order: SECTION_TYPES.slice() },
    days: category === 'training' ? [emptyDay(0)] : [],
    content: '',
    legacyText: '',
  };
}

// ─── Servidor → borrador ────────────────────────────────────────────────────

function fromSeries(list) {
  if (!Array.isArray(list) || !list.length) return null;
  return list.map((s) => ({ key: newKey(), weight: str(s.weight), reps: str(s.reps), rir: str(s.rir) }));
}

function fromVariant(v) {
  if (!v || typeof v !== 'object') return null;
  return { id: v.id ?? null, name: str(v.name), youtube_url: str(v.youtube_url || v.youtube), sets: str(v.sets), reps: str(v.reps), reps_unit: v.reps_unit === 'seconds' ? 'seconds' : 'reps', notes: str(v.notes), suggested_weight: str(v.suggested_weight ?? v.suggestedWeight) };
}

export function itemFromServer(item) {
  if (typeof item === 'string') return emptyExercise({ name: item });
  return emptyExercise({
    id: item.id ?? item.exercise_id ?? null,
    name: str(item.name || item.title),
    sets: str(item.sets),
    reps: str(item.reps),
    reps_unit: item.reps_unit === 'seconds' ? 'seconds' : 'reps',
    rir: str(item.rir),
    suggested_weight: str(item.suggested_weight),
    notes: str(item.notes || item.observations),
    youtube_url: str(item.youtube_url || item.youtube),
    duration: str(item.duration),
    series_breakdown: fromSeries(item.series_breakdown),
    variant: fromVariant(item.variant),
    superset: Array.isArray(item.superset) ? item.superset.map((s) => emptySuperset({ id: s.id ?? null, name: str(s.name), sets: str(s.sets), reps: str(s.reps), reps_unit: s.reps_unit === 'seconds' ? 'seconds' : 'reps', rir: str(s.rir), suggested_weight: str(s.suggested_weight), notes: str(s.notes), youtube_url: str(s.youtube_url || s.youtube) })) : [],
  });
}

function orderFrom(order, allowed) {
  const clean = Array.isArray(order) ? order.filter((t) => allowed.includes(t)) : [];
  return [...clean, ...allowed.filter((t) => !clean.includes(t))];
}

export function draftFromPlan(plan) {
  const draft = emptyDraft(plan.category || 'training');
  draft.id = plan.id;
  draft.title = plan.title || '';
  draft.description = plan.description || '';

  if (draft.category === 'nutrition') {
    draft.content = plan.content || '';
    return draft;
  }

  const json = plan.content_json;
  if (json && Array.isArray(json.days)) {
    const g = json.general || {};
    draft.general = {
      warmup: (g.warmup || []).map(itemFromServer),
      mobility: (g.mobility || []).map(itemFromServer),
      core: (g.core || []).map(itemFromServer),
      cardio: (g.cardio || []).map(itemFromServer),
      order: orderFrom(g.order, SECTION_TYPES),
    };
    draft.days = json.days.map((d, i) => ({
      key: newKey(),
      name: str(d.name),
      sectionOrder: orderFrom(d.sectionOrder || d.section_order, DAY_SECTION_TYPES),
      warmup: (d.warmup || []).map(itemFromServer),
      mobility: (d.mobility || []).map(itemFromServer),
      core: (d.core || []).map(itemFromServer),
      cardio: (d.cardio || []).map(itemFromServer),
      exercises: (d.exercises || []).map(itemFromServer),
      _label: `Día ${d.day || i + 1}`,
    }));
    if (!draft.days.length) draft.days = [emptyDay(0)];
    return draft;
  }

  // Plan viejo en texto plano: se intenta importar y se avisa que hay que revisarlo.
  draft.legacyText = plan.content || '';
  const imported = parseLegacyText(draft.legacyText);
  draft.days = imported.length ? imported : [emptyDay(0)];
  return draft;
}

// Importador del formato de texto antiguo:
//   Día 1 - Pecho:
//   - Press banca 4x10 [RIR 1] - notas
//   1. name=Sentadilla | sets=4 | reps=8 | rir=2 | weight=60 | obs=... | yt=https://...
export function parseLegacyText(text) {
  const days = [];
  let current = null;
  const header = /^\s*D[ií]a\s+(\d+)\s*(?:[-–—]\s*(.+?))?\s*:\s*$/i;
  String(text || '').split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    const h = line.match(header);
    if (h) {
      current = emptyDay(days.length);
      current.name = h[2] ? h[2].trim() : '';
      days.push(current);
      return;
    }
    if (!current) return;
    if (/^(sin ejercicios)$/i.test(line)) return;
    if (/^(calentamiento|movilidad|core|cardio)\b.*:$/i.test(line)) return;

    const body = line.replace(/^(?:\d+[.)]|[-*•])\s*/, '');
    if (!body) return;

    if (/\bname=/.test(body)) {
      const ex = emptyExercise();
      body.split('|').map((p) => p.trim()).forEach((part) => {
        const m = part.match(/^\[#ID=(\d+)\]$/);
        if (m) { ex.id = Number(m[1]); return; }
        const [k, ...rest] = part.split('=');
        const v = rest.join('=').trim();
        if (k === 'name') ex.name = v;
        else if (k === 'sets') ex.sets = v;
        else if (k === 'reps') ex.reps = v;
        else if (k === 'rir') ex.rir = v;
        else if (k === 'weight') ex.suggested_weight = v;
        else if (k === 'obs') ex.notes = v;
        else if (k === 'yt') ex.youtube_url = v;
      });
      if (ex.name) current.exercises.push(ex);
      return;
    }

    const ex = emptyExercise();
    let rest = body;
    const rir = rest.match(/\[RIR\s*([012])\]/i);
    if (rir) { ex.rir = rir[1]; rest = rest.replace(rir[0], ''); }
    const sr = rest.match(/(\d{1,2})\s*[x×]\s*(\d{1,3})/i);
    if (sr) { ex.sets = sr[1]; ex.reps = sr[2]; rest = rest.replace(sr[0], ''); }
    const notes = rest.match(/\s-\s(.+)$/);
    if (notes) { ex.notes = notes[1].trim(); rest = rest.replace(notes[0], ''); }
    ex.name = rest.replace(/\s{2,}/g, ' ').trim();
    if (ex.name) current.exercises.push(ex);
  });
  return days;
}

// ─── Borrador → servidor ────────────────────────────────────────────────────

const intOrNull = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const floatOrNull = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const cleanText = (v) => { const t = str(v).trim(); return t || null; };

function serializeSeries(list) {
  if (!Array.isArray(list)) return null;
  const rows = list.map((s) => ({ weight: floatOrNull(s.weight), reps: intOrNull(s.reps), rir: s.rir === '' ? null : intOrNull(s.rir) })).filter((s) => s.weight !== null || s.reps !== null || s.rir !== null);
  return rows.length ? rows : null;
}

export function serializeExercise(ex, { section = false } = {}) {
  const base = {
    id: ex.id ?? null,
    name: ex.name.trim(),
    sets: intOrNull(ex.sets),
    reps: intOrNull(ex.reps),
    reps_unit: ex.reps_unit === 'seconds' ? 'seconds' : 'reps',
    rir: ex.rir === '' ? null : intOrNull(ex.rir),
    suggested_weight: floatOrNull(ex.suggested_weight),
    notes: cleanText(ex.notes),
    youtube_url: cleanText(ex.youtube_url),
    series_breakdown: serializeSeries(ex.series_breakdown),
  };

  if (section) {
    const exerciseLike = base.sets !== null || base.reps !== null || base.youtube_url || base.id;
    const duration = cleanText(ex.duration);
    if (!exerciseLike) return { name: base.name, notes: base.notes, duration };
    if (duration) base.notes = base.notes ? `${duration} — ${base.notes}` : duration;
  }

  const v = ex.variant;
  if (v && v.name && v.youtube_url) {
    base.variant = { id: v.id ?? null, name: v.name.trim(), youtube_url: v.youtube_url.trim(), sets: intOrNull(v.sets), reps: intOrNull(v.reps), reps_unit: v.reps_unit === 'seconds' ? 'seconds' : 'reps', notes: cleanText(v.notes), suggested_weight: floatOrNull(v.suggested_weight) };
  }
  if (Array.isArray(ex.superset) && ex.superset.length) {
    const items = ex.superset.filter((s) => s.name.trim()).map((s) => ({ id: s.id ?? null, name: s.name.trim(), sets: intOrNull(s.sets), reps: intOrNull(s.reps), reps_unit: s.reps_unit === 'seconds' ? 'seconds' : 'reps', rir: s.rir === '' ? null : intOrNull(s.rir), suggested_weight: floatOrNull(s.suggested_weight), notes: cleanText(s.notes), youtube_url: cleanText(s.youtube_url) }));
    if (items.length) base.superset = items;
  }
  return base;
}

export function payloadFromDraft(draft) {
  if (draft.category === 'nutrition') {
    return { title: draft.title.trim(), description: draft.description.trim() || null, category: 'nutrition', content: draft.content };
  }
  const items = (list) => list.filter((x) => x.name.trim()).map((x) => serializeExercise(x, { section: true }));
  return {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    category: 'training',
    general_warmup: items(draft.general.warmup),
    general_mobility: items(draft.general.mobility),
    general_core: items(draft.general.core),
    general_cardio: items(draft.general.cardio),
    general_section_order: draft.general.order,
    days: draft.days.map((d, i) => ({
      day: i + 1,
      name: d.name.trim() || null,
      sectionOrder: d.sectionOrder,
      warmup: items(d.warmup),
      mobility: items(d.mobility),
      core: items(d.core),
      cardio: items(d.cardio),
      exercises: d.exercises.filter((x) => x.name.trim()).map((x) => serializeExercise(x)),
    })),
  };
}

// ─── Validación ─────────────────────────────────────────────────────────────

function checkInt(value, min, max) {
  if (str(value).trim() === '') return true;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max;
}

// Devuelve una lista de problemas [{ key, field, message, dayKey? }] (vacía = todo bien).
export function validateDraft(draft) {
  const problems = [];
  if (!draft.title.trim()) problems.push({ field: 'title', message: 'Ponele un título al plan.' });

  if (draft.category === 'nutrition') {
    if (!draft.content.trim()) problems.push({ field: 'content', message: 'El plan está vacío: escribí la alimentación.' });
    return problems;
  }

  if (!draft.days.length) problems.push({ field: 'days', message: 'Agregá al menos un día.' });
  const totalExercises = draft.days.reduce((n, d) => n + d.exercises.filter((x) => x.name.trim()).length, 0);
  if (draft.days.length && totalExercises === 0) problems.push({ field: 'days', message: 'Agregá al menos un ejercicio a algún día.' });

  const checkItem = (item, dayKey, where) => {
    const label = item.name.trim() || 'ejercicio sin nombre';
    if (!item.name.trim() && (str(item.sets) || str(item.reps) || str(item.notes))) problems.push({ key: item.key, dayKey, field: 'name', message: `${where}: un ejercicio tiene datos pero no nombre.` });
    if (!item.name.trim()) return;
    if (!checkInt(item.sets, 1, 20)) problems.push({ key: item.key, dayKey, field: 'sets', message: `${where} · ${label}: las series deben estar entre 1 y 20.` });
    if (!checkInt(item.reps, 1, 999)) problems.push({ key: item.key, dayKey, field: 'reps', message: `${where} · ${label}: las repeticiones deben ser un número entre 1 y 999.` });
    if (str(item.suggested_weight).trim() !== '' && !(floatOrNull(item.suggested_weight) >= 0)) problems.push({ key: item.key, dayKey, field: 'suggested_weight', message: `${where} · ${label}: el peso sugerido no es válido.` });
    if (item.variant && (item.variant.name || item.variant.youtube_url) && !(item.variant.name && item.variant.youtube_url)) problems.push({ key: item.key, dayKey, field: 'variant', message: `${where} · ${label}: la variante necesita nombre y link de YouTube (si no, no se guarda).` });
    (item.superset || []).forEach((s) => { if (!s.name.trim() && (str(s.sets) || str(s.reps))) problems.push({ key: item.key, dayKey, field: 'superset', message: `${where} · ${label}: una superserie tiene datos pero no nombre.` }); });
  };

  SECTION_TYPES.forEach((t) => draft.general[t].forEach((it) => checkItem(it, null, `${SECTION_LABELS[t]} general`)));
  draft.days.forEach((d, i) => {
    const where = d.name.trim() ? `Día ${i + 1} (${d.name.trim()})` : `Día ${i + 1}`;
    [...d.exercises, ...SECTION_TYPES.flatMap((t) => d[t])].forEach((it) => checkItem(it, d.key, where));
  });
  return problems;
}

// ─── Resúmenes (lista y vista previa) ───────────────────────────────────────

export function summarize(item) {
  const parts = [];
  const sets = str(item.sets).trim(); const reps = str(item.reps).trim();
  if (sets && reps) parts.push(`${sets} × ${reps}${item.reps_unit === 'seconds' ? ' seg' : ''}`);
  else if (sets) parts.push(`${sets} series`);
  else if (reps) parts.push(`${reps}${item.reps_unit === 'seconds' ? ' seg' : ' reps'}`);
  if (str(item.rir).trim() !== '') parts.push(`RIR ${item.rir}`);
  if (str(item.suggested_weight).trim() !== '') parts.push(`${str(item.suggested_weight).replace('.', ',')} kg`);
  if (item.duration) parts.push(item.duration);
  return parts.join(' · ');
}

export function countExercises(draft) {
  return draft.days.reduce((n, d) => n + d.exercises.filter((x) => x.name.trim()).length, 0);
}

// Copia profunda con claves nuevas (para duplicar un día).
export function cloneDay(day) {
  const fresh = (x) => ({ ...x, key: newKey(), series_breakdown: x.series_breakdown ? x.series_breakdown.map((s) => ({ ...s, key: newKey() })) : null, variant: x.variant ? { ...x.variant } : null, superset: (x.superset || []).map((s) => ({ ...s, key: newKey() })) });
  return { ...day, key: newKey(), name: day.name ? `${day.name} (copia)` : '', warmup: day.warmup.map(fresh), mobility: day.mobility.map(fresh), core: day.core.map(fresh), cardio: day.cardio.map(fresh), exercises: day.exercises.map(fresh), sectionOrder: day.sectionOrder.slice() };
}

// Comparación estable para saber si hay cambios sin guardar.
export function fingerprint(draft) {
  return JSON.stringify(draft, (k, v) => (k === 'key' || k === '_label' || k === 'legacyText' ? undefined : v));
}
