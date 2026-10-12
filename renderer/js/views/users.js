// Alumnos: lista completa con búsqueda instantánea, filtros, orden, selección
// múltiple y exportación. El detalle y la edición viven en un panel lateral.
import { h, mount } from '../lib/h.js';
import { icon } from '../lib/icons.js';
import { errorMessage, api } from '../lib/api.js';
import { button, badge, avatar, checkInput, emptyState, errorBox, loadingBlock, notify, segmented, textInput } from '../lib/ui.js';
import { loadUsers, loadActivity, inactivityState, patchCached, upsertCached, removeCached, expirationState, onInvalidate } from '../lib/data.js';
import { openReminders } from './reminders.js';
import { fullName, formatDate, normalize, debounce, toCsv, relativeDays, toDateKey, plural, formatNumber } from '../lib/format.js';
import { openUserDrawer, openCreateUserModal } from './userDrawer.js';

const FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'soon', label: 'Por vencer' },
  { value: 'expired', label: 'Vencidos' },
  { value: 'inactive', label: 'Sin entrenar' },
  { value: 'noapp', label: 'Sin app' },
  { value: 'admins', label: 'Admins' },
];

const PAGE_STEP = 100;

const SORTS = {
  name: (u) => normalize(fullName(u)),
  doc: (u) => String(u.username || ''),
  created: (u) => new Date(u.created_at).getTime() || 0,
  expires: (u) => toDateKey(u.expires_at) || '9999-99-99',
  app: (u) => (u.mobile_enabled ? 1 : 0),
};

// Última actividad de los alumnos (la carga la pantalla; si el servidor no la ofrece queda vacía)
let activityData = { available: false, byUser: {} };

function matchesFilter(user, filter) {
  const kind = expirationState(user).kind;
  switch (filter) {
    case 'soon': return kind === 'soon';
    case 'inactive': return ['inactive', 'never'].includes(inactivityState(user, activityData).kind);
    case 'expired': return kind === 'expired';
    case 'noapp': return !user.mobile_enabled && String(user.role).toLowerCase() !== 'admin';
    case 'admins': return String(user.role).toLowerCase() === 'admin';
    default: return true;
  }
}

function activityBadge(user) {
  const state = inactivityState(user, activityData);
  if (state.kind === 'inactive') return badge(`Hace ${state.days} d`, 'warn', { dot: true });
  if (state.kind === 'never') return badge('Sin entrenos', 'neutral');
  if (state.kind === 'active') return h('span', { class: 'muted num' }, state.days === 0 ? 'Hoy' : `Hace ${state.days} d`);
  return h('span', { class: 'faint' }, '—');
}

function expiryBadge(user) {
  const state = expirationState(user);
  if (state.kind === 'none') return h('span', { class: 'faint' }, 'Sin vencimiento');
  const variant = state.kind === 'expired' ? 'danger' : state.kind === 'soon' ? 'warn' : 'neutral';
  return h('div', { class: 'col', style: { gap: '2px' } }, h('span', { class: 'num' }, formatDate(user.expires_at)), badge(relativeDays(user.expires_at), variant));
}

