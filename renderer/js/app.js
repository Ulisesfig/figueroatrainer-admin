// Arranque de la aplicación: sesión → pantalla de acceso o panel.
import { h, mount } from './lib/h.js';
import { icon } from './lib/icons.js';
import { notify, openModal, button, confirmDialog, closeAllLayers, hasOpenLayer } from './lib/ui.js';
import { fullName, initials } from './lib/format.js';
import { clearAll, invalidate, loadUsers, loadPlans, loadExercises, loadProducts, loadContacts, countNewContacts, onInvalidate, expirationState, peek } from './lib/data.js';
import { defineRoutes, startRouter, stopRouter, navigate, refreshCurrent, currentRoute } from './router.js';
import { openPalette } from './palette.js';
import { showLogin, showConnecting, showOffline } from './views/login.js';

import { homeView } from './views/home.js';
import { usersView } from './views/users.js';
import { plansView } from './views/plans.js';
import { planEditorView } from './views/planEditor.js';
import { exercisesView } from './views/exercises.js';
import { storeView } from './views/store.js';
import { paymentsView } from './views/payments.js';
import { settingsView } from './views/settings.js';
import { contactsView } from './views/contacts.js';

const root = document.getElementById('root');

const NAV = [
  { key: 'home', label: 'Hoy', icon: 'sun', hint: 'Ctrl+1' },
  { group: 'Gestión' },
  { key: 'users', label: 'Alumnos', icon: 'users', hint: 'Ctrl+2', badge: true },
  { key: 'plans', label: 'Planes', icon: 'clipboard', hint: 'Ctrl+3' },
  { key: 'exercises', label: 'Ejercicios', icon: 'dumbbell', hint: 'Ctrl+4' },
  { group: 'Negocio' },
  { key: 'store', label: 'Tienda', icon: 'bag', hint: 'Ctrl+5' },
  { key: 'payments', label: 'Pagos', icon: 'card', hint: 'Ctrl+6' },
  { key: 'contacts', label: 'Mensajes', icon: 'mail', hint: 'Ctrl+7', badge: true },
];

const SECTION_LABELS = {
  home: 'Hoy', users: 'Alumnos', plans: 'Planes', exercises: 'Ejercicios', store: 'Tienda', payments: 'Pagos', contacts: 'Mensajes', settings: 'Ajustes',
};

let appApi = null;
let state = { user: null };

// ─── Atajos de teclado (hoja de ayuda) ──────────────────────────────────────

const SHORTCUTS = [
  ['General', [['Ctrl + K', 'Buscar y ejecutar comandos'], ['Ctrl + 1 … 7', 'Ir a Hoy, Alumnos, Planes, Ejercicios, Tienda, Pagos, Mensajes'], ['Ctrl + ,', 'Ajustes'], ['Ctrl + N', 'Crear (según la pantalla en la que estés)'], ['Ctrl + B', 'Mostrar u ocultar la barra lateral'], ['F5', 'Actualizar datos'], ['Esc', 'Cerrar paneles y diálogos']]],
  ['Editor de planes', [['Ctrl + S', 'Guardar el plan'], ['Ctrl + Z', 'Deshacer el último cambio del plan'], ['Ctrl + Shift + Z', 'Rehacer'], ['Alt + ↑ / ↓', 'Mover el ejercicio seleccionado'], ['Ctrl + D', 'Duplicar el día abierto']]],
];

function showShortcuts() {
  openModal({
    title: 'Atajos de teclado',
    size: 'sm',
    body: h('div', { class: 'col gap-16' }, SHORTCUTS.map(([title, rows]) =>
      h('div', { class: 'section' }, h('div', { class: 'section__title' }, title), rows.map(([keys, text]) =>
        h('div', { class: 'row', style: { justifyContent: 'space-between', padding: '4px 0' } }, h('span', { class: 'muted' }, text), h('span', null, keys.split(' ').map((k) => (k === '+' || k === '…' || k === '/' ? ` ${k} ` : h('span', { class: 'kbd', style: { marginRight: '3px' } }, k)))))
      ))
    )),
    footer: null,
  });
}

