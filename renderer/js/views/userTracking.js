// Pestañas "Seguimiento" y "Notas" del panel de cada alumno.
import { h, mount, svg } from '../lib/h.js';
import { icon } from '../lib/icons.js';
import { api, errorMessage } from '../lib/api.js';
import { button, badge, emptyState, errorBox, loadingBlock, notify, confirmDialog, textArea, withBusy } from '../lib/ui.js';
import { loadActivity, inactivityState } from '../lib/data.js';
import { timeAgo, formatDate, formatDateTime, whatsappUrl, plural } from '../lib/format.js';
import { getTemplate, renderTemplate } from '../lib/templates.js';

const unavailable = (error) => error?.status === 400 || error?.status === 404;
const needsUpdate = () => emptyState({ icon: 'info', title: 'Esta función necesita el servidor actualizado', text: 'Cuando el servidor tenga la última versión, vas a verla acá.' });

// ─── Gráfico de barras: días de rutina completados por semana ───
function adherenceChart(weeks, planned) {
  const width = 560; const height = 170; const padL = 28; const padB = 26; const padT = 14;
  const max = Math.max(planned || 0, ...weeks.map((w) => w.completed), 3);
  const slot = (width - padL) / weeks.length;
  const barW = Math.min(34, slot * 0.6);
  const y = (v) => padT + (height - padT - padB) * (1 - v / max);

  const el = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart', role: 'img', 'aria-label': 'Días de rutina completados por semana' });
  for (let v = 0; v <= max; v += Math.max(1, Math.ceil(max / 4))) {
    el.appendChild(svg('line', { x1: padL, x2: width, y1: y(v), y2: y(v), stroke: 'rgba(236,232,220,0.1)' }));
    const label = svg('text', { x: padL - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'chart__axis' }); label.textContent = String(v); el.appendChild(label);
  }
  weeks.forEach((w, i) => {
    const x = padL + slot * i + (slot - barW) / 2;
    const top = y(w.completed);
    const bar = svg('rect', { x, y: top, width: barW, height: Math.max(2, y(0) - top), rx: 4, class: w.completed >= planned && planned > 0 ? 'chart__bar is-full' : 'chart__bar' });
    const tip = svg('title', {}); tip.textContent = `Semana del ${formatDate(w.weekStart)}: ${plural(w.completed, 'día', 'días')}`; bar.appendChild(tip);
    el.appendChild(bar);
    const value = svg('text', { x: x + barW / 2, y: top - 4, 'text-anchor': 'middle', class: 'chart__value' }); value.textContent = w.completed ? String(w.completed) : ''; el.appendChild(value);
    const label = svg('text', { x: x + barW / 2, y: height - 8, 'text-anchor': 'middle', class: 'chart__axis' });
    const d = new Date(`${w.weekStart}T00:00:00`); label.textContent = `${d.getDate()}/${d.getMonth() + 1}`; el.appendChild(label);
  });
  if (planned > 0) {
    el.appendChild(svg('line', { x1: padL, x2: width, y1: y(planned), y2: y(planned), stroke: 'var(--brass)', 'stroke-dasharray': '5 4', 'stroke-width': 1.5 }));
    const goal = svg('text', { x: width, y: y(planned) - 4, 'text-anchor': 'end', class: 'chart__goal' }); goal.textContent = `Rutina: ${planned} por semana`; el.appendChild(goal);
  }
  return el;
}

export async function trackingTab(host, user, isActive) {
  mount(host, loadingBlock('Cargando seguimiento…'));
  try {
    const [adherence, activity, audit] = await Promise.all([
      api.get(`/api/admin/users/${user.id}/adherence`, { weeks: 8 }),
      loadActivity(),
      api.get('/api/admin/audit', { entity_type: 'user', entity_id: user.id, limit: 12 }).catch(() => ({ items: [] })),
    ]);
    if (!isActive()) return;

    const state = inactivityState(user, activity);
    const row = activity.byUser[String(user.id)] || {};
    const weeks = adherence.weeks || [];
    const planned = adherence.plannedPerWeek || 0;
    const thisWeek = weeks[weeks.length - 1]?.completed || 0;
    const total8 = weeks.reduce((sum, w) => sum + w.completed, 0);

    const statBox = (label, value, sub, tone) => h('div', { class: ['stat', tone && `stat--${tone}`] }, h('div', { class: 'stat__label' }, label), h('div', { class: 'stat__value num', style: { fontSize: '1.5rem' } }, value), h('div', { class: 'stat__sub' }, sub));
    const lastWorkout = row.last_workout_at || null;
    const wa = whatsappUrl(user.phone, renderTemplate(getTemplate('inactive'), user, { days: state.days ?? 7 }));

    mount(host, h('div', { class: 'drawer__pad col gap-16' },
      state.kind === 'inactive' || state.kind === 'never'
        ? h('div', { class: 'notice notice--warn' }, icon('alert', 16), h('div', { class: 'grow' }, state.kind === 'never' ? 'Todavía no registró ningún entrenamiento.' : `Hace ${state.days} días que no entrena.`), wa ? button('Escribirle', { size: 'sm', icon: 'chat', onClick: () => window.ft.openExternal(wa) }) : null)
        : null,
      h('div', { class: 'stat-row stat-row--3' },
        statBox('Último entrenamiento', lastWorkout ? timeAgo(lastWorkout) : 'Sin registros', lastWorkout ? formatDate(lastWorkout) : 'Aparece cuando marca un día de su rutina'),
        statBox('Esta semana', planned ? `${thisWeek} / ${planned}` : String(thisWeek), planned ? 'días de rutina completados' : 'días completados', planned && thisWeek >= planned ? 'brass' : undefined),
        statBox('Últimas 8 semanas', String(total8), `${plural(row.workouts_30d || 0, 'día', 'días')} en los últimos 30`)),
      h('section', { class: 'section' },
        h('div', { class: 'section__title' }, 'Días de rutina completados por semana'),
        weeks.some((w) => w.completed) ? adherenceChart(weeks, planned) : h('p', { class: 'faint' }, 'Todavía no hay entrenamientos marcados en las últimas 8 semanas.')),
      h('section', { class: 'section' },
        h('div', { class: 'section__title' }, 'Cambios recientes en este alumno'),
        (audit.items || []).length
          ? h('div', { class: 'list' }, audit.items.map((item) => h('div', { class: 'list__item', style: { padding: '9px 4px' } }, icon('pencil', 15), h('div', { class: 'grow' }, h('div', { class: 'trunc' }, item.action), h('div', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, `${item.admin_name || 'Sistema'} · ${formatDateTime(item.created_at)}`)))))
          : h('p', { class: 'faint' }, 'Sin cambios registrados todavía.'))));
  } catch (error) {
    if (!isActive()) return;
    mount(host, unavailable(error) ? h('div', { class: 'drawer__pad' }, needsUpdate()) : h('div', { class: 'drawer__pad' }, errorBox(errorMessage(error), () => trackingTab(host, user, isActive))));
  }
}

