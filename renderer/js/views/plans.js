// Planes: biblioteca de rutinas y planes de alimentación, con duplicado, asignación masiva y borrado seguro.
import { h, mount } from '../lib/h.js';
import { icon } from '../lib/icons.js';
import { api, errorMessage } from '../lib/api.js';
import { button, badge, avatar, checkInput, emptyState, errorBox, loadingBlock, notify, openModal, confirmDialog, promptDialog, segmented, textInput, field, withBusy } from '../lib/ui.js';
import { loadPlans, loadUsers, upsertCached, removeCached, onInvalidate } from '../lib/data.js';
import { formatDate, normalize, debounce, fullName, plural, todayKey, toDateKey } from '../lib/format.js';

export function planStats(plan) {
  const days = plan.content_json?.days;
  if (!Array.isArray(days)) return null;
  const exercises = days.reduce((sum, d) => sum + (Array.isArray(d.exercises) ? d.exercises.length : 0), 0);
  return { days: days.length, exercises };
}

function planCard({ plan, app, onDuplicate, onAssign, onDelete }) {
  const isNutrition = plan.category === 'nutrition';
  const stats = planStats(plan);
  const meta = [];
  if (stats) meta.push(`${plural(stats.days, 'día', 'días')} · ${plural(stats.exercises, 'ejercicio', 'ejercicios')}`);
  else if (isNutrition) meta.push('Plan de texto');
  else meta.push('Formato de texto');
  const creator = [plan.creator_name, plan.creator_surname].filter(Boolean).join(' ');

  const open = () => app.navigate(`plans/${plan.id}`);
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };

  return h(
    'article',
    { class: 'plan-card is-clickable', tabindex: 0, onClick: open, onKeydown: (e) => { if (e.key === 'Enter') open(); }, 'aria-label': `Abrir plan ${plan.title}` },
    h('div', { class: 'plan-card__top' }, h('span', { class: ['plan-card__icon', isNutrition && 'is-nutrition'] }, icon(isNutrition ? 'flame' : 'dumbbell', 20)), badge(isNutrition ? 'Alimentación' : 'Entrenamiento', isNutrition ? 'ok' : 'brass')),
    h('h3', { class: 'plan-card__title' }, plan.title),
    h('p', { class: 'plan-card__desc' }, plan.description || 'Sin descripción.'),
    h('div', { class: 'plan-card__meta' }, h('span', null, meta.join(' · ')), h('span', { class: 'faint' }, `${creator ? `${creator} · ` : ''}${formatDate(plan.updated_at || plan.created_at)}`)),
    h('div', { class: 'plan-card__actions' },
      button('Asignar', { size: 'sm', variant: 'secondary', icon: 'users', onClick: stop(() => onAssign(plan)) }),
      h('span', { class: 'grow' }),
      button('Duplicar', { size: 'sm', variant: 'ghost', iconOnly: true, icon: 'copy', onClick: stop(() => onDuplicate(plan)) }),
      button('Eliminar', { size: 'sm', variant: 'ghost', iconOnly: true, icon: 'trash', onClick: stop(() => onDelete(plan)) })
    )
  );
}

// ─── Alumnos del plan (ver, asignar y quitar) ───────────────────────────────

