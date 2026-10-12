// Ajustes: cuenta, servidor, atajos e información de la app.
import { h, mount } from '../lib/h.js';
import { icon } from '../lib/icons.js';
import { api, errorMessage } from '../lib/api.js';
import { button, badge, avatar, field, textInput, switchInput, emptyState, errorBox, loadingBlock, notify, openModal, withBusy, markInvalid } from '../lib/ui.js';
import { fullName, formatDateTime } from '../lib/format.js';
import { openReminders } from './reminders.js';

// Historial de cambios de administración (quién hizo qué y cuándo)
async function openAuditLog() {
  const host = h('div', null, loadingBlock('Cargando historial…'));
  const modal = openModal({ title: 'Historial de cambios', subtitle: 'Lo que hicieron los administradores, de lo más nuevo a lo más viejo.', size: 'lg', body: host, footer: [button('Cerrar', { variant: 'ghost', onClick: () => modal.close() })] });
  try {
    const items = (await api.get('/api/admin/audit', { limit: 100 })).items || [];
    if (!items.length) { mount(host, emptyState({ icon: 'clipboard', title: 'Todavía no hay cambios registrados', text: 'Desde ahora, cada cambio de alumnos, planes, ejercicios y tienda queda anotado acá.' })); return; }
    mount(host, h('div', { class: 'table-wrap' }, h('div', { class: 'table-scroll', style: { maxHeight: '60vh' } }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, h('th', null, 'Cuándo'), h('th', null, 'Quién'), h('th', null, 'Qué'))),
      h('tbody', null, items.map((i) => h('tr', null, h('td', { class: 'num' }, formatDateTime(i.created_at)), h('td', null, i.admin_name || 'Sistema'), h('td', null, h('div', null, i.action), i.entity_label ? h('div', { class: 'cell-sub' }, i.entity_label) : null))))))));
  } catch (error) {
    mount(host, error.status === 400 || error.status === 404
      ? emptyState({ icon: 'info', title: 'Esta función necesita el servidor actualizado', text: 'Cuando el servidor tenga la última versión, vas a ver el historial acá.' })
      : errorBox(errorMessage(error), () => { modal.close(); openAuditLog(); }));
  }
}