export function usersView(container, params, app) {
  let users = [];
  let filter = FILTERS.some((f) => f.value === params.query?.filter) ? params.query.filter : 'all';
  let query = '';
  let sort = { key: 'created', dir: 'desc' };
  let visible = PAGE_STEP;
  const selected = new Set();
  let destroyed = false;
  let drawer = null;
  let lastRows = [];

  const searchInput = textInput({ type: 'search', placeholder: 'Buscar por nombre, email, teléfono o documento…', 'aria-label': 'Buscar alumnos', style: { paddingLeft: '34px' } });
  const segments = segmented(FILTERS.map((f) => ({ ...f, count: 0 })), filter, (value) => { filter = value; visible = PAGE_STEP; paintTable(); });
  const bulkBar = h('div', { class: 'bulkbar hidden' });
  const tableHost = h('div');

  const exportBtn = button('Exportar CSV', { icon: 'download', onClick: () => exportCsv(false) });
  const newBtn = button('Nuevo alumno', { variant: 'primary', icon: 'plus', onClick: () => openCreate() });

  const page = h(
    'div',
    { class: 'page' },
    h('div', { class: 'page__head' }, h('div', null, h('h1', { class: 'page__title' }, 'Alumnos'), h('p', { class: 'page__sub' }, 'Todos tus alumnos en un solo lugar: quién vence, quién no tiene la app y a quién escribirle hoy.')), h('div', { class: 'page__actions' }, button('Avisar', { icon: 'chat', title: 'Avisar por WhatsApp a vencidos, por vencer o sin entrenar', onClick: () => openReminders({ kind: 'soon' }) }), exportBtn, newBtn)),
    h('div', { class: 'toolbar' }, h('div', { class: 'input-icon grow', style: { maxWidth: '460px' } }, icon('search', 16), searchInput), segments),
    bulkBar,
    tableHost
  );
  mount(container, page);
  app.setNewAction('Nuevo alumno', () => openCreate());

  searchInput.addEventListener('input', debounce(() => { query = normalize(searchInput.value.trim()); visible = PAGE_STEP; paintTable(); }, 120));

  // ─── Datos ───
  async function load({ force = false } = {}) {
    mount(tableHost, loadingBlock('Cargando alumnos…'));
    try {
      users = await loadUsers({ force });
      if (destroyed) return;
      paintTable();
      handleParams(params);
      // la actividad llega aparte para no demorar la lista
      loadActivity({ force }).then((data) => { activityData = data; if (!destroyed) paintTable(); }).catch(() => {});
    } catch (error) {
      if (destroyed) return;
      mount(tableHost, errorBox(errorMessage(error), () => load({ force: true })));
    }
  }

  function filtered() {
    const key = SORTS[sort.key] || SORTS.created;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return users
      .filter((u) => matchesFilter(u, filter))
      .filter((u) => !query || normalize([fullName(u), u.email, u.phone, u.username].join(' ')).includes(query))
      .sort((a, b) => {
        const av = key(a); const bv = key(b);
        return (av < bv ? -1 : av > bv ? 1 : 0) * factor;
      });
  }

  function paintCounts() {
    FILTERS.forEach((f) => segments.setCount(f.value, users.filter((u) => matchesFilter(u, f.value)).length));
  }

  function toggleSort(key) {
    sort = { key, dir: sort.key === key && sort.dir === 'asc' ? 'desc' : 'asc' };
    paintTable();
  }

  function th(label, key, extraClass) {
    const sortable = Boolean(key);
    return h('th', { class: [sortable && 'is-sortable', extraClass], 'aria-sort': sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined, onClick: sortable ? () => toggleSort(key) : undefined }, label, sort.key === key ? h('span', { class: 'sort' }, sort.dir === 'asc' ? '↑' : '↓') : null);
  }

  function paintBulk() {
    bulkBar.classList.toggle('hidden', selected.size === 0);
    if (selected.size === 0) return;
    const pickedNoApp = users.filter((u) => selected.has(u.id) && !u.mobile_enabled).length;
    mount(
      bulkBar,
      h('strong', null, plural(selected.size, 'seleccionado', 'seleccionados')),
      pickedNoApp ? button(`Habilitar app (${pickedNoApp})`, { size: 'sm', variant: 'secondary', icon: 'check', onClick: bulkEnableApp }) : null,
      button('Avisar a la selección', { size: 'sm', variant: 'secondary', icon: 'chat', onClick: () => openReminders({ kind: 'custom', selectedIds: new Set(selected) }) }),
      button('Exportar selección', { size: 'sm', variant: 'ghost', icon: 'download', onClick: () => exportCsv(true) }),
      h('span', { class: 'grow' }),
      button('Limpiar', { size: 'sm', variant: 'ghost', onClick: () => { selected.clear(); paintTable(); } })
    );
  }

  async function bulkEnableApp() {
    const targets = users.filter((u) => selected.has(u.id) && !u.mobile_enabled);
    if (!targets.length) return;
    let done = 0; let failed = 0;
    const queue = [...targets];
    const okIds = [];
    const worker = async () => {
      while (queue.length) {
        const user = queue.shift();
        try { await api.patch(`/api/admin/users/${user.id}/mobile-access`, { enabled: true }); done += 1; okIds.push(user.id); } catch (_e) { failed += 1; }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    // Se actualiza la lista local con lo confirmado; no hace falta volver a bajarla entera.
    okIds.forEach((id) => patchCached('users', id, { mobile_enabled: true }));
    if (failed) notify.warn(`Se habilitó la app para ${done} alumnos. ${failed} no se pudieron actualizar.`);
    else notify.ok(`Listo: ${plural(done, 'alumno ya puede', 'alumnos ya pueden')} entrar a la app.`);
    selected.clear();
    users = await loadUsers();
    paintTable();
  }

  function paintTable() {
    if (destroyed) return;
    paintCounts();
    const rows = filtered();
    lastRows = rows;
    paintBulk();

    if (!users.length) {
      mount(tableHost, emptyState({ icon: 'users', title: 'Todavía no hay alumnos', text: 'Cuando alguien se registre desde la app o la web, va a aparecer acá. También podés dar de alta a un alumno vos.', action: button('Nuevo alumno', { variant: 'primary', icon: 'plus', onClick: () => openCreate() }) }));
      return;
    }
    if (!rows.length) {
      mount(tableHost, h('div', { class: 'table-wrap' }, emptyState({ icon: 'search', title: 'Sin resultados', text: query ? 'Ningún alumno coincide con tu búsqueda. Probá con otro nombre, email o documento.' : 'No hay alumnos en este filtro.', action: button('Ver todos', { onClick: () => { filter = 'all'; query = ''; searchInput.value = ''; segments.set('all'); paintTable(); } }) })));
      return;
    }

    const shown = rows.slice(0, visible);
    const allShownSelected = shown.every((u) => selected.has(u.id));
    const headerCheck = checkInput({ checked: allShownSelected, indeterminate: !allShownSelected && shown.some((u) => selected.has(u.id)), 'aria-label': 'Seleccionar todos los visibles', onChange: (on) => { shown.forEach((u) => (on ? selected.add(u.id) : selected.delete(u.id))); paintTable(); } });

    const table = h(
      'table',
      { class: 'table' },
      h('thead', null, h('tr', null, h('th', { style: { width: '44px' } }, headerCheck), th('Alumno', 'name'), th('Documento', 'doc'), th('Teléfono'), th('Alta', 'created'), th('Vencimiento', 'expires'), th('Actividad'), th('App', 'app'))),
      h(
        'tbody',
        null,
        shown.map((u) => {
          const isAdmin = String(u.role).toLowerCase() === 'admin';
          return h(
            'tr',
            { class: ['is-clickable', selected.has(u.id) && 'is-selected'], tabindex: 0, onClick: () => app.navigate(`users/${u.id}`), onKeydown: (e) => { if (e.key === 'Enter') app.navigate(`users/${u.id}`); } },
            h('td', null, checkInput({ checked: selected.has(u.id), 'aria-label': `Seleccionar a ${fullName(u)}`, onChange: (on) => { on ? selected.add(u.id) : selected.delete(u.id); paintBulk(); } })),
            h('td', null, h('div', { class: 'cell-user' }, avatar(u), h('div', { class: 'cell-user__text' }, h('div', { class: 'cell-name' }, fullName(u), isAdmin ? h('span', { style: { marginLeft: '8px' } }, badge('Admin', 'brass')) : null), h('div', { class: 'cell-sub' }, u.email)))),
            h('td', { class: 'mono', style: { fontSize: 'var(--fs-sm)' } }, u.username ? `${String(u.document_type || '').toUpperCase() === 'PASAPORTE' ? 'PAS' : 'DNI'} ${u.username}` : '—'),
            h('td', { class: 'num' }, u.phone || '—'),
            h('td', { class: 'num muted' }, formatDate(u.created_at)),
            h('td', null, expiryBadge(u)),
            h('td', null, activityBadge(u)),
            h('td', null, isAdmin ? h('span', { class: 'faint' }, '—') : u.mobile_enabled ? badge('Activa', 'ok', { dot: true }) : badge('Sin acceso', 'neutral'))
          );
        })
      )
    );

    mount(
      tableHost,
      h(
        'div',
        { class: 'table-wrap' },
        h('div', { class: 'table-scroll' }, table),
        h('div', { class: 'table-foot' }, h('span', null, `Mostrando ${formatNumber(shown.length)} de ${formatNumber(rows.length)}${rows.length !== users.length ? ` (de ${formatNumber(users.length)} en total)` : ''}`), shown.length < rows.length ? button(`Mostrar ${Math.min(PAGE_STEP, rows.length - shown.length)} más`, { size: 'sm', variant: 'ghost', onClick: () => { visible += PAGE_STEP; paintTable(); } }) : h('span'))
      )
    );
  }

  // ─── Acciones ───
  async function exportCsv(onlySelected) {
    const list = onlySelected ? users.filter((u) => selected.has(u.id)) : lastRows.length ? lastRows : users;
    const csv = toCsv(
      ['Nombre', 'Apellido', 'Email', 'Teléfono', 'Tipo de documento', 'Documento', 'Alta', 'Vencimiento', 'Acceso a la app', 'Rol', 'Días sin entrenar'],
      list.map((u) => [u.name, u.surname, u.email, u.phone, u.document_type, u.username, toDateKey(u.created_at), toDateKey(u.expires_at), u.mobile_enabled ? 'Sí' : 'No', u.role, inactivityState(u, activityData).days ?? ''])
    );
    const result = await window.ft.saveCsv({ defaultName: `alumnos-${new Date().toISOString().slice(0, 10)}.csv`, content: csv });
    if (result.ok && !result.data.canceled) {
      notify.ok(`Se exportaron ${plural(list.length, 'alumno', 'alumnos')}.`, { action: { label: 'Mostrar', onClick: () => window.ft.reveal(result.data.filePath) } });
    } else if (!result.ok) {
      notify.error(errorMessage(result.error));
    }
  }

  function openCreate() {
    openCreateUserModal({ app, onCreated: (user) => { upsertCached('users', user, { prepend: true }); app.navigate(`users/${user.id}`); } });
  }

  function handleParams(p) {
    params = p;
    if (p.id === 'new') {
      openCreate();
      app.navigate('users', { replace: true });
      return;
    }
    if (p.id) {
      const user = users.find((u) => String(u.id) === String(p.id));
      if (drawer) drawer.close(true);
      if (!user) { notify.warn('No encontramos a ese alumno. Puede que ya no exista.'); app.navigate('users', { replace: true }); return; }
      app.setCrumbs([{ label: 'Alumnos', href: 'users' }, { label: fullName(user) }]);
      drawer = openUserDrawer({
        user,
        app,
        onChanged: (changed) => { patchCached('users', changed.id, changed); },
        onDeleted: (id) => { removeCached('users', id); },
        onClose: (silent) => {
          drawer = null;
          if (!silent && !destroyed) { app.setCrumbs([{ label: 'Alumnos' }]); app.navigate('users', { replace: true }); }
        },
      });
    } else if (drawer) {
      drawer.close(true);
    }
  }

  const stopListening = onInvalidate((keys) => { if (keys.includes('users') && !destroyed && users.length) { loadUsers().then((list) => { users = list; paintTable(); }).catch(() => {}); } });

  load();

  return {
    onParams: (p) => { if (users.length) handleParams(p); else params = p; },
    refresh: () => load({ force: true }),
    destroy() { destroyed = true; stopListening(); drawer?.close(true); app.setNewAction(null); },
  };
}
