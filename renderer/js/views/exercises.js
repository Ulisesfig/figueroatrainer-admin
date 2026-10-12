// Catálogo de ejercicios: alta y edición rápida, variantes, miniatura del video y papelera.
import { h, mount } from '../lib/h.js';
import { icon } from '../lib/icons.js';
import { api, errorMessage } from '../lib/api.js';
import { button, badge, field, textInput, textArea, selectInput, emptyState, errorBox, loadingBlock, notify, openModal, confirmDialog, segmented, withBusy, markInvalid } from '../lib/ui.js';
import { loadExercises, upsertCached, removeCached, onInvalidate } from '../lib/data.js';
import { normalize, debounce, plural, youtubeId, formatDate, formatNumber } from '../lib/format.js';

const YT_RE = /^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\/.+$/i;

const numOrNull = (v) => (String(v).trim() === '' ? null : Number(v));

// El servidor devuelve el ejercicio sin los datos de su variante; se completan con el catálogo
// que ya tenemos en memoria para poder actualizar la lista sin volver a pedirla.
function withVariant(exercise, catalog) {
  const variant = exercise.variant_exercise_id ? catalog.find((c) => String(c.id) === String(exercise.variant_exercise_id)) : null;
  return {
    ...exercise,
    variant_id: variant ? variant.id : null,
    variant_name: variant ? variant.name : null,
    variant_sets: variant ? variant.sets : null,
    variant_reps: variant ? variant.reps : null,
    variant_notes: variant ? variant.notes : null,
    variant_youtube_url: variant ? variant.youtube_url : null,
    variant_suggested_weight: variant ? variant.suggested_weight : null,
  };
}