export function settingsView(container, _params, app) {
  const info = h('div', { class: 'kv' });
  const healthHost = h('div', { class: 'row' });
  const urlInput = textInput({ type: 'url', className: 'input--mono', placeholder: 'https://…', 'aria-label': 'Dirección del servidor' });
  let currentUrl = '';
  let destroyed = false;

  const row = (label, value) => h('div', { class: 'kv__row' }, h('span', { class: 'kv__k' }, label), h('span', { class: 'kv__v selectable' }, value));

  async function checkHealth() {
    mount(healthHost, badge('Probando…', 'info', { dot: true }));
    const started = performance.now();
    const res = await window.ft.api({ method: 'GET', path: '/api/health', auth: false, timeoutMs: 10000 });
    if (destroyed) return;
    const ms = Math.round(performance.now() - started);
    mount(healthHost, res.ok ? badge(`Conectado · ${ms} ms`, 'ok', { dot: true }) : badge('Sin conexión con el servidor', 'danger', { dot: true }), res.ok ? null : h('span', { class: 'faint' }, res.error?.message || ''));
  }

  async function saveUrl(btn) {
    const value = urlInput.value.trim().replace(/\/+$/, '');
    markInvalid(urlInput, false);
    if (!value) { markInvalid(urlInput); notify.warn('Ingresá la dirección del servidor.'); return; }
    if (value === currentUrl) { notify.info('Es la misma dirección que ya está configurada.'); return; }
    await withBusy(btn, async () => {
      const res = await window.ft.setSettings({ apiUrl: value });
      if (!res.ok) { markInvalid(urlInput); notify.error(errorMessage(res.error)); return; }
      currentUrl = res.data.apiUrl; urlInput.value = currentUrl;
      notify.ok('Dirección guardada.');
      checkHealth();
      notify.info('Como cambió el servidor, cerrá sesión e ingresá de nuevo.');
      app.logout();
    });
  }

  async function loadInfo() {
    const [session, about] = await Promise.all([window.ft.session(), window.ft.appInfo()]);
    if (destroyed) return;
    currentUrl = session.data?.apiUrl || '';
    urlInput.value = currentUrl;
    const d = about.data || {};
    mount(info,
      row('Versión', d.version || '—'),
      row('Electron', d.electron || '—'),
      row('Sistema', d.platform === 'win32' ? 'Windows' : d.platform === 'darwin' ? 'macOS' : d.platform || '—'),
      row('Sesión guardada', d.encrypted ? 'Cifrada con Windows (protegida)' : 'Sin cifrado disponible: la sesión no se guarda en este equipo'),
      d.dev ? row('Modo', 'Desarrollo') : null);
  }

  const saveBtn = button('Guardar dirección', { icon: 'check' });
  saveBtn.addEventListener('click', () => saveUrl(saveBtn));
  urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveUrl(saveBtn); });

  const user = app.user || {};

  // ─── Avisos de escritorio ───
  const prefsHost = h('div', { class: 'col gap-16' });
  async function paintPrefs() {
    const res = await window.ft.getPrefs();
    if (destroyed || !res.ok) return;
    const save = async (patch) => { const r = await window.ft.setPrefs(patch); if (!r.ok) notify.error(errorMessage(r.error)); };
    mount(prefsHost,
      switchInput({ checked: res.data.notifications, label: 'Avisarme de pagos aprobados, nuevos registros y vencimientos', onChange: (on) => save({ notifications: on }) }),
      switchInput({ checked: res.data.runInBackground, label: 'Al cerrar la ventana, seguir abierto en la bandeja para recibir avisos', onChange: (on) => save({ runInBackground: on }) }),
      h('div', null, button('Probar un aviso', { icon: 'info', onClick: () => window.ft.testNotification() })));
  }

  // ─── Actualizaciones ───
  const updateHost = h('div', { class: 'col gap-16' });
  function paintUpdate(status) {
    if (destroyed) return;
    const busy = ['checking', 'downloading'].includes(status.state);
    const text = {
      idle: status.enabled ? 'Todavía no se buscaron actualizaciones.' : 'Las actualizaciones automáticas funcionan en la versión instalada.',
      checking: 'Buscando actualizaciones…',
      downloading: `Descargando la versión ${status.latest || ''}${status.percent ? ` (${status.percent}%)` : ''}…`,
      ready: `La versión ${status.latest} está lista para instalarse.`,
      none: 'Tenés la última versión.',
      error: 'No se pudo comprobar si hay actualizaciones (¿sin internet?). Se vuelve a intentar solo.',
    }[status.state] || '';
    mount(updateHost,
      h('div', { class: 'row', style: { justifyContent: 'space-between', gap: '16px' } }, h('div', null, h('div', null, text), h('div', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, `Versión instalada: ${status.version || '—'}`)),
        status.state === 'ready'
          ? button('Reiniciar y actualizar', { variant: 'primary', icon: 'refresh', onClick: () => window.ft.installUpdate() })
          : button('Buscar actualizaciones', { icon: 'refresh', disabled: busy || !status.enabled, onClick: () => window.ft.checkForUpdates() })));
  }
  window.ft.updateStatus().then((r) => { if (r.ok) paintUpdate(r.data); });
  const stopUpdates = window.ft.onUpdateStatus(paintUpdate);

  mount(container, h('div', { class: 'page page--narrow' },
    h('div', { class: 'page__head' }, h('div', null, h('h1', { class: 'page__title' }, 'Ajustes'), h('p', { class: 'page__sub' }, 'Tu cuenta, la conexión con el servidor y ayuda rápida.'))),
    h('div', { class: 'col gap-16' },
      h('section', { class: 'card' }, h('div', { class: 'card__head' }, h('div', { class: 'card__title' }, 'Cuenta')),
        h('div', { class: 'card__body' }, h('div', { class: 'row', style: { gap: '14px' } }, avatar(user, 'lg'), h('div', { class: 'grow' }, h('div', { class: 'cell-name' }, fullName(user)), h('div', { class: 'cell-sub' }, user.email || ''), h('div', { style: { marginTop: '6px' } }, badge('Administrador', 'brass'))), button('Cerrar sesión', { icon: 'logout', onClick: () => app.logout() })))),
      h('section', { class: 'card' }, h('div', { class: 'card__head' }, h('div', { class: 'card__title' }, 'Servidor'), healthHost),
        h('div', { class: 'card__body col gap-16' },
          field('Dirección del servidor', h('div', { class: 'row' }, h('div', { class: 'grow' }, urlInput), saveBtn), { hint: 'Es la misma que usa la web y la app. Cambiala solo si te lo indican.' }),
          h('div', null, button('Probar conexión', { icon: 'wifi', onClick: checkHealth })))),
      h('section', { class: 'card' }, h('div', { class: 'card__head' }, h('div', { class: 'card__title' }, 'Avisos')), h('div', { class: 'card__body' }, prefsHost)),
      h('section', { class: 'card' }, h('div', { class: 'card__head' }, h('div', { class: 'card__title' }, 'Mensajes a alumnos')),
        h('div', { class: 'card__body col gap-16' }, h('p', { class: 'muted' }, 'Las plantillas de WhatsApp para vencimientos, alumnos sin entrenar y bienvenida se editan desde ahí y se guardan en este equipo.'), h('div', null, button('Editar plantillas y avisar', { icon: 'chat', onClick: () => openReminders({ kind: 'soon' }) })))),
      h('section', { class: 'card' }, h('div', { class: 'card__head' }, h('div', { class: 'card__title' }, 'Actualizaciones')), h('div', { class: 'card__body' }, updateHost)),
      h('section', { class: 'card' }, h('div', { class: 'card__head' }, h('div', { class: 'card__title' }, 'Historial')),
        h('div', { class: 'card__body row', style: { justifyContent: 'space-between', gap: '16px' } }, h('span', { class: 'muted' }, 'Quién cambió qué en alumnos, planes, ejercicios y tienda.'), button('Ver historial de cambios', { icon: 'clipboard', onClick: () => openAuditLog() }))),
      h('section', { class: 'card' }, h('div', { class: 'card__head' }, h('div', { class: 'card__title' }, 'Ayuda')),
        h('div', { class: 'card__body row' }, button('Atajos de teclado', { icon: 'list', onClick: () => app.showShortcuts() }), button('Buscar y ejecutar comandos', { icon: 'search', onClick: () => app.openPalette() }))),
      h('section', { class: 'card' }, h('div', { class: 'card__head' }, h('div', { class: 'card__title' }, 'Acerca de')), h('div', { class: 'card__body' }, info)))));

  loadInfo();
  checkHealth();
  paintPrefs();
  return { destroy() { destroyed = true; stopUpdates(); } };
}