export async function openAssignees(plan) {
  const listHost = h('div', { class: 'col', style: { gap: '4px' } }, loadingBlock('Cargando alumnos…'));
  const searchInput = textInput({ type: 'search', placeholder: 'Buscar alumnos para asignar…', 'aria-label': 'Buscar alumnos' });
  const expires = textInput({ type: 'date', min: todayKey() });
  const chosen = new Set();
  let assigned = [];
  let allUsers = [];
  const assignBtn = button('Asignar seleccionados', { variant: 'primary', icon: 'check', disabled: true });

  const modal = openModal({
    title: plan.title,
    subtitle: 'Alumnos que tienen este plan',
    size: 'lg',
    body: h('div', { class: 'col gap-16' }, h('div', { class: 'section' }, h('div', { class: 'section__title' }, 'Asignados'), h('div', { id: 'assigned-host' })), h('div', { class: 'section' }, h('div', { class: 'section__title' }, 'Asignar a más alumnos'), h('div', { class: 'grid-form' }, h('div', { class: 'input-icon' }, icon('search', 16), searchInput), field('Vence el (opcional)', expires)), listHost)),
    footer: [button('Cerrar', { variant: 'ghost', onClick: () => modal.close() }), assignBtn],
  });
  const assignedHost = modal.el.querySelector('#assigned-host');

  async function reload() {
    try {
      [assigned, allUsers] = await Promise.all([api.get(`/api/admin/plans/${plan.id}/assignees`).then((d) => d.users || []), loadUsers()]);
    } catch (error) { mount(listHost, errorBox(errorMessage(error), reload)); return; }
    paintAssigned(); paintCandidates();
  }

  function paintAssigned() {
    mount(assignedHost, ...(assigned.length ? [h('div', { class: 'assignee-chips' }, assigned.map((u) => h('span', { class: 'chip' }, avatar(u, 'sm'), h('span', null, fullName(u)), h('button', { type: 'button', class: 'chip__x', 'aria-label': `Quitar a ${fullName(u)}`, onClick: async () => {
      if (!(await confirmDialog({ title: 'Quitar del plan', message: `${fullName(u)} dejará de ver “${plan.title}”.`, confirmText: 'Quitar', danger: true }))) return;
      try { await api.del(`/api/admin/plans/assign/${u.id}/${plan.id}`); notify.ok('Alumno quitado del plan.'); reload(); } catch (error) { notify.error(errorMessage(error)); }
    } }, icon('x', 13)))))] : [h('p', { class: 'faint' }, 'Todavía no está asignado a nadie.')]));
  }

  function paintCandidates() {
    const assignedIds = new Set(assigned.map((u) => u.id));
    const q = normalize(searchInput.value.trim());
    const candidates = allUsers.filter((u) => !assignedIds.has(u.id) && String(u.role).toLowerCase() !== 'admin').filter((u) => !q || normalize([fullName(u), u.email, u.username].join(' ')).includes(q)).slice(0, 60);
    assignBtn.disabled = chosen.size === 0;
    assignBtn.lastChild.textContent = chosen.size ? `Asignar (${chosen.size})` : 'Asignar seleccionados';
    mount(listHost, ...(candidates.length ? candidates.map((u) => h('label', { class: 'list__item', style: { padding: '8px 10px', cursor: 'pointer', borderRadius: '8px' } }, checkInput({ checked: chosen.has(u.id), onChange: (on) => { on ? chosen.add(u.id) : chosen.delete(u.id); paintCandidates(); } }), avatar(u, 'sm'), h('div', { class: 'grow' }, h('div', { class: 'cell-name trunc' }, fullName(u)), h('div', { class: 'cell-sub' }, u.email)))) : [h('p', { class: 'faint', style: { padding: '8px' } }, q ? 'Ningún alumno coincide.' : 'No quedan alumnos para asignar.')]));
  }

  searchInput.addEventListener('input', debounce(paintCandidates, 120));
  assignBtn.addEventListener('click', () => withBusy(assignBtn, async () => {
    let ok = 0; let failed = 0;
    for (const id of [...chosen]) {
      try { await api.post(`/api/admin/plans/assign/${id}`, { planId: plan.id, expiresAt: expires.value || null }); ok += 1; chosen.delete(id); } catch (_e) { failed += 1; }
    }
    if (failed) notify.warn(`Se asignó a ${ok}. ${failed} no se pudieron asignar.`); else notify.ok(`Plan asignado a ${plural(ok, 'alumno', 'alumnos')}.`);
    reload();
  }));
  reload();
}

