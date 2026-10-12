// Paleta de comandos (Ctrl+K): salta a cualquier sección, alumno, plan o ejercicio
// y ejecuta acciones sin tocar el mouse.
import { h } from './lib/h.js';
import { icon } from './lib/icons.js';
import { normalize, fullName } from './lib/format.js';
import { loadUsers, loadPlans, loadExercises, loadContacts, peek } from './lib/data.js';
import { openReminders } from './views/reminders.js';

let openPaletteEl = null;

function scoreOf(haystack, needle) {
  if (!needle) return 1;
  const text = normalize(haystack);
  if (text === needle) return 100;
  if (text.startsWith(needle)) return 80;
  if (text.split(/\s+/).some((w) => w.startsWith(needle))) return 60;
  if (text.includes(needle)) return 40;
  return 0;
}

export function openPalette(app) {
  if (openPaletteEl) { openPaletteEl.focusInput(); return; }
  const previousFocus = document.activeElement;

  // Los datos se piden en segundo plano; si ya están en caché, aparecen al instante.
  const data = { users: peek('users') || [], plans: peek('plans') || [], exercises: peek('exercises') || [], contacts: peek('contacts') || [] };
  Promise.allSettled([loadUsers(), loadPlans(), loadExercises(), loadContacts()]).then(([u, p, e, c]) => {
    if (u.status === 'fulfilled') data.users = u.value;
    if (p.status === 'fulfilled') data.plans = p.value;
    if (e.status === 'fulfilled') data.exercises = e.value;
    if (c.status === 'fulfilled') data.contacts = c.value;
    if (openPaletteEl) rerender();
  });

  const go = (path) => () => app.navigate(path);
  const commands = [
    { group: 'Ir a', label: 'Hoy', sub: 'Vencimientos y novedades', icon: 'sun', run: go('home'), keys: 'inicio hoy resumen' },
    { group: 'Ir a', label: 'Alumnos', sub: 'Lista, vencimientos y accesos', icon: 'users', run: go('users'), keys: 'usuarios clientes' },
    { group: 'Ir a', label: 'Planes', sub: 'Entrenamiento y alimentación', icon: 'clipboard', run: go('plans'), keys: 'rutinas' },
    { group: 'Ir a', label: 'Ejercicios', sub: 'Catálogo y papelera', icon: 'dumbbell', run: go('exercises'), keys: 'catalogo' },
    { group: 'Ir a', label: 'Tienda', sub: 'Productos y pedidos', icon: 'bag', run: go('store'), keys: 'productos pedidos' },
    { group: 'Ir a', label: 'Pagos', sub: 'Cobros de planes y tienda', icon: 'card', run: go('payments'), keys: 'cobros ingresos' },
    { group: 'Ir a', label: 'Mensajes', sub: 'Lo que escriben desde Contacto', icon: 'mail', run: go('contacts'), keys: 'contacto consultas' },
    { group: 'Ir a', label: 'Ajustes', sub: 'Cuenta, servidor y atajos', icon: 'sliders', run: go('settings'), keys: 'configuracion' },
    { group: 'Acciones', label: 'Nuevo alumno', icon: 'plus', run: () => app.navigate('users/new'), keys: 'crear alta usuario' },
    { group: 'Acciones', label: 'Nuevo plan de entrenamiento', icon: 'plus', run: () => app.navigate('plans/new?category=training'), keys: 'crear rutina' },
    { group: 'Acciones', label: 'Nuevo plan de alimentación', icon: 'plus', run: () => app.navigate('plans/new?category=nutrition'), keys: 'crear nutricion dieta' },
    { group: 'Acciones', label: 'Nuevo ejercicio', icon: 'plus', run: () => app.navigate('exercises/new'), keys: 'crear catalogo' },
    { group: 'Acciones', label: 'Nuevo producto', icon: 'plus', run: () => app.navigate('store/new'), keys: 'crear tienda' },
    { group: 'Acciones', label: 'Avisar a alumnos por WhatsApp', sub: 'Por vencer, vencidos, sin entrenar', icon: 'chat', run: () => openReminders({ kind: 'soon' }), keys: 'mensaje aviso recordatorio whatsapp' },
    { group: 'Acciones', label: 'Avisar a los que no entrenan', icon: 'chat', run: () => openReminders({ kind: 'inactive' }), keys: 'inactivos ausentes' },
    { group: 'Acciones', label: 'Actualizar datos', sub: 'Vuelve a pedirlos al servidor', icon: 'refresh', run: () => app.refreshAll(), keys: 'recargar' },
    { group: 'Acciones', label: 'Atajos de teclado', icon: 'list', run: () => app.showShortcuts(), keys: 'ayuda' },
    { group: 'Acciones', label: 'Cerrar sesión', icon: 'logout', run: () => app.logout(), keys: 'salir' },
  ];

  let query = '';
  let results = [];
  let active = 0;

  const input = h('input', { type: 'text', placeholder: 'Buscar alumnos, planes, ejercicios o acciones…', 'aria-label': 'Buscar', autocomplete: 'off', spellcheck: 'false' });
  const list = h('div', { class: 'palette__list', role: 'listbox' });

  function compute() {
    const needle = normalize(query.trim());
    const out = [];

    commands.forEach((c) => {
      const s = Math.max(scoreOf(c.label, needle), scoreOf(c.keys || '', needle) * 0.7);
      if (s > 0) out.push({ ...c, score: s + (needle ? 0 : 0) });
    });

    if (needle.length >= 2) {
      data.users.forEach((u) => {
        const s = Math.max(scoreOf(fullName(u), needle), scoreOf(u.email, needle) * 0.9, scoreOf(u.username, needle) * 0.9, scoreOf(u.phone, needle) * 0.8);
        if (s > 0) out.push({ group: 'Alumnos', label: fullName(u), sub: [u.email, u.username && `Doc. ${u.username}`].filter(Boolean).join(' · '), icon: 'user', run: () => app.navigate(`users/${u.id}`), score: s });
      });
      data.plans.forEach((p) => {
        const s = scoreOf(p.title, needle);
        if (s > 0) out.push({ group: 'Planes', label: p.title, sub: p.category === 'nutrition' ? 'Alimentación' : 'Entrenamiento', icon: 'clipboard', run: () => app.navigate(`plans/${p.id}`), score: s });
      });
      data.exercises.forEach((x) => {
        const s = Math.max(scoreOf(x.name, needle), scoreOf(x.category || '', needle) * 0.6);
        if (s > 0) out.push({ group: 'Ejercicios', label: x.name, sub: x.category || 'Catálogo', icon: 'dumbbell', run: () => app.navigate(`exercises/${x.id}`), score: s });
      });
      data.contacts.forEach((c) => {
        const s = Math.max(scoreOf(c.name, needle), scoreOf(c.email, needle) * 0.9);
        if (s > 0) out.push({ group: 'Mensajes', label: c.name, sub: c.email, icon: 'mail', run: () => app.navigate(`contacts/${c.id}`), score: s });
      });
    }

    const order = ['Ir a', 'Acciones', 'Alumnos', 'Planes', 'Ejercicios', 'Mensajes'];
    // Con texto escrito, manda la coincidencia; sin texto, el orden natural por grupo.
    out.sort((a, b) => (needle ? b.score - a.score : 0) || order.indexOf(a.group) - order.indexOf(b.group));
    return needle ? out.slice(0, 40) : out;
  }

  function rerender() {
    results = compute();
    if (active >= results.length) active = Math.max(0, results.length - 1);
    list.replaceChildren();
    if (!results.length) {
      list.appendChild(h('div', { class: 'empty', style: { padding: '32px' } }, h('div', { class: 'empty__text' }, `Nada coincide con “${query}”. Probá con otro nombre, email o documento.`)));
      return;
    }
    let lastGroup = null;
    results.forEach((item, index) => {
      if (item.group !== lastGroup) {
        list.appendChild(h('div', { class: 'palette__group' }, item.group));
        lastGroup = item.group;
      }
      const el = h(
        'button',
        { type: 'button', class: ['palette__item', index === active && 'is-active'], role: 'option', 'aria-selected': String(index === active), dataset: { index }, onMousemove: () => setActive(index, false), onClick: () => choose(index) },
        icon(item.icon, 18),
        h('div', { class: 'palette__label' }, h('div', { class: 'trunc' }, item.label), item.sub ? h('div', { class: 'palette__sub trunc' }, item.sub) : null)
      );
      list.appendChild(el);
    });
  }

  function setActive(index, scroll = true) {
    if (index === active) return;
    active = index;
    list.querySelectorAll('.palette__item').forEach((el) => {
      const on = Number(el.dataset.index) === active;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-selected', String(on));
      if (on && scroll) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function close() {
    overlay.remove();
    openPaletteEl = null;
    document.removeEventListener('keydown', onKey, true);
    if (previousFocus && previousFocus.focus) previousFocus.focus();
  }

  function choose(index) {
    const item = results[index];
    if (!item) return;
    close();
    item.run();
  }

  function onKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setActive(Math.min(results.length - 1, active + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(Math.max(0, active - 1)); }
    else if (event.key === 'Enter') { event.preventDefault(); choose(active); }
  }

  input.addEventListener('input', () => { query = input.value; active = 0; rerender(); });
  document.addEventListener('keydown', onKey, true);

  const overlay = h(
    'div',
    { class: 'overlay palette-overlay', onMousedown: (e) => { if (e.target === overlay) close(); } },
    h(
      'div',
      { class: 'palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Paleta de comandos' },
      h('div', { class: 'palette__input' }, icon('search', 20), input),
      list,
      h('div', { class: 'palette__foot' }, h('span', null, h('span', { class: 'kbd' }, '↑'), ' ', h('span', { class: 'kbd' }, '↓'), ' moverse'), h('span', null, h('span', { class: 'kbd' }, 'Enter'), ' abrir'), h('span', null, h('span', { class: 'kbd' }, 'Esc'), ' cerrar'))
    )
  );
  document.body.appendChild(overlay);
  openPaletteEl = { focusInput: () => input.focus() };
  rerender();
  input.focus();
}