// ─── Notas privadas ───

export async function notesTab(host, user, isActive) {
  mount(host, loadingBlock('Cargando notas…'));
  let notes = [];
  try {
    notes = (await api.get(`/api/admin/users/${user.id}/notes`)).notes || [];
  } catch (error) {
    if (!isActive()) return;
    mount(host, unavailable(error) ? h('div', { class: 'drawer__pad' }, needsUpdate()) : h('div', { class: 'drawer__pad' }, errorBox(errorMessage(error), () => notesTab(host, user, isActive))));
    return;
  }
  if (!isActive()) return;

  const input = textArea({ rows: 3, placeholder: 'Lesiones, objetivos, horarios, cómo viene… Solo la ven los administradores.', 'aria-label': 'Nueva nota', maxlength: 4000 });
  const addBtn = button('Guardar nota', { variant: 'primary', icon: 'plus' });
  const listHost = h('div', { class: 'col gap-16' });
  let editingId = null;

  async function add() {
    const body = input.value.trim();
    if (!body) { input.focus(); return; }
    await withBusy(addBtn, async () => {
      try {
        const res = await api.post(`/api/admin/users/${user.id}/notes`, { body });
        notes = [res.note, ...notes];
        input.value = '';
        paintList();
      } catch (error) { notify.error(errorMessage(error)); }
    });
  }
  addBtn.addEventListener('click', add);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add(); } });

  async function patch(note, changes) {
    try {
      const res = await api.patch(`/api/admin/users/${user.id}/notes/${note.id}`, changes);
      notes = notes.map((n) => (n.id === note.id ? res.note : n));
      editingId = null;
      paintList();
    } catch (error) { notify.error(errorMessage(error)); }
  }

  async function remove(note) {
    if (!(await confirmDialog({ title: 'Eliminar nota', message: 'La nota se borra para todos los administradores.', confirmText: 'Eliminar', danger: true }))) return;
    try {
      await api.del(`/api/admin/users/${user.id}/notes/${note.id}`);
      notes = notes.filter((n) => n.id !== note.id);
      paintList();
    } catch (error) { notify.error(errorMessage(error)); }
  }

  function noteCard(note) {
    const meta = h('div', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, `${note.author_name || 'Administrador'} · ${timeAgo(note.created_at)}${note.updated_at && note.updated_at !== note.created_at ? ' · editada' : ''}`);
    if (editingId === note.id) {
      const edit = textArea({ rows: 4, value: note.body, maxlength: 4000, 'aria-label': 'Editar nota' });
      const save = button('Guardar', { size: 'sm', variant: 'primary' });
      save.addEventListener('click', () => { const body = edit.value.trim(); if (!body) { edit.focus(); return; } patch(note, { body }); });
      requestAnimationFrame(() => edit.focus());
      return h('div', { class: 'note-card is-editing' }, edit, h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, button('Cancelar', { size: 'sm', variant: 'ghost', onClick: () => { editingId = null; paintList(); } }), save));
    }
    return h('article', { class: ['note-card', note.pinned && 'is-pinned'] },
      h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'flex-start' } }, meta, h('div', { class: 'row', style: { gap: '0' } },
        button(note.pinned ? 'Quitar de fijadas' : 'Fijar arriba', { size: 'sm', variant: 'ghost', iconOnly: true, icon: 'link', onClick: () => patch(note, { pinned: !note.pinned }) }),
        button('Editar nota', { size: 'sm', variant: 'ghost', iconOnly: true, icon: 'pencil', onClick: () => { editingId = note.id; paintList(); } }),
        button('Eliminar nota', { size: 'sm', variant: 'ghost', iconOnly: true, icon: 'trash', onClick: () => remove(note) }))),
      note.pinned ? h('div', null, badge('Fijada', 'brass')) : null,
      h('div', { class: 'note-card__body selectable' }, note.body));
  }

  function paintList() {
    const sorted = [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.created_at) - new Date(a.created_at));
    mount(listHost, ...(sorted.length ? sorted.map(noteCard) : [emptyState({ icon: 'clipboard', title: 'Sin notas todavía', text: 'Anotá acá lo que no querés olvidar de este alumno: lesiones, objetivos, horarios.' })]));
  }
  paintList();

  mount(host, h('div', { class: 'drawer__pad col gap-16' }, h('div', { class: 'col', style: { gap: '8px' } }, input, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, 'Ctrl + Enter para guardar'), addBtn)), listHost));
}