// Alta / edición en un modal. `exercise` null = nuevo. Devuelve el ejercicio guardado vía onSaved.
export function openExerciseModal({ exercise = null, catalog = [], categories = [], onSaved }) {
  const isEdit = Boolean(exercise);
  const name = textInput({ value: exercise?.name || '', placeholder: 'Ej. Press de banca', maxlength: 120, 'aria-label': 'Nombre' });
  const category = textInput({ value: exercise?.category || '', placeholder: 'Ej. Pecho', list: 'ex-categories', maxlength: 60, 'aria-label': 'Categoría' });
  const datalist = h('datalist', { id: 'ex-categories' }, categories.map((c) => h('option', { value: c })));
  const sets = textInput({ type: 'number', min: 1, max: 20, value: exercise?.sets ?? '', placeholder: '—', 'aria-label': 'Series' });
  const reps = textInput({ type: 'number', min: 1, max: 100, value: exercise?.reps ?? '', placeholder: '—', 'aria-label': 'Repeticiones' });
  const weight = textInput({ type: 'number', min: 0, step: 0.5, value: exercise?.suggested_weight ?? '', placeholder: '—', 'aria-label': 'Peso sugerido' });
  const yt = textInput({ type: 'url', value: exercise?.youtube_url || '', placeholder: 'https://youtu.be/…', className: 'input--mono', 'aria-label': 'Link de YouTube' });
  const notes = textArea({ rows: 3, value: exercise?.notes || '', placeholder: 'Técnica, tempo o indicaciones para el alumno', 'aria-label': 'Notas' });
  const ytError = h('div', { class: 'field__error hidden' }, 'El link debe ser de YouTube.');
  const thumb = h('div', { class: 'yt-thumb' });

  const variantOptions = [{ value: '', label: 'Sin variante' }, ...catalog.filter((c) => !exercise || c.id !== exercise.id).sort((a, b) => a.name.localeCompare(b.name, 'es')).map((c) => ({ value: String(c.id), label: c.name }))];
  const variant = selectInput(variantOptions, exercise?.variant_exercise_id ? String(exercise.variant_exercise_id) : '', { 'aria-label': 'Variante' });

  const paintThumb = () => {
    const id = youtubeId(yt.value);
    mount(thumb, id ? h('a', { href: `https://youtu.be/${id}`, target: '_blank', rel: 'noreferrer', title: 'Abrir el video' }, h('img', { src: `https://img.youtube.com/vi/${id}/mqdefault.jpg`, alt: 'Miniatura del video', loading: 'lazy' }), h('span', { class: 'yt-thumb__play' }, icon('play', 20))) : null);
    const bad = yt.value.trim() !== '' && !YT_RE.test(yt.value.trim());
    ytError.classList.toggle('hidden', !bad);
    markInvalid(yt, bad);
  };
  yt.addEventListener('input', debounce(paintThumb, 150));
  paintThumb();

  const saveBtn = button(isEdit ? 'Guardar cambios' : 'Crear ejercicio', { variant: 'primary', icon: 'check' });
  const errorHost = h('div');

  const body = h('form', { class: 'col gap-16', novalidate: true },
    datalist,
    h('div', { class: 'grid-form' }, field('Nombre', name), field('Categoría', category, { hint: 'Grupo muscular o tipo. Sirve para filtrar.' })),
    h('div', { class: 'grid-form grid-form--3' }, field('Series', sets), field('Repeticiones', reps), field('Peso sugerido (kg)', weight)),
    field('Video de YouTube', h('div', { class: 'col', style: { gap: '8px' } }, yt, ytError, thumb)),
    field('Variante', variant, { hint: 'Alternativa que se le muestra al alumno (por ejemplo, con mancuernas en lugar de barra).' }),
    field('Notas', notes),
    errorHost
  );

  async function submit() {
    mount(errorHost);
    [name, yt, sets, reps].forEach((c) => markInvalid(c, false));
    const problems = [];
    if (!name.value.trim()) { markInvalid(name); problems.push('El nombre es obligatorio.'); }
    if (sets.value !== '' && !(Number.isInteger(Number(sets.value)) && sets.value >= 1 && sets.value <= 20)) { markInvalid(sets); problems.push('Las series van de 1 a 20.'); }
    if (reps.value !== '' && !(Number.isInteger(Number(reps.value)) && reps.value >= 1 && reps.value <= 100)) { markInvalid(reps); problems.push('Las repeticiones van de 1 a 100.'); }
    if (yt.value.trim() && !YT_RE.test(yt.value.trim())) { markInvalid(yt); problems.push('El link debe ser de YouTube.'); }
    if (problems.length) { mount(errorHost, errorBox(problems.join(' '))); (modal.el.querySelector('.is-invalid') || name).focus(); return; }

    const payload = {
      name: name.value.trim(),
      category: category.value.trim() || null,
      sets: numOrNull(sets.value),
      reps: numOrNull(reps.value),
      suggested_weight: numOrNull(weight.value),
      youtube_url: yt.value.trim() || null,
      notes: notes.value.trim() || null,
      variant_exercise_id: variant.value ? Number(variant.value) : null,
    };
    try {
      const res = isEdit ? await api.patch(`/api/admin/exercises/${exercise.id}`, payload) : await api.post('/api/admin/exercises', payload);
      // Se actualiza el catálogo local con lo que confirmó el servidor (sin volver a bajarlo entero)
      upsertCached('exercises', withVariant({ ...(exercise || {}), ...payload, ...(res.exercise || {}) }, catalog), { prepend: !isEdit });
      modal.close('saved');
      notify.ok(isEdit ? 'Ejercicio actualizado.' : 'Ejercicio creado.');
      if (onSaved) onSaved(res.exercise);
    } catch (error) {
      mount(errorHost, errorBox(errorMessage(error)));
    }
  }

  body.addEventListener('submit', (e) => { e.preventDefault(); withBusy(saveBtn, submit); });
  saveBtn.addEventListener('click', () => withBusy(saveBtn, submit));

  const modal = openModal({
    title: isEdit ? 'Editar ejercicio' : 'Nuevo ejercicio',
    size: 'lg',
    body,
    footer: [button('Cancelar', { variant: 'ghost', onClick: () => modal.close() }), saveBtn],
    initialFocus: 'input',
    onClose: (result) => { if (result !== 'saved' && onClosed) onClosed(); },
  });
  let onClosed = null;
  return { close: modal.close, onClosed: (fn) => { onClosed = fn; } };
}

