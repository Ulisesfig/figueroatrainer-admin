// Capa de datos con caché en memoria. Los listados grandes (alumnos, catálogo,
// planes) se cargan una vez y se reutilizan entre pantallas; cada escritura
// invalida lo que corresponde para que nunca se vea información vieja.
import { api } from './api.js';
import { todayKey, addDaysKey, toDateKey } from './format.js';

const cache = new Map(); // clave → { value, at, promise }
const listeners = new Set();
const TTL_MS = 5 * 60 * 1000;

function fresh(entry) {
  return entry && entry.value !== undefined && Date.now() - entry.at < TTL_MS;
}

async function cached(key, loader, { force = false } = {}) {
  const entry = cache.get(key);
  if (!force && fresh(entry)) return entry.value;
  if (!force && entry?.promise) return entry.promise; // pedido en curso: se comparte
  const promise = loader()
    .then((value) => {
      cache.set(key, { value, at: Date.now() });
      return value;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });
  cache.set(key, { ...(entry || {}), promise });
  return promise;
}

export function invalidate(...keys) {
  keys.forEach((key) => {
    if (key.endsWith('*')) {
      const prefix = key.slice(0, -1);
      [...cache.keys()].filter((k) => k.startsWith(prefix)).forEach((k) => cache.delete(k));
    } else {
      cache.delete(key);
    }
  });
  listeners.forEach((fn) => fn(keys));
}

// Actualiza en la caché lo que el servidor ya confirmó (por ejemplo tras guardar un alumno)
// en vez de tirar la lista entera y volver a bajarla: la pantalla se refresca al instante
// y se ahorran uno o varios pedidos grandes. Si la lista todavía no estaba cargada no hace
// nada (la próxima carga ya trae los datos nuevos).
export function updateCached(key, mutate) {
  const entry = cache.get(key);
  if (!entry || entry.value === undefined) return false;
  cache.set(key, { value: mutate(entry.value), at: entry.at });
  listeners.forEach((fn) => fn([key], { local: true }));
  return true;
}

const sameId = (a, b) => String(a) === String(b);

export function patchCached(key, id, patch) {
  return updateCached(key, (list) => list.map((item) => (sameId(item.id, id) ? { ...item, ...patch } : item)));
}

export function upsertCached(key, item, { prepend = false } = {}) {
  return updateCached(key, (list) => (list.some((x) => sameId(x.id, item.id))
    ? list.map((x) => (sameId(x.id, item.id) ? { ...x, ...item } : x))
    : prepend ? [item, ...list] : [...list, item]));
}

export function removeCached(key, id) {
  return updateCached(key, (list) => list.filter((item) => !sameId(item.id, id)));
}

export function onInvalidate(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function peek(key) {
  return cache.get(key)?.value;
}

// ─── Alumnos ────────────────────────────────────────────────────────────────

// Baja todas las páginas de un listado: la primera trae cuántas hay y el resto se pide
// al mismo tiempo (antes se pedían de a una, cada una esperando a la anterior).
async function fetchAllPages(path, field, limit, maxPages) {
  const first = await api.get(path, { page: 1, limit });
  const pages = Math.min(first.pagination?.pages || 1, maxPages);
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => api.get(path, { page: i + 2, limit })));
  return [first, ...rest].flatMap((data) => data[field] || []);
}

export function loadUsers(opts) {
  return cached('users', () => fetchAllPages('/api/admin/users', 'users', 200, 30), opts);
}

export function loadUser(id) {
  return api.get(`/api/admin/users/${id}`).then((d) => d.user);
}

// Estado de vencimiento de un alumno para colorear y filtrar.
export function expirationState(user) {
  const key = toDateKey(user?.expires_at);
  if (!key) return { kind: 'none', days: null };
  const today = todayKey();
  if (key < today) return { kind: 'expired', days: Math.round((new Date(key) - new Date(today)) / 86400000) };
  const days = Math.round((new Date(key) - new Date(today)) / 86400000);
  if (key <= addDaysKey(today, 14)) return { kind: 'soon', days };
  return { kind: 'ok', days };
}

