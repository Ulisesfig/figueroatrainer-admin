// Formato de datos para la interfaz (es-AR).

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Los vencimientos son fechas de calendario (sin hora): se toman como YYYY-MM-DD
// locales para que "vence el 5" no se corra un día por la zona horaria.
export function toDateKey(value) {
  if (!value) return '';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dateFromKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function todayKey() {
  return toDateKey(new Date());
}

export function addDaysKey(key, days) {
  const base = dateFromKey(key) || new Date();
  base.setDate(base.getDate() + days);
  return toDateKey(base);
}

export function addMonthsKey(key, months) {
  const base = dateFromKey(key) || new Date();
  const day = base.getDate();
  base.setDate(1);
  base.setMonth(base.getMonth() + months);
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  base.setDate(Math.min(day, lastDay));
  return toDateKey(base);
}

// Días que faltan para una fecha (negativo = ya venció). null si no hay fecha.
export function daysUntil(value) {
  const key = toDateKey(value);
  const target = key ? dateFromKey(key) : null;
  if (!target) return null;
  const today = dateFromKey(todayKey());
  return Math.round((target - today) / 86400000);
}

export function formatDate(value) {
  const key = toDateKey(value);
  const d = key ? dateFromKey(key) : null;
  if (!d) return '—';
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()} · ${time}`;
}

export function formatLongToday() {
  const d = new Date();
  const text = `${WEEKDAYS[d.getDay()]} ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return 'Buenas noches';
  if (hour < 13) return 'Buen día';
  if (hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export function relativeDays(value) {
  const days = daysUntil(value);
  if (days === null) return '';
  if (days === 0) return 'hoy';
  if (days === 1) return 'mañana';
  if (days === -1) return 'ayer';
  if (days > 0) return `en ${days} días`;
  return `hace ${Math.abs(days)} días`;
}

// Tiempo transcurrido desde una fecha con hora (para "hace 3 h").
export function timeAgo(value) {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return formatDate(value);
}

export function formatMoney(amount, currency = 'ARS') {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency || 'ARS', maximumFractionDigits: 0 }).format(n);
}

export function formatNumber(n) {
  const v = Number(n);
  return Number.isFinite(v) ? new Intl.NumberFormat('es-AR').format(v) : '—';
}

export function formatWeight(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${(Math.round(n * 10) / 10).toString().replace('.', ',')} kg`;
}

export function fullName(user) {
  return `${user?.name || ''} ${user?.surname || ''}`.trim() || user?.email || 'Sin nombre';
}

export function initials(user) {
  const a = (user?.name || user?.email || '?').trim()[0] || '?';
  const b = (user?.surname || '').trim()[0] || '';
  return (a + b).toUpperCase();
}

export function plural(n, one, many) {
  return `${formatNumber(n)} ${Number(n) === 1 ? one : many}`;
}

// Número de WhatsApp para Argentina: 10 dígitos → agrega 549; si ya trae código, lo respeta.
export function whatsappUrl(phone, text) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  digits = digits.replace(/^0+/, '');
  if (digits.startsWith('15') && digits.length === 10) digits = digits.slice(2);
  if (digits.length === 10) digits = `549${digits}`;
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${query}`;
}

export function normalize(text) {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function debounce(fn, ms = 200) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

// CSV compatible con Excel en español (separador ;).
export function toCsv(headers, rows) {
  const esc = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers, ...rows].map((row) => row.map(esc).join(';')).join('\r\n');
}

export function youtubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|v\/))([\w-]{11})/);
  return m ? m[1] : null;
}