export function exercisesView(container, params, app) {
  let all = [];
  let trash = [];
  let mode = 'catalog'; // catalog | trash
  let category = '';
  let query = '';
  let destroyed = false;
  let modal = null;
  let lastParamId = null;

  const searchInput = textInput({ type: 'search', placeholder: 'Buscar ejercicio o categoría…', 'aria-label': 'Buscar ejercicios' });
  const categorySelect = selectInput([{ value: '', label: 'Todas las categorías' }], '', { 'aria-label': 'Filtrar por categoría', style: { width: '220px' } });
  const segments = segmented([{ value: 'catalog', label: 'Catálogo', count: 0 }, { value: 'trash', label: 'Papelera', count: 0 }], mode, (v) => { mode = v; if (v === 'trash') loadTrash(); else paint(); });
  const tableHost = h('div');

  const page = h('div', { class: 'page' },
    h('div', { class: 'page__head' }, h('div', null, h('h1', { class: 'page__title' }, 'Ejercicios'), h('p', { class: 'page__sub' }, 'El catálogo que se usa para armar planes. Los ejercicios eliminados quedan en la papelera y se pueden restaurar.')), h('div', { class: 'page__actions' }, button('Nuevo ejercicio', { variant: 'primary', icon: 'plus', onClick: () => app.navigate('exercises/new') }))),
    h('div', { class: 'toolbar' }, h('div', { class: 'input-icon grow', style: { maxWidth: '420px' } }, icon('search', 16), searchInput), categorySelect, segments),
    tableHost);
  mount(container, page);
  app.setNewAction('Nuevo ejercicio', () => app.navigate('exercises/new'));

  searchInput.addEventListener('input', debounce(() => { query = normalize(searchInput.value.trim()); paint(); }, 120));
  categorySelect.addEventListener('change', () => { category = categorySelect.value; paint(); });

  const categories = () => [...new Set(all.map((e) => (e.category || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

  function paintCategories() {
    const list = categories();
    categorySelect.replaceChildren(h('option', { value: '' }, 'Todas las categorías'), ...list.map((c) => h('option', { value: c, selected: c === category }, `${c} (${all.filter((e) => (e.category || '').trim() === c).length})`)));
    categorySelect.value = list.includes(category) ? category : '';
    if (!list.includes(category)) category = '';
  }

  async function load({ force = false } = {}) {
    mount(tableHost, loadingBlock('Cargando el catálogo…'));
    try {
      all = await loadExercises({ force });
      if (destroyed) return;
      paintCategories();
      paint();
      handleParams(params);
    } catch (error) { if (!destroyed) mount(tableHost, errorBox(errorMessage(error), () => load({ force: true }))); }
  }

  async function loadTrash() {
    mount(tableHost, loadingBlock('Cargando la papelera…'));
    try { trash = (await api.get('/api/admin/exercises/trash')).exercises || []; if (!destroyed) paint(); }
    catch (error) { if (!destroyed) mount(tableHost, errorBox(errorMessage(error), loadTrash)); }
  }

  async function remove(ex) {
    if (!(await confirmDialog({ title: 'Eliminar ejercicio', message: `“${ex.name}” se mueve a la papelera. Los planes que ya lo usan no se modifican, y podés restaurarlo cuando quieras.`, confirmText: 'Mover a la papelera', danger: true }))) return;
    try {
      await api.del(`/api/admin/exercises/${ex.id}`);
      removeCached('exercises', ex.id);
      if (trash.length) trash = [{ ...ex, deleted_at: new Date().toISOString() }, ...trash];
      notify.ok('Ejercicio movido a la papelera.', { action: { label: 'Deshacer', onClick: () => restore(ex, true) } });
    } catch (error) { notify.error(errorMessage(error)); }
  }

  async function restore(ex, silent = false) {
    try {
      const res = await api.post(`/api/admin/exercises/${ex.id}/restore`, {});
      trash = trash.filter((t) => t.id !== ex.id);
      upsertCached('exercises', withVariant({ ...ex, ...(res.exercise || {}), deleted_at: null }, all));
      if (!silent) notify.ok('Ejercicio restaurado.');
      else notify.ok('Se deshizo la eliminación.');
      if (mode === 'trash') paint();
    } catch (error) { notify.error(errorMessage(error)); }
  }

  function paint() {
    if (destroyed) return;
    segments.setCount('catalog', all.length);
    segments.setCount('trash', trash.length || 0);
    categorySelect.classList.toggle('hidden', mode === 'trash');
    const source = mode === 'trash' ? trash : all;
    const list = source
      .filter((e) => mode === 'trash' || !category || (e.category || '').trim() === category)
      .filter((e) => !query || normalize(`${e.name} ${e.category || ''}`).includes(query))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    if (!source.length) {
      mount(tableHost, mode === 'trash'
        ? emptyState({ icon: 'trash', title: 'La papelera está vacía', text: 'Cuando elimines un ejercicio del catálogo, vas a poder recuperarlo desde acá.' })
        : emptyState({ icon: 'dumbbell', title: 'Todavía no hay ejercicios', text: 'Cargá los ejercicios que usás seguido (con series, repeticiones y video) y armar planes va a ser mucho más rápido.', action: button('Nuevo ejercicio', { variant: 'primary', icon: 'plus', onClick: () => app.navigate('exercises/new') }) }));
      return;
    }
    if (!list.length) { mount(tableHost, h('div', { class: 'table-wrap' }, emptyState({ icon: 'search', title: 'Sin resultados', text: 'Ningún ejercicio coincide con tu búsqueda.' }))); return; }

    const table = h('table', { class: 'table' },
      h('thead', null, h('tr', null, h('th', null, 'Ejercicio'), h('th', null, 'Categoría'), h('th', null, 'Series × reps'), h('th', null, 'Peso'), h('th', null, 'Video'), h('th', null, 'Variante'), h('th', { style: { width: '104px' } }))),
      h('tbody', null, list.map((e) => {
        const open = () => app.navigate(`exercises/${e.id}`);
        const id = youtubeId(e.youtube_url);
        return h('tr', mode === 'catalog' ? { class: 'is-clickable', tabindex: 0, onClick: open, onKeydown: (ev) => { if (ev.key === 'Enter') open(); } } : null,
          h('td', null, h('div', { class: 'cell-name' }, e.name), e.notes ? h('div', { class: 'cell-sub trunc', style: { maxWidth: '380px' } }, e.notes) : null),
          h('td', null, e.category ? badge(e.category) : h('span', { class: 'faint' }, '—')),
          h('td', { class: 'num' }, e.sets || e.reps ? `${e.sets || '—'} × ${e.reps || '—'}` : '—'),
          h('td', { class: 'num' }, e.suggested_weight ? `${String(e.suggested_weight).replace('.', ',')} kg` : '—'),
          h('td', null, id ? h('a', { class: 'link', href: `https://youtu.be/${id}`, target: '_blank', rel: 'noreferrer', onClick: (ev) => ev.stopPropagation() }, icon('play', 14), 'Ver') : e.youtube_url ? h('span', { class: 'faint' }, 'Link inválido') : h('span', { class: 'faint' }, '—')),
          h('td', null, e.variant_name ? h('span', { class: 'trunc', style: { maxWidth: '180px', display: 'inline-block' } }, e.variant_name) : h('span', { class: 'faint' }, '—')),
          h('td', null, h('div', { class: 'row', style: { justifyContent: 'flex-end', gap: '2px' } },
            mode === 'catalog'
              ? [button('Editar', { size: 'sm', variant: 'ghost', iconOnly: true, icon: 'pencil', onClick: (ev) => { ev.stopPropagation(); open(); } }), button('Eliminar', { size: 'sm', variant: 'ghost', iconOnly: true, icon: 'trash', onClick: (ev) => { ev.stopPropagation(); remove(e); } })]
              : [e.deleted_at ? h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)', marginRight: '8px' } }, formatDate(e.deleted_at)) : null, button('Restaurar', { size: 'sm', icon: 'undo', onClick: () => restore(e) })])));
      })));
    mount(tableHost, h('div', { class: 'table-wrap' }, h('div', { class: 'table-scroll' }, table), h('div', { class: 'table-foot' }, h('span', null, `${plural(list.length, 'ejercicio', 'ejercicios')}${list.length !== source.length ? ` de ${formatNumber(source.length)}` : ''}`), h('span'))));
  }

  function handleParams(p) {
    params = p;
    const id = p.id || null;
    if (id === lastParamId && (modal || !id)) return;
    lastParamId = id;
    if (modal) { modal.close(); modal = null; }
    if (!id) return;
    const goBack = () => { modal = null; lastParamId = null; if (!destroyed) app.navigate('exercises', { replace: true }); };
    if (id === 'new') {
      modal = openExerciseModal({ catalog: all, categories: categories(), onSaved: () => { modal = null; lastParamId = null; app.navigate('exercises', { replace: true }); } });
      modal.onClosed(goBack);
      return;
    }
    const exercise = all.find((e) => String(e.id) === String(id));
    if (!exercise) { notify.warn('No encontramos ese ejercicio. Puede que ya no exista.'); app.navigate('exercises', { replace: true }); return; }
    modal = openExerciseModal({ exercise, catalog: all, categories: categories(), onSaved: () => { modal = null; lastParamId = null; app.navigate('exercises', { replace: true }); } });
    modal.onClosed(goBack);
  }

  const stop = onInvalidate((keys) => { if (keys.includes('exercises') && !destroyed && all.length) loadExercises().then((list) => { all = list; paintCategories(); paint(); }).catch(() => {}); });

  load();

  return {
    onParams: (p) => { if (all.length || p.id) handleParams(p); else params = p; },
    refresh: () => (mode === 'trash' ? loadTrash() : load({ force: true })),
    destroy() { destroyed = true; stop(); modal?.close(); app.setNewAction(null); },
  };
}
