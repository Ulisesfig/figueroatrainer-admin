// Plantillas de mensajes para avisar a los alumnos por WhatsApp.
// Se guardan en este equipo; cada administrador puede ajustarlas a su estilo.
import { formatDate, relativeDays, toDateKey, todayKey } from './format.js';

export const TEMPLATE_KINDS = [
  { value: 'soon', label: 'Por vencer', hint: 'Alumnos cuyo plan vence en los próximos 14 días' },
  { value: 'expired', label: 'Vencidos', hint: 'Alumnos con el plan ya vencido' },
  { value: 'inactive', label: 'Sin entrenar', hint: 'Alumnos con la app activa que no entrenan hace una semana o más' },
  { value: 'welcome', label: 'Bienvenida', hint: 'Alumnos que se dieron de alta en las últimas dos semanas' },
  { value: 'custom', label: 'Mensaje libre', hint: 'A los alumnos que selecciones en la lista' },
];

export const VARIABLES = [
  { key: '{nombre}', label: 'Nombre' },
  { key: '{apellido}', label: 'Apellido' },
  { key: '{vencimiento}', label: 'Fecha de vencimiento' },
  { key: '{cuando}', label: 'Cuándo vence (ej. en 3 días)' },
  { key: '{dias}', label: 'Días sin entrenar' },
];

export const DEFAULT_TEMPLATES = {
  soon: 'Hola {nombre}! Te escribo de Figueroa Trainer: tu plan vence {cuando} ({vencimiento}). ¿Lo renovamos así seguís entrenando sin cortes? 💪',
  expired: 'Hola {nombre}! Tu plan en Figueroa Trainer venció el {vencimiento}. ¿Querés renovarlo para retomar la rutina?',
  inactive: 'Hola {nombre}! Hace {dias} días que no te veo entrenar. ¿Todo bien? Si necesitás ajustar la rutina o el horario, contame y lo vemos.',
  welcome: 'Hola {nombre}! Bienvenido/a a Figueroa Trainer 💪 Ya tenés acceso a la app con tu email. Cualquier duda, escribime por acá.',
  custom: 'Hola {nombre}! ',
};

const TEMPLATES_KEY = 'ft:templates';
const SENT_KEY = 'ft:reminders-sent';

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch (_e) { return fallback; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_e) { /* almacenamiento no disponible: se usan los valores por defecto */ }
}

export function getTemplate(kind) {
  const saved = readJson(TEMPLATES_KEY, {});
  return typeof saved[kind] === 'string' && saved[kind].trim() ? saved[kind] : DEFAULT_TEMPLATES[kind];
}

export function setTemplate(kind, text) {
  const saved = readJson(TEMPLATES_KEY, {});
  if (!text.trim() || text === DEFAULT_TEMPLATES[kind]) delete saved[kind];
  else saved[kind] = text;
  writeJson(TEMPLATES_KEY, saved);
}

export function isCustomized(kind) {
  return getTemplate(kind) !== DEFAULT_TEMPLATES[kind];
}

export function renderTemplate(template, user, extra = {}) {
  const key = toDateKey(user.expires_at);
  const values = {
    '{nombre}': user.name || 'che',
    '{apellido}': user.surname || '',
    '{vencimiento}': key ? formatDate(key) : 'sin fecha',
    '{cuando}': key ? relativeDays(key) : '',
    '{dias}': extra.days != null ? String(extra.days) : '',
  };
  return template.replace(/\{(nombre|apellido|vencimiento|cuando|dias)\}/g, (match) => values[match]).replace(/[ \t]+\n/g, '\n').trim();
}

// ─── Registro de a quién ya se le abrió el chat hoy (para no repetir por error) ───

export function wasOpenedToday(kind, userId) {
  return Boolean(readJson(SENT_KEY, {})[`${todayKey()}:${kind}:${userId}`]);
}

export function markOpened(kind, userId) {
  const log = readJson(SENT_KEY, {});
  const today = todayKey();
  // se guardan solo los últimos días para que no crezca
  Object.keys(log).forEach((k) => { if (k.slice(0, 10) < today.slice(0, 8) + '01') delete log[k]; });
  log[`${today}:${kind}:${userId}`] = 1;
  writeJson(SENT_KEY, log);
}