// ─── Panel principal (shell) ────────────────────────────────────────────────

function buildShell(user) {
  let collapsed = false;
  const navButtons = new Map();
  const badgeEls = new Map();

  const rail = h('nav', { class: 'rail', 'aria-label': 'Navegación principal' });
  const app = h('div', { class: 'app' });
  const crumbsEl = h('div', { class: 'crumbs' });
  const statusEl = h('span', { class: 'status-dot is-wait', role: 'status' }, 'Conectando…');
  const content = h('main', { class: 'content', id: 'content', tabindex: '-1' });

  function setCollapsed(value, persist = true) {
    collapsed = value;
    app.classList.toggle('is-collapsed', collapsed);
    collapseBtn.setAttribute('aria-label', collapsed ? 'Expandir barra lateral' : 'Contraer barra lateral');
    if (persist) window.ft.setSettings({ sidebarCollapsed: collapsed });
  }

  const collapseBtn = h('button', { type: 'button', class: 'nav__item rail__collapse', onClick: () => setCollapsed(!collapsed), title: 'Contraer o expandir (Ctrl+B)' }, icon('panel', 20), h('span', { class: 'nav__label' }, 'Contraer'));

  const brand = h('div', { class: 'rail__brand' }, h('img', { class: 'rail__logo', src: 'assets/logo.png', alt: 'Figueroa Trainer' }), h('span', { class: 'rail__mono', 'aria-hidden': 'true' }, 'FT'));
  const navList = h('div', { class: 'rail__nav' });
  NAV.forEach((item) => {
    if (item.group) { navList.appendChild(h('div', { class: 'rail__group' }, item.group)); return; }
    const badgeEl = item.badge ? h('span', { class: 'nav__count hidden' }) : null;
    const btn = h('button', { type: 'button', class: 'nav__item', title: `${item.label} (${item.hint})`, onClick: () => navigate(item.key) }, icon(item.icon, 20), h('span', { class: 'nav__label' }, item.label), badgeEl);
    navButtons.set(item.key, btn);
    if (badgeEl) badgeEls.set(item.key, badgeEl);
    navList.appendChild(btn);
  });

  const settingsBtn = h('button', { type: 'button', class: 'nav__item', title: 'Ajustes (Ctrl+,)', onClick: () => navigate('settings') }, icon('sliders', 20), h('span', { class: 'nav__label' }, 'Ajustes'));
  navButtons.set('settings', settingsBtn);

  const me = h('div', { class: 'me' }, h('span', { class: 'avatar avatar--sm' }, initials(user)), h('div', { class: 'me__text' }, h('div', { class: 'me__name' }, fullName(user)), h('div', { class: 'me__role' }, 'Administrador')));

  rail.append(brand, navList, h('div', { class: 'rail__foot' }, settingsBtn, collapseBtn, me));

  const searchTrigger = h('button', { type: 'button', class: 'search-trigger', onClick: () => openPalette(appApi), 'aria-label': 'Buscar (Ctrl+K)' }, icon('search', 15), h('span', null, 'Buscar alumnos, planes, ejercicios…'), h('span', { class: 'kbd' }, 'Ctrl K'));
  const newBtn = button('Nuevo', { variant: 'primary', size: 'sm', icon: 'plus', onClick: () => appApi.triggerNew(), title: 'Crear (Ctrl+N)' });
  newBtn.classList.add('hidden');

  const topbar = h('header', { class: 'topbar' }, crumbsEl, h('div', { class: 'topbar__spacer' }), statusEl, searchTrigger, newBtn);
  app.append(rail, h('div', { class: 'main' }, topbar, content));

  // Contadores de la barra lateral: alumnos por vencer o vencidos, y mensajes de contacto
  // nuevos desde la última vez que se abrió esa pantalla en este equipo.
  function paintBadges() {
    const users = peek('users');
    const el = badgeEls.get('users');
    if (el && users) {
      const n = users.filter((u) => ['expired', 'soon'].includes(expirationState(u).kind)).length;
      el.textContent = String(n);
      el.classList.toggle('hidden', n === 0);
      el.title = `${n} alumno${n === 1 ? '' : 's'} con el plan vencido o por vencer`;
    }
    const contacts = peek('contacts');
    const contactsEl = badgeEls.get('contacts');
    if (contactsEl && contacts) {
      const n = countNewContacts(contacts);
      contactsEl.textContent = String(n);
      contactsEl.classList.toggle('hidden', n === 0);
      contactsEl.title = `${n} mensaje${n === 1 ? '' : 's'} nuevo${n === 1 ? '' : 's'}`;
    }
  }
  function refreshBadges() {
    loadUsers().then(paintBadges).catch(() => {});
    loadContacts().then(paintBadges).catch(() => {});
  }
  onInvalidate(() => setTimeout(paintBadges, 0));
  refreshBadges();

  // Estado del servidor
  async function pingServer() {
    const res = await window.ft.api({ method: 'GET', path: '/api/health', auth: false, timeoutMs: 10000 });
    statusEl.className = `status-dot ${res.ok ? 'is-ok' : 'is-bad'}`;
    statusEl.textContent = res.ok ? 'Servidor en línea' : 'Sin conexión';
  }
  pingServer();
  const pingTimer = setInterval(pingServer, 45000);

  let newAction = null;
  appApi = {
    user,
    navigate,
    toast: notify,
    setCrumbs(list) {
      crumbsEl.replaceChildren(...list.flatMap((c, i) => {
        const last = i === list.length - 1;
        const node = last ? h('span', { class: 'crumbs__current' }, c.label) : (c.href ? h('button', { type: 'button', onClick: () => navigate(c.href) }, c.label) : h('span', null, c.label));
        return last ? [node] : [node, icon('chevron-right', 14)];
      }));
    },
    setNewAction(label, fn) {
      newAction = fn || null;
      newBtn.classList.toggle('hidden', !fn);
      if (fn) newBtn.replaceChildren(icon('plus', 15), label || 'Nuevo');
    },
    triggerNew() { if (newAction) newAction(); },
    async refreshAll() {
      clearAll();
      await refreshCurrent();
      refreshBadges();
      notify.info('Datos actualizados');
    },
    showShortcuts,
    refreshBadges,
    openPalette: () => openPalette(appApi),
    toggleSidebar: () => setCollapsed(!collapsed),
    async logout() {
      const ok = await confirmDialog({ title: 'Cerrar sesión', message: 'Vas a tener que volver a ingresar con tu email y contraseña.', confirmText: 'Cerrar sesión' });
      if (ok) await doLogout();
    },
    destroy() { clearInterval(pingTimer); },
  };

  function setActive(routePath) {
    const section = (routePath || 'home').split('/')[0];
    navButtons.forEach((btn, key) => btn.classList.toggle('is-active', key === section));
  }

  return { app, content, appApi, setActive, setCollapsed };
}

