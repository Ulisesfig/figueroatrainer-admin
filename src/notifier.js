// Avisos de escritorio: pagos aprobados, nuevos registros y vencimientos próximos.
// Funciona en segundo plano (con la ventana minimizada o cerrada a la bandeja) consultando
// el servidor cada pocos minutos con endpoints livianos. La primera vez solo toma una
// "foto" del estado actual para no llenar de avisos por cosas viejas.
const fs = require('fs');
const path = require('path');
const { app, Notification } = require('electron');
const storage = require('./storage');
const api = require('./api');

const POLL_EVERY_MS = 2 * 60 * 1000;
const FIRST_POLL_DELAY_MS = 20 * 1000;
const EXPIRING_DAYS = 3;

let timer = null;
let running = false;
let onOpen = () => {};

const TOPIC_LABELS = { planes: 'Planes y tarifas', rutina: 'Dudas sobre rutina', nutricion: 'Consulta de nutrición', tienda: 'Pedido en tienda', otro: 'Otro' };

const money = (amount) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(amount) || 0);
const personName = (p) => [p.name, p.surname].filter(Boolean).join(' ') || p.email || 'Un alumno';
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const stateFile = () => path.join(app.getPath('userData'), 'notifier.json');
function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch (_e) { return null; }
}
function saveState(state) {
  try { fs.writeFileSync(stateFile(), JSON.stringify(state), 'utf8'); } catch (_e) { /* no es crítico */ }
}

let testSink = null;

function show({ title, body, hash }) {
  if (testSink) { testSink({ title, body, hash }); return; } // pruebas automáticas
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title, body, silent: false });
  notification.on('click', () => onOpen(hash));
  notification.show();
}

async function get(pathname, query) {
  const res = await api.request({ method: 'GET', path: pathname, query, timeoutMs: 15000 });
  return res.ok ? res.data : null;
}

async function poll({ force = false } = {}) {
  if (running) return;
  const settings = storage.getSettings();
  if (!force && settings.notifications === false) return;
  if (!api.getSession()?.token) return;

  running = true;
  try {
    const previous = loadState();
    const first = !previous;
    const state = previous || { approved: [], lastUserId: 0, lastContactId: 0, lastExpiryDay: '' };
    const seenApproved = new Set(state.approved || []);

    // Pagos aprobados nuevos
    const paymentsData = await get('/api/payments/all', { limit: 15 });
    if (paymentsData?.payments) {
      const approved = paymentsData.payments.filter((p) => String(p.status).toLowerCase() === 'approved');
      const fresh = approved.filter((p) => !seenApproved.has(p.id));
      if (!first) {
        fresh.slice(0, 3).forEach((p) => show({
          title: 'Pago aprobado',
          body: `${personName(p)} · ${p.product_name || p.plan_type || 'Pago'} · ${money(p.amount)}`,
          hash: '#/payments',
        }));
        if (fresh.length > 3) show({ title: 'Pagos aprobados', body: `Y ${fresh.length - 3} pagos más`, hash: '#/payments' });
      }
      approved.forEach((p) => seenApproved.add(p.id));
      state.approved = [...seenApproved].slice(-100);
    }

    // Registros nuevos
    const usersData = await get('/api/admin/users', { page: 1, limit: 10 });
    if (usersData?.users) {
      const newest = Math.max(0, ...usersData.users.map((u) => Number(u.id) || 0));
      if (!first) {
        const fresh = usersData.users.filter((u) => Number(u.id) > (state.lastUserId || 0) && String(u.role).toLowerCase() !== 'admin');
        fresh.slice(0, 3).forEach((u) => show({
          title: 'Nuevo registro',
          body: `${personName(u)} se registró${u.mobile_enabled ? '' : ' y espera acceso a la app'}.`,
          hash: '#/users',
        }));
        if (fresh.length > 3) show({ title: 'Nuevos registros', body: `Y ${fresh.length - 3} alumnos más`, hash: '#/users' });
      }
      state.lastUserId = Math.max(state.lastUserId || 0, newest);
    }

    // Mensajes de contacto nuevos (también llegan por email, pero ese envío puede fallar)
    const contactsData = await get('/api/contact', { limit: 10 });
    if (contactsData?.contacts) {
      const newest = Math.max(0, ...contactsData.contacts.map((c) => Number(c.id) || 0));
      if (!first) {
        const fresh = contactsData.contacts.filter((c) => Number(c.id) > (state.lastContactId || 0));
        fresh.slice(0, 3).forEach((c) => show({
          title: 'Nuevo mensaje de contacto',
          body: `${personName(c)} · ${TOPIC_LABELS[c.topic] || c.topic || 'Otro'}`,
          hash: '#/contacts',
        }));
        if (fresh.length > 3) show({ title: 'Nuevos mensajes de contacto', body: `Y ${fresh.length - 3} mensajes más`, hash: '#/contacts' });
      }
      state.lastContactId = Math.max(state.lastContactId || 0, newest);
    }

    // Vencimientos próximos: un aviso por día
    if (state.lastExpiryDay !== todayKey()) {
      const expiring = await get('/api/admin/vencimientos', { days: EXPIRING_DAYS });
      if (expiring?.users) {
        const now = Date.now();
        const upcoming = expiring.users.filter((u) => u.expires_at && new Date(u.expires_at).getTime() >= now - 24 * 3600 * 1000);
        if (!first && upcoming.length) {
          show({
            title: upcoming.length === 1 ? 'Un alumno está por vencer' : `${upcoming.length} alumnos están por vencer`,
            body: upcoming.slice(0, 3).map(personName).join(', ') + (upcoming.length > 3 ? '…' : ''),
            hash: '#/users?filter=soon',
          });
        }
        state.lastExpiryDay = todayKey();
      }
    }

    saveState(state);
  } catch (error) {
    console.error('Error en los avisos de escritorio:', error.message);
  } finally {
    running = false;
  }
}

function start({ onOpenNotification }) {
  onOpen = onOpenNotification || onOpen;
  stop();
  if (process.env.FT_TEST_NO_POLL) return; // pruebas automáticas: sin consultas de fondo
  setTimeout(() => poll(), FIRST_POLL_DELAY_MS);
  timer = setInterval(() => poll(), POLL_EVERY_MS);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

// Al cerrar sesión se olvida lo visto: el próximo ingreso vuelve a tomar una foto inicial.
function reset() {
  try { fs.unlinkSync(stateFile()); } catch (_e) { /* no existe */ }
}

function sendTest() {
  show({ title: 'Figueroa Trainer Admin', body: 'Los avisos de escritorio están funcionando.', hash: '#/home' });
}

module.exports = { start, stop, poll, reset, sendTest, _setTestSink: (fn) => { testSink = fn; } };