export function plansView(container, _params, app) {
  let plans = [];
  let category = 'all';
  let query = '';
  let destroyed = false;

  const searchInput = textInput({ type: 'search', placeholder: 'Buscar por título o descripción…', 'aria-label': 'Buscar planes' });
  const segments = segmented([{ value: 'all', label: 'Todos', count: 0 }, { value: 'training', label: 'Entrenamiento', count: 0 }, { value: 'nutrition', label: 'Alimentación', count: 0 }], category, (v) => { category = v; paint(); });
  const grid = h('div');

  const page = h(
    'div',
    { class: 'page' },
    h('div', { class: 'page__head' }, h('div', null, h('h1', { class: 'page__title' }, 'Planes'), h('p', { class: 'page__sub' }, 'Tu biblioteca de rutinas y planes de alimentación. Editá, duplicá o asignalos a tus alumnos.')), h('div', { class: 'page__actions' }, button('Plan de alimentación', { icon: 'plus', onClick: () => app.navigate('plans/new?category=nutrition') }), button('Plan de entrenamiento', { variant: 'primary', icon: 'plus', onClick: () => app.navigate('plans/new?category=training') }))),
    h('div', { class: 'toolbar' }, h('div', { class: 'input-icon grow', style: { maxWidth: '420px' } }, icon('search', 16), searchInput), segments),
    grid
  );
  mount(container, page);
  app.setNewAction('Plan de entrenamiento', () => app.navigate('plans/new?category=training'));
  searchInput.addEventListener('input', debounce(() => { query = normalize(searchInput.value.trim()); paint(); }, 120));

  async function load({ force = false } = {}) {
    mount(grid, loadingBlock('Cargando planes…'));
    try { plans = await loadPlans({ force }); if (!destroyed) paint(); }
    catch (error) { if (!destroyed) mount(grid, errorBox(errorMessage(error), () => load({ force: true }))); }
  }

  async function duplicate(plan) {
    const title = await promptDialog({ title: 'Duplicar plan', label: 'Nombre de la copia', value: `Copia de ${plan.title}`, confirmText: 'Duplicar' });
    if (title === null) return;
    if (!title.trim()) { notify.warn('El nombre no puede estar vacío.'); return; }
    try {
      const res = await api.post(`/api/admin/plans/${plan.id}/duplicate`, { title: title.trim() });
      upsertCached('plans', res.plan, { prepend: true });
      notify.ok('Plan duplicado.', { action: { label: 'Abrir', onClick: () => app.navigate(`plans/${res.plan.id}`) } });
    } catch (error) { notify.error(errorMessage(error)); }
  }

  async function remove(plan) {
    let count = 0;
    try { count = (await api.get(`/api/admin/plans/${plan.id}/assignment-count`)).count || 0; } catch (_e) { /* se confirma igual, sin el dato */ }
    const message = count > 0 ? `“${plan.title}” está asignado a ${plural(count, 'alumno', 'alumnos')}: van a dejar de verlo. Esta acción no se puede deshacer.` : `Se elimina “${plan.title}”. Esta acción no se puede deshacer.`;
    if (!(await confirmDialog({ title: 'Eliminar plan', message, confirmText: 'Eliminar plan', danger: true }))) return;
    try { await api.del(`/api/admin/plans/${plan.id}`); removeCached('plans', plan.id); notify.ok('Plan eliminado.'); }
    catch (error) { notify.error(errorMessage(error)); }
  }

  function paint() {
    ['all', 'training', 'nutrition'].forEach((k) => segments.setCount(k, k === 'all' ? plans.length : plans.filter((p) => (p.category || 'training') === k).length));
    const list = plans.filter((p) => category === 'all' || (p.category || 'training') === category).filter((p) => !query || normalize(`${p.title} ${p.description || ''}`).includes(query));
    if (!plans.length) {
      mount(grid, emptyState({ icon: 'clipboard', title: 'Todavía no creaste planes', text: 'Armá tu primera rutina con ejercicios del catálogo o un plan de alimentación, y después asignalo a tus alumnos.', action: h('div', { class: 'row' }, button('Plan de entrenamiento', { variant: 'primary', icon: 'plus', onClick: () => app.navigate('plans/new?category=training') }), button('Plan de alimentación', { icon: 'plus', onClick: () => app.navigate('plans/new?category=nutrition') })) }));
      return;
    }
    if (!list.length) { mount(grid, emptyState({ icon: 'search', title: 'Sin resultados', text: 'Ningún plan coincide con tu búsqueda o filtro.' })); return; }
    mount(grid, h('div', { class: 'plan-grid' }, list.map((plan) => planCard({ plan, app, onDuplicate: duplicate, onAssign: openAssignees, onDelete: remove }))));
  }

  const stopListening = onInvalidate((keys) => {
    if (keys.includes('plans') && !destroyed && plans.length + 1) loadPlans().then((list) => { plans = list; paint(); }).catch(() => {});
  });

  load();
  return { refresh: () => load({ force: true }), destroy() { destroyed = true; stopListening(); app.setNewAction(null); } };
}