// ─── Actividad de los alumnos (seguimiento) ────────────────────────────────

export const INACTIVE_DAYS = 7;

// Última actividad de todos los alumnos. Si el servidor todavía no tiene esta función
// (versión vieja), devuelve available:false y las pantallas simplemente no la muestran.
export function loadActivity(opts) {
  return cached('activity', async () => {
    try {
      const data = await api.get('/api/admin/users/activity-summary');
      return { available: true, byUser: Object.fromEntries((data.users || []).map((row) => [String(row.user_id), row])) };
    } catch (error) {
      if (error.status === 400 || error.status === 404) return { available: false, byUser: {} };
      throw error;
    }
  }, opts);
}

// kind: na (no aplica) | unknown (sin datos del servidor) | never | inactive | active
export function inactivityState(user, activity) {
  if (!activity?.available) return { kind: 'unknown', days: null };
  if (String(user.role).toLowerCase() === 'admin' || !user.mobile_enabled || expirationState(user).kind === 'expired') return { kind: 'na', days: null };
  const row = activity.byUser[String(user.id)];
  const last = row?.last_workout_at || row?.last_login;
  if (!last) return { kind: 'never', days: null, workouts7: 0, workouts30: 0 };
  const days = Math.max(0, Math.floor((Date.now() - new Date(last).getTime()) / 86400000));
  return { kind: days >= INACTIVE_DAYS ? 'inactive' : 'active', days, last, workouts7: row?.workouts_7d || 0, workouts30: row?.workouts_30d || 0 };
}

// ─── Planes ─────────────────────────────────────────────────────────────────

export function loadPlans(opts) {
  return cached('plans', () => fetchAllPages('/api/admin/plans', 'plans', 200, 20), opts);
}

// ─── Catálogo de ejercicios ─────────────────────────────────────────────────

export function loadExercises(opts) {
  return cached('exercises', async () => {
    const data = await api.get('/api/admin/exercises', { limit: 1000 });
    return data.exercises || [];
  }, opts);
}

// ─── Tienda y pagos ─────────────────────────────────────────────────────────

export function loadProducts(opts) {
  return cached('products', async () => (await api.get('/api/admin/store/products')).products || [], opts);
}

export function loadOrders(opts) {
  return cached('orders', async () => (await api.get('/api/admin/store/orders', { limit: 200 })).orders || [], opts);
}

export function loadPayments(opts) {
  return cached('payments', async () => (await api.get('/api/payments/all', { limit: 500 })).payments || [], opts);
}

export function loadStoreEnabled(opts) {
  return cached('storeEnabled', async () => Boolean((await api.get('/api/admin/store/settings')).enabled), opts);
}

export function loadStats(opts) {
  return cached('stats', () => api.get('/api/admin/stats'), opts);
}

// ─── Mensajes de contacto ───────────────────────────────────────────────────

export function loadContacts(opts) {
  return cached('contacts', async () => (await api.get('/api/contact', { limit: 200 })).contacts || [], opts);
}

// El "último visto" se guarda en este equipo (no hay estado de leído en el servidor):
// el contador de "nuevos" es por administrador y por PC, como el resto de los avisos locales.
const CONTACTS_SEEN_KEY = 'ft:contacts:lastSeenId';

export function getContactsLastSeenId() {
  return Number(localStorage.getItem(CONTACTS_SEEN_KEY) || 0) || 0;
}

export function markContactsSeen(maxId) {
  const current = getContactsLastSeenId();
  if (maxId > current) { try { localStorage.setItem(CONTACTS_SEEN_KEY, String(maxId)); } catch (_e) { /* almacenamiento no disponible */ } }
}

export function countNewContacts(contacts) {
  const lastSeen = getContactsLastSeenId();
  return contacts.filter((c) => c.id > lastSeen).length;
}

export function clearAll() {
  cache.clear();
}