async function doLogout() {
  closeAllLayers();
  stopRouter();
  appApi?.destroy?.();
  appApi = null;
  await window.ft.logout();
  clearAll();
  boot({ notice: null, skipVerify: true });
}

// ─── Arranque ───────────────────────────────────────────────────────────────

function enterPanel(user, sidebarCollapsed) {
  const shell = buildShell(user);
  mount(root, shell.app);
  shell.setCollapsed(Boolean(sidebarCollapsed), false);

  defineRoutes([
    { path: 'home', view: homeView },
    { path: 'users/:id?', view: usersView },
    { path: 'plans', view: plansView },
    { path: 'plans/:id', view: planEditorView },
    { path: 'exercises/:id?', view: exercisesView },
    { path: 'store/:id?', view: storeView },
    { path: 'payments', view: paymentsView },
    { path: 'contacts/:id?', view: contactsView },
    { path: 'settings', view: settingsView },
  ]);

  if (!location.hash) location.hash = '#/home';

  startRouter({
    mountEl: shell.content,
    app: shell.appApi,
    onRouteChange: (entry) => {
      const path = (entry.hash || '').replace(/^#\/?/, '').split('?')[0] || 'home';
      shell.setActive(path);
      const section = path.split('/')[0];
      shell.appApi.setCrumbs([{ label: SECTION_LABELS[section] || 'Hoy' }]);
      shell.appApi.setNewAction(null);
      document.title = `${SECTION_LABELS[section] || 'Hoy'} · Figueroa Trainer Admin`;
    },
  });

  // Precarga en segundo plano (de a una, sin competir con la pantalla actual) lo que las
  // demás secciones van a pedir: al abrirlas ya están listas en vez de mostrar 'Cargando…'.
  setTimeout(() => {
    [loadUsers, loadPlans, loadExercises, loadProducts, loadContacts].reduce((chain, load) => chain.then(() => load()).catch(() => {}), Promise.resolve());
  }, 1200);
}

async function boot({ notice, skipVerify } = {}) {
  const info = (await window.ft.session()).data;

  if (!info.hasSession || skipVerify) {
    showLogin(root, { lastEmail: info.lastEmail, notice, onSuccess: (user) => { state.user = user; boot({ skipVerify: false }); } });
    return;
  }

  showConnecting(root);
  const verified = await window.ft.verifySession();

  if (!verified.ok) {
    const code = verified.error?.code;
    if (verified.error?.transient || code === 'NETWORK' || code === 'TIMEOUT') {
      showOffline(root, { message: verified.error.message, onRetry: () => boot(), onLogout: doLogout });
    } else {
      showLogin(root, { lastEmail: info.lastEmail, notice: verified.error?.message, onSuccess: () => boot() });
    }
    return;
  }

  state.user = verified.data.user;
  enterPanel(state.user, info.sidebarCollapsed);
}

// ─── Eventos globales ───────────────────────────────────────────────────────

window.ft.onSessionExpired(() => {
  closeAllLayers();
  stopRouter();
  appApi?.destroy?.();
  appApi = null;
  clearAll();
  boot({ notice: 'Tu sesión venció. Ingresá de nuevo para seguir.', skipVerify: true });
});

window.ft.onMenu((action) => {
  if (!appApi) return;
  if (action.type === 'navigate') navigate(action.view);
  else if (action.type === 'refresh') appApi.refreshAll();
  else if (action.type === 'logout') appApi.logout();
  else if (action.type === 'shortcuts') showShortcuts();
  else if (action.type === 'hash') { closeAllLayers(); location.hash = action.hash; }
  else if (action.type === 'undo' || action.type === 'redo') {
    const el = document.activeElement;
    const editable = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    if (editable) document.execCommand(action.type);
    else window.__ftEditor?.[action.type]?.();
  }
});

// Aviso cuando hay una versión nueva descargada
let updateToastVersion = null;
window.ft.onUpdateStatus((status) => {
  if (status.state === 'ready' && status.latest && updateToastVersion !== status.latest) {
    updateToastVersion = status.latest;
    notify.info('Hay una versión nueva lista: ' + status.latest, { duration: 30000, action: { label: 'Reiniciar y actualizar', onClick: () => window.ft.installUpdate() } });
  }
});

document.addEventListener('keydown', (event) => {
  if (!appApi) return;
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === 'k') { event.preventDefault(); openPalette(appApi); }
  else if (mod && event.key.toLowerCase() === 'b') { event.preventDefault(); appApi.toggleSidebar(); }
  else if (mod && event.key.toLowerCase() === 'n' && !hasOpenLayer()) { event.preventDefault(); appApi.triggerNew(); }
});

// Errores inesperados: se registran y se avisan sin romper la pantalla.
window.addEventListener('unhandledrejection', (event) => {
  console.error('Promesa sin manejar:', event.reason);
});

boot();

export { currentRoute, invalidate };
