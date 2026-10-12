// Editor de planes (entrenamiento por días y alimentación en texto).
// Diseñado para armar una rutina rápido: autocompletado del catálogo, filas
// compactas, reordenar arrastrando, borrador automático y vista previa.
import { h, mount } from '../lib/h.js';
import { icon } from '../lib/icons.js';
import { api, errorMessage } from '../lib/api.js';
import { button, badge, field, textInput, textArea, selectInput, switchInput, checkInput, emptyState, errorBox, loadingBlock, notify, openModal, confirmDialog, withBusy, notice } from '../lib/ui.js';
import { loadExercises, loadPlans, upsertCached } from '../lib/data.js';
import { buildPlanDocument } from '../lib/planPdf.js';
import { openAssignees } from './plans.js';
import { catalogCombobox } from '../lib/combobox.js';
import { makeSortable } from '../lib/sortable.js';
import { debounce, timeAgo, youtubeId } from '../lib/format.js';
import {
  SECTION_TYPES, DAY_SECTION_TYPES, SECTION_LABELS, emptyDraft, emptyDay, emptyExercise, emptySuperset, draftFromPlan, payloadFromDraft, validateDraft, summarize,
  countExercises, cloneDay, fingerprint, newKey,
} from '../lib/planModel.js';

const NUTRITION_TEMPLATE = `Desayuno:
-

Media mañana:
-

Almuerzo:
-

Merienda:
-

Cena:
-

Recomendaciones:
- Tomar 2 a 3 litros de agua por día.
`;

function move(list, from, to) {
  if (to < 0 || to >= list.length || from === to) return false;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  return true;
}

export function planEditorView(container, params, app) {
  const isNew = params.id === 'new';
  const planId = isNew ? null : Number(params.id);
  const draftKey = isNew ? `ft:draft:new:${params.query?.category === 'nutrition' ? 'nutrition' : 'training'}` : `ft:draft:plan:${planId}`;

  let draft = null;
  let savedPrint = '';
  let activeDay = 0;
  let catalog = [];
  let problems = [];
  let destroyed = false;
  let saving = false;
  const expanded = new Set();       // filas con detalles abiertos
  const openSections = new Set();   // bloques opcionales que se abrieron a mano

  const root = h('div', { class: 'page page--wide editor' });
  mount(container, root);
  mount(root, loadingBlock('Abriendo el plan…'));

  // ─── Estado y borrador local ───
  const isDirty = () => draft && fingerprint(draft) !== savedPrint;
  let dirtyPill = null;
  const paintDirty = () => {
    if (!dirtyPill) return;
    const dirty = isDirty();
    dirtyPill.className = `pill ${dirty ? 'pill--warn' : 'pill--ok'}`;
    dirtyPill.textContent = saving ? 'Guardando…' : dirty ? 'Cambios sin guardar' : (draft.id ? 'Todo guardado' : 'Plan nuevo');
  };

  const storeDraft = debounce(() => {
    if (!draft || destroyed) return;
    try {
      if (isDirty()) localStorage.setItem(draftKey, JSON.stringify({ savedAt: Date.now(), draft }));
      else localStorage.removeItem(draftKey);
    } catch (_e) { /* almacenamiento lleno o bloqueado: el editor sigue funcionando */ }
  }, 700);

  function touch() {
    paintDirty();
    storeDraft();
    snapshotSoon();
    if (problems.length) revalidateSoon();
  }
  const revalidateSoon = debounce(() => { problems = validateDraft(draft); paintProblems(); }, 500);

  window.onbeforeunload = () => (isDirty() ? 'cambios-sin-guardar' : undefined);

  // ─── Deshacer / rehacer ───
  // Cada "paso" es una foto completa del plan; los cambios seguidos (escribir) se juntan en uno.
  const undoStack = [];
  const redoStack = [];
  let lastSnap = '';
  let undoBtn = null;
  let redoBtn = null;

  function paintUndo() {
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
  }
  function resetHistory() {
    undoStack.length = 0;
    redoStack.length = 0;
    lastSnap = JSON.stringify(draft);
    paintUndo();
  }
  function commitSnapshot() {
    if (!draft) return;
    const now = JSON.stringify(draft);
    if (now === lastSnap) return;
    undoStack.push(lastSnap);
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
    lastSnap = now;
    paintUndo();
  }
  const snapshotSoon = debounce(commitSnapshot, 500);
  function restoreSnapshot(json) {
    draft = JSON.parse(json);
    lastSnap = json;
    activeDay = Math.max(0, Math.min(activeDay, draft.days.length - 1));
    if (titleInput) titleInput.value = draft.title;
    problems = [];
    paintProblems();
    paintBody();
    paintDirty();
    paintUndo();
    storeDraft();
  }
  function undo() {
    commitSnapshot();
    if (!undoStack.length) return;
    redoStack.push(lastSnap);
    restoreSnapshot(undoStack.pop());
  }
  function redo() {
    commitSnapshot();
    if (!redoStack.length) return;
    undoStack.push(lastSnap);
    restoreSnapshot(redoStack.pop());
  }
  window.__ftEditor = { undo, redo };

  // ─── Carga ───
  async function load() {
    mount(root, loadingBlock('Abriendo el plan…'));
    try {
      if (isNew) {
        const category = params.query?.category === 'nutrition' ? 'nutrition' : 'training';
        draft = emptyDraft(category);
        savedPrint = fingerprint(draft);
      } else {
        const plan = (await api.get(`/api/admin/plans/${planId}`)).plan;
        draft = draftFromPlan(plan);
        savedPrint = fingerprint(draft);
      }
      loadExercises().then((list) => { catalog = list; }).catch(() => { notify.warn('No pudimos cargar el catálogo de ejercicios. Igual podés escribirlos a mano.'); });
      if (destroyed) return;
      resetHistory();

      let restored = null;
      try { restored = JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch (_e) { restored = null; }
      paint();
      if (restored?.draft && fingerprint(restored.draft) !== savedPrint) offerRestore(restored);
      app.setCrumbs([{ label: 'Planes', href: 'plans' }, { label: draft.title || (isNew ? 'Plan nuevo' : 'Plan') }]);
    } catch (error) {
      if (!destroyed) mount(root, h('div', { class: 'page' }, errorBox(errorMessage(error), load), h('div', { style: { marginTop: '16px' } }, button('Volver a planes', { onClick: () => app.navigate('plans') }))));
    }
  }

  function offerRestore(stored) {
    const banner = h('div', { class: 'notice notice--warn restore-banner' }, icon('alert', 16), h('div', { class: 'grow' }, `Encontramos un borrador sin guardar de ${timeAgo(stored.savedAt)}.`), button('Recuperar', { size: 'sm', variant: 'primary', onClick: () => { draft = stored.draft; activeDay = 0; banner.remove(); resetHistory(); paint(); notify.ok('Borrador recuperado.'); } }), button('Descartar', { size: 'sm', variant: 'ghost', onClick: () => { localStorage.removeItem(draftKey); banner.remove(); } }));
    root.insertBefore(banner, root.children[1] || null);
  }

  // ─── Guardado ───
  async function save({ silent = false } = {}) {
    if (saving) return false;
    problems = validateDraft(draft);
    paintProblems();
    if (problems.length) {
      const first = problems[0];
      if (first.dayKey) { const idx = draft.days.findIndex((d) => d.key === first.dayKey); if (idx >= 0 && idx !== activeDay) { activeDay = idx; paintBody(); } }
      notify.error(first.message);
      if (first.field === 'title') titleInput?.focus();
      return false;
    }
    saving = true; paintDirty();
    try {
      const payload = payloadFromDraft(draft);
      let res;
      if (draft.id) res = await api.patch(`/api/admin/plans/${draft.id}`, payload);
      else res = await api.post('/api/admin/plans', payload);
      const plan = res.plan;
      const wasNew = !draft.id;
      draft.id = plan.id;
      savedPrint = fingerprint(draft);
      try { localStorage.removeItem(draftKey); localStorage.removeItem(`ft:draft:plan:${plan.id}`); } catch (_e) { /* nada */ }
      // La lista de planes se actualiza con lo que confirmó el servidor, sin volver a bajarla entera
      upsertCached('plans', wasNew ? { ...plan, creator_name: app.user?.name, creator_surname: app.user?.surname } : plan, { prepend: true });
      if (!silent) notify.ok(isNew && !planId ? 'Plan creado.' : 'Plan guardado.');
      if (isNew && !silent) app.navigate(`plans/${plan.id}`, { replace: true });
      app.setCrumbs([{ label: 'Planes', href: 'plans' }, { label: draft.title }]);
      return true;
    } catch (error) {
      notify.error(errorMessage(error));
      return false;
    } finally {
      saving = false; paintDirty();
    }
  }

  // ─── Estructura de la pantalla ───
  let titleInput = null;
  let bodyHost = null;
  let problemsHost = null;

  function paint() {
    const isTraining = draft.category === 'training';
    titleInput = textInput({ className: 'editor__title', value: draft.title, placeholder: isTraining ? 'Nombre de la rutina' : 'Nombre del plan de alimentación', 'aria-label': 'Título del plan', maxlength: 120 });
    titleInput.addEventListener('input', () => { draft.title = titleInput.value; touch(); });
    dirtyPill = h('span', { class: 'pill pill--ok', role: 'status' });
    problemsHost = h('div');
    bodyHost = h('div', { class: 'editor__body' });

    const saveBtn = button(draft.id ? 'Guardar' : 'Crear plan', { variant: 'primary', icon: 'save', title: 'Guardar (Ctrl+S)' });
    saveBtn.addEventListener('click', () => withBusy(saveBtn, () => save()));
    editorSave = () => withBusy(saveBtn, () => save());

    mount(
      root,
      h('div', { class: 'editor__bar' },
        button('Volver a planes', { variant: 'ghost', size: 'sm', iconOnly: true, icon: 'chevron-left', onClick: () => app.navigate('plans') }),
        h('div', { class: 'editor__titlewrap' }, badge(isTraining ? 'Entrenamiento' : 'Alimentación', isTraining ? 'brass' : 'ok'), titleInput),
        dirtyPill,
        undoBtn = button('Deshacer (Ctrl+Z)', { variant: 'ghost', size: 'sm', iconOnly: true, icon: 'undo', disabled: true, onClick: () => undo() }),
        redoBtn = button('Rehacer (Ctrl+Shift+Z)', { variant: 'ghost', size: 'sm', iconOnly: true, icon: 'undo', disabled: true, onClick: () => redo() }),
        button('Vista previa', { icon: 'eye', onClick: () => openPreview() }),
        button('PDF', { icon: 'download', title: 'Exportar el plan a PDF para imprimir o mandar por WhatsApp', onClick: (e) => exportPdf(e.currentTarget) }),
        draft.id ? button('Alumnos', { icon: 'users', title: 'Ver y asignar alumnos', onClick: () => openAssignees({ id: draft.id, title: draft.title || 'Plan' }) }) : null,
        saveBtn
      ),
      problemsHost,
      draft.legacyText ? h('div', { class: 'notice notice--warn' }, icon('alert', 16), h('div', { class: 'grow' }, 'Este plan estaba guardado como texto. Lo importamos automáticamente: revisá los días y ejercicios antes de guardar (al guardar se convierte al formato nuevo).'), button('Ver texto original', { size: 'sm', onClick: () => openModal({ title: 'Texto original', size: 'lg', body: h('pre', { class: 'legacy-pre selectable' }, draft.legacyText) }) })) : null,
      bodyHost
    );
    redoBtn?.classList.add('btn--flip');
    paintBody();
    paintDirty();
    paintProblems();
    paintUndo();
  }

  async function exportPdf(btn) {
    await withBusy(btn, async () => {
      const doc = buildPlanDocument(draft);
      const res = await window.ft.savePdf({ ...doc, defaultName: draft.title || 'plan' });
      if (!res.ok) { notify.error(errorMessage(res.error)); return; }
      if (!res.data.canceled) notify.ok('PDF guardado.', { action: { label: 'Mostrar', onClick: () => window.ft.reveal(res.data.filePath) } });
    });
  }

  function paintProblems() {
    if (!problemsHost) return;
    if (!problems.length) { mount(problemsHost); return; }
    mount(problemsHost, h('div', { class: 'error-box', role: 'alert' }, icon('alert', 18), h('div', { class: 'error-box__text' }, h('strong', null, `Revisá ${problems.length === 1 ? 'este punto' : `estos ${problems.length} puntos`} antes de guardar:`), h('ul', { class: 'problem-list' }, problems.slice(0, 6).map((p) => h('li', null, p.message)), problems.length > 6 ? h('li', null, `…y ${problems.length - 6} más`) : null))));
  }

  const invalidFor = (key, fieldName) => problems.some((p) => p.key === key && p.field === fieldName);

  function paintBody() {
    document.querySelectorAll('.combo').forEach((el) => el.remove());
    if (draft.category === 'nutrition') { mount(bodyHost, nutritionEditor()); return; }
    mount(bodyHost, descriptionCard(), generalBlocks(), daysEditor());
  }

  // ─── Editor de alimentación ───
  function nutritionEditor() {
    const description = textInput({ value: draft.description, placeholder: 'Descripción corta (opcional)', maxlength: 240 });
    description.addEventListener('input', () => { draft.description = description.value; touch(); });
    const content = textArea({ value: draft.content, rows: 24, className: 'nutrition-text', placeholder: 'Escribí el plan de alimentación. Podés usar títulos y listas.', spellcheck: 'true', 'aria-label': 'Contenido del plan' });
    const counter = h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } });
    const updateCounter = () => { const lines = content.value ? content.value.split('\n').length : 0; counter.textContent = `${lines} líneas · ${content.value.length} caracteres`; };
    content.addEventListener('input', () => { draft.content = content.value; updateCounter(); touch(); });
    updateCounter();
    return h('div', { class: 'col gap-16' },
      field('Descripción', description),
      h('div', { class: 'card' }, h('div', { class: 'card__head' }, h('div', { class: 'card__title' }, 'Plan'), h('div', { class: 'row' }, counter, button('Insertar estructura de comidas', { size: 'sm', icon: 'list', onClick: async () => {
        if (content.value.trim() && !(await confirmDialog({ title: 'Reemplazar contenido', message: 'Esto reemplaza lo que ya escribiste con una estructura de comidas vacía.', confirmText: 'Reemplazar', danger: true }))) return;
        content.value = NUTRITION_TEMPLATE; draft.content = content.value; updateCounter(); touch(); content.focus();
      } }))), h('div', { class: 'card__body' }, content))
    );
  }

  // ─── Descripción y bloques generales ───
  function descriptionCard() {
    const description = textArea({ value: draft.description, rows: 2, placeholder: 'Objetivo, nivel o comentarios generales del plan (opcional)', 'aria-label': 'Descripción' });
    description.addEventListener('input', () => { draft.description = description.value; touch(); });
    return field('Descripción', description);
  }

  function generalBlocks() {
    const total = SECTION_TYPES.reduce((n, t) => n + draft.general[t].length, 0);
    const details = h('details', { class: 'general', open: openSections.has('general') },
      h('summary', null, icon('layers', 16), h('span', null, 'Bloques generales del plan'), h('span', { class: 'faint' }, total ? `${total} ${total === 1 ? 'ítem' : 'ítems'} · se muestran en todos los días` : 'Calentamiento, movilidad, core o cardio comunes a toda la rutina')),
      h('div', { class: 'general__body' }, draft.general.order.map((type, i) => sectionBlock({ type, list: draft.general[type], dayKey: null, orderList: draft.general.order, orderIndex: i, scope: 'general' })))
    );
    details.addEventListener('toggle', () => { if (details.open) openSections.add('general'); else openSections.delete('general'); });
    return details;
  }

  // ─── Días ───
  function daysEditor() {
    const day = draft.days[activeDay] || draft.days[0];
    if (activeDay >= draft.days.length) activeDay = Math.max(0, draft.days.length - 1);

    const tabs = h('div', { class: 'daytabs', role: 'tablist', 'aria-label': 'Días de la rutina' },
      draft.days.map((d, i) => h('button', { type: 'button', class: ['daytab', i === activeDay && 'is-active'], role: 'tab', 'aria-selected': String(i === activeDay), onClick: () => { activeDay = i; paintBody(); } },
        h('span', { class: 'daytab__n' }, `Día ${i + 1}`), d.name ? h('span', { class: 'daytab__name' }, d.name) : null, h('span', { class: 'daytab__count num' }, d.exercises.filter((x) => x.name.trim()).length))),
      h('button', { type: 'button', class: 'daytab daytab--add', onClick: () => { draft.days.push(emptyDay(draft.days.length)); activeDay = draft.days.length - 1; touch(); paintBody(); } }, icon('plus', 15), 'Agregar día')
    );

    if (!day) return h('div', { class: 'col gap-16' }, tabs, emptyState({ icon: 'calendar', title: 'Sin días', text: 'Agregá el primer día de la rutina.' }));

    const nameInput = textInput({ value: day.name, placeholder: `Nombre del día (ej. Pecho y tríceps)`, 'aria-label': `Nombre del día ${activeDay + 1}` });
    nameInput.addEventListener('input', () => { day.name = nameInput.value; touch(); const t = tabs.children[activeDay]?.querySelector('.daytab__name'); if (t) t.textContent = day.name; });

    const dayBar = h('div', { class: 'daybar' },
      h('div', { class: 'input-icon grow' }, icon('calendar', 16), nameInput),
      button('Mover a la izquierda', { size: 'sm', variant: 'ghost', iconOnly: true, icon: 'chevron-left', disabled: activeDay === 0, onClick: () => { if (move(draft.days, activeDay, activeDay - 1)) { activeDay -= 1; touch(); paintBody(); } } }),
      button('Mover a la derecha', { size: 'sm', variant: 'ghost', iconOnly: true, icon: 'chevron-right', disabled: activeDay === draft.days.length - 1, onClick: () => { if (move(draft.days, activeDay, activeDay + 1)) { activeDay += 1; touch(); paintBody(); } } }),
      button('Duplicar día', { size: 'sm', icon: 'copy', title: 'Duplicar día (Ctrl+D)', onClick: () => duplicateDay() }),
      button('Traer día de otro plan', { size: 'sm', icon: 'download', title: 'Copiar uno o más días de otra rutina a esta', onClick: () => openImportDays() }),
      button('Eliminar día', { size: 'sm', variant: 'ghost', icon: 'trash', onClick: async () => {
        const has = day.exercises.length + SECTION_TYPES.reduce((n, t) => n + day[t].length, 0);
        if (has && !(await confirmDialog({ title: 'Eliminar día', message: `Se borra el día ${activeDay + 1} con sus ${has} ítems.`, confirmText: 'Eliminar día', danger: true }))) return;
        draft.days.splice(activeDay, 1);
        if (!draft.days.length) draft.days.push(emptyDay(0));
        activeDay = Math.min(activeDay, draft.days.length - 1);
        touch(); paintBody();
      } })
    );

    return h('div', { class: 'col gap-16' }, tabs, dayBar, ...day.sectionOrder.map((type, i) => sectionBlock({ type, list: day[type], dayKey: day.key, orderList: day.sectionOrder, orderIndex: i, scope: 'day' })));
  }

  function duplicateDay() {
    const day = draft.days[activeDay];
    if (!day) return;
    draft.days.splice(activeDay + 1, 0, cloneDay(day));
    activeDay += 1;
    touch(); paintBody();
    notify.ok('Día duplicado.');
  }

  async function openImportDays() {
    let plans = [];
    try {
      plans = (await loadPlans()).filter((pl) => (pl.category || 'training') === 'training' && pl.id !== draft.id);
    } catch (error) { notify.error(errorMessage(error)); return; }
    if (!plans.length) { notify.info('No hay otras rutinas de las que traer días.'); return; }

    const select = selectInput(plans.map((pl) => ({ value: String(pl.id), label: pl.title })), String(plans[0].id), { 'aria-label': 'Plan de origen' });
    const daysHost = h('div', { class: 'col', style: { gap: '4px' } });
    const chosen = new Set();
    let sourceDays = [];
    const addBtn = button('Agregar a este plan', { variant: 'primary', icon: 'plus', disabled: true });

    function paintDays() {
      const source = plans.find((pl) => String(pl.id) === select.value);
      sourceDays = draftFromPlan(source).days.filter((d) => d.exercises.length || SECTION_TYPES.some((t) => d[t].length));
      chosen.clear();
      addBtn.disabled = true;
      mount(daysHost, ...(sourceDays.length ? sourceDays.map((d, i) => h('label', { class: 'list__item', style: { padding: '9px 10px', cursor: 'pointer', borderRadius: '8px' } },
        checkInput({ 'aria-label': `Traer el día ${i + 1}`, onChange: (on) => { if (on) chosen.add(i); else chosen.delete(i); addBtn.disabled = chosen.size === 0; addBtn.lastChild.textContent = chosen.size ? `Agregar ${chosen.size} ${chosen.size === 1 ? 'día' : 'días'}` : 'Agregar a este plan'; } }),
        h('div', { class: 'grow' }, h('div', { class: 'cell-name' }, `Día ${i + 1}${d.name ? ` · ${d.name}` : ''}`), h('div', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, `${d.exercises.filter((x) => x.name.trim()).length} ejercicios`)))) : [h('p', { class: 'faint' }, 'Esta rutina no tiene días con ejercicios.')]));
    }
    select.addEventListener('change', paintDays);
    paintDays();

    const modal = openModal({
      title: 'Traer días de otro plan',
      subtitle: 'Se copian con todos sus ejercicios; después podés editarlos sin afectar al plan original.',
      size: 'md',
      body: h('div', { class: 'col gap-16' }, field('Plan de origen', select), daysHost),
      footer: [button('Cancelar', { variant: 'ghost', onClick: () => modal.close() }), addBtn],
    });
    addBtn.addEventListener('click', () => {
      const names = new Map(sourceDays.map((d) => [d, d.name]));
      [...chosen].sort((a, b) => a - b).forEach((i) => {
        const copy = cloneDay(sourceDays[i]);
        copy.name = names.get(sourceDays[i]) || '';
        draft.days.push(copy);
      });
      activeDay = draft.days.length - 1;
      modal.close();
      touch();
      paintBody();
      notify.ok(chosen.size === 1 ? 'Día agregado.' : `${chosen.size} días agregados.`);
    });
  }

  // ─── Bloques (ejercicios, calentamiento, movilidad, core, cardio) ───
  function sectionBlock({ type, list, dayKey, orderList, orderIndex, scope }) {
    const isMain = type === 'exercises';
    const sectionId = `${scope}:${dayKey || 'g'}:${type}`;
    const isOpen = isMain || list.length > 0 || openSections.has(sectionId);
    const title = `${SECTION_LABELS[type]}${isMain ? '' : scope === 'general' ? ' general' : ''}`;

    const head = h('div', { class: 'block__head' },
      h('div', { class: 'row' }, icon(isMain ? 'dumbbell' : type === 'cardio' ? 'flame' : type === 'core' ? 'layers' : 'refresh', 16), h('h3', { class: 'block__title' }, title), list.length ? h('span', { class: 'block__count num' }, list.length) : null),
      h('div', { class: 'row', style: { gap: '2px' } },
        button('Subir bloque', { size: 'sm', variant: 'ghost', iconOnly: true, icon: 'arrow-up', disabled: orderIndex === 0, onClick: () => { move(orderList, orderIndex, orderIndex - 1); touch(); paintBody(); } }),
        button('Bajar bloque', { size: 'sm', variant: 'ghost', iconOnly: true, icon: 'arrow-down', disabled: orderIndex === orderList.length - 1, onClick: () => { move(orderList, orderIndex, orderIndex + 1); touch(); paintBody(); } }))
    );

    if (!isOpen) {
      return h('div', { class: 'block block--collapsed' }, head, h('div', { class: 'block__body' }, button(`Agregar ${SECTION_LABELS[type].toLowerCase()}`, { size: 'sm', icon: 'plus', onClick: () => { openSections.add(sectionId); paintBody(); } })));
    }

    const rowsHost = h('div', { class: 'ex-list' });
    const renderRows = () => {
      mount(rowsHost, ...list.map((item, i) => exerciseRow({ item, list, index: i, dayKey, section: !isMain, rerender: renderRows })));
    };
    renderRows();
    makeSortable(rowsHost, { onReorder: (from, to) => { move(list, from, to); touch(); renderRows(); } });

    // Alta rápida: escribir un nombre (o elegir del catálogo) + Enter agrega la fila.
    const quick = catalogCombobox({
      getItems: () => catalog, placeholder: isMain ? 'Agregar ejercicio: escribí para buscar en el catálogo…' : `Agregar ${SECTION_LABELS[type].toLowerCase()}…`, ariaLabel: `Agregar a ${title}`, className: 'quick-add__input',
      onPick: (item) => { list.push(exerciseFromCatalog(item)); quick.value = ''; touch(); renderRows(); focusLastName(rowsHost); },
      onEnter: (text) => { const name = text.trim(); if (!name) return; list.push(emptyExercise({ name })); quick.value = ''; touch(); renderRows(); focusLastName(rowsHost); },
    });
    const addBlank = button('Fila vacía', { size: 'sm', variant: 'ghost', icon: 'plus', onClick: () => { list.push(emptyExercise()); touch(); renderRows(); focusLastName(rowsHost); } });

    return h('div', { class: ['block', isMain && 'block--main'] }, head, h('div', { class: 'block__body' },
      list.length ? h('div', { class: 'ex-head', 'aria-hidden': 'true' }, h('span'), h('span'), h('span', null, 'Ejercicio'), h('span', null, 'Series'), h('span', null, 'Reps'), h('span', null, 'Unidad'), h('span', null, 'RIR'), h('span', null, 'Kg'), h('span')) : null,
      rowsHost,
      h('div', { class: 'quick-add' }, h('div', { class: 'input-icon grow' }, icon('plus', 16), quick), addBlank)));
  }

  function focusLastName(rowsHost) {
    requestAnimationFrame(() => { const inputs = rowsHost.querySelectorAll('.ex-name input'); const last = inputs[inputs.length - 1]; if (last && !last.value) last.focus(); });
  }

  function exerciseFromCatalog(item) {
    const ex = emptyExercise({ id: item.id, name: item.name, sets: item.sets ?? '', reps: item.reps ?? '', notes: item.notes || '', youtube_url: item.youtube_url || '', suggested_weight: item.suggested_weight ?? '' });
    if (item.variant_id && item.variant_youtube_url) {
      ex.variant = { id: item.variant_id, name: item.variant_name || '', youtube_url: item.variant_youtube_url || '', sets: item.variant_sets ?? '', reps: item.variant_reps ?? '', reps_unit: 'reps', notes: item.variant_notes || '', suggested_weight: item.variant_suggested_weight ?? '' };
    }
    return ex;
  }

  // ─── Fila de ejercicio ───
  function numInput(obj, keyName, { min, max, step, placeholder, width, label, invalid }) {
    const el = h('input', { type: 'number', class: ['input', 'input--sm', 'input--num', invalid && 'is-invalid'], value: obj[keyName] ?? '', min, max, step, placeholder, 'aria-label': label, inputmode: 'decimal' });
    el.addEventListener('input', () => { obj[keyName] = el.value; el.classList.remove('is-invalid'); touch(); });
    return el;
  }

  function exerciseRow({ item, list, index, dayKey, section, rerender }) {
    const isOpen = expanded.has(item.key);
    const hasDetails = Boolean(item.notes || item.youtube_url || item.variant || (item.superset && item.superset.length) || item.series_breakdown || item.duration);

    const name = catalogCombobox({
      getItems: () => catalog, value: item.name, ariaLabel: `Nombre del ejercicio ${index + 1}`, className: ['input--sm', invalidFor(item.key, 'name') && 'is-invalid'],
      onInput: (v) => { item.name = v; if (item.id) item.id = null; touch(); },
      onPick: (picked) => {
        const filled = exerciseFromCatalog(picked);
        // Al elegir del catálogo se completan solo los campos vacíos: no se pisa lo ya escrito.
        item.id = filled.id; item.name = filled.name;
        ['sets', 'reps', 'notes', 'youtube_url', 'suggested_weight'].forEach((k) => { if (String(item[k] ?? '').trim() === '') item[k] = filled[k]; });
        if (!item.variant && filled.variant) item.variant = filled.variant;
        touch(); rerender();
      },
      onEnter: () => { const next = list[index + 1]; if (!next) { list.push(emptyExercise()); touch(); rerender(); requestAnimationFrame(() => container.querySelectorAll('.ex-name input')[container.querySelectorAll('.ex-name input').length - 1]?.focus()); } },
    });

    const unit = h('div', { class: 'unit', role: 'group', 'aria-label': 'Unidad de las repeticiones' },
      ...['reps', 'seconds'].map((u) => h('button', { type: 'button', class: ['unit__btn', item.reps_unit === u && 'is-active'], 'aria-pressed': String(item.reps_unit === u), title: u === 'reps' ? 'Repeticiones' : 'Segundos (ejercicios de tiempo, ej. plancha)', onClick: (e) => { item.reps_unit = u; e.currentTarget.parentElement.querySelectorAll('.unit__btn').forEach((b, i) => { b.classList.toggle('is-active', (i === 0) === (u === 'reps')); b.setAttribute('aria-pressed', String((i === 0) === (u === 'reps'))); }); touch(); } }, u === 'reps' ? 'Reps' : 'Seg')));

    const rir = selectInput([{ value: '', label: '—' }, { value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' }], String(item.rir ?? ''), { className: 'input--sm select--sm', 'aria-label': 'RIR (repeticiones en reserva)', title: 'RIR: repeticiones que le quedan en reserva' });
    rir.addEventListener('change', () => { item.rir = rir.value; touch(); });

    const row = h('div', { class: ['ex-row', isOpen && 'is-open'], dataset: { key: item.key }, onKeydown: (e) => {
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        if (move(list, index, index + (e.key === 'ArrowUp' ? -1 : 1))) { touch(); rerender(); requestAnimationFrame(() => container.querySelector(`.ex-row[data-key="${item.key}"] .ex-name input`)?.focus()); }
      }
    } },
      h('div', { class: 'ex-row__main' },
        h('span', { class: 'ex-grip', title: 'Arrastrá para reordenar (o Alt + ↑/↓)', 'aria-hidden': 'true' }, icon('grip', 16)),
        h('span', { class: 'ex-index num' }, String(index + 1)),
        h('div', { class: 'ex-name' }, name),
        numInput(item, 'sets', { min: 1, max: 20, step: 1, placeholder: '—', label: 'Series', invalid: invalidFor(item.key, 'sets') }),
        numInput(item, 'reps', { min: 1, max: 999, step: 1, placeholder: '—', label: item.reps_unit === 'seconds' ? 'Segundos' : 'Repeticiones', invalid: invalidFor(item.key, 'reps') }),
        unit,
        rir,
        numInput(item, 'suggested_weight', { min: 0, step: 0.5, placeholder: '—', label: 'Peso sugerido en kilos', invalid: invalidFor(item.key, 'suggested_weight') }),
        h('div', { class: 'ex-actions' },
          button(isOpen ? 'Ocultar detalles' : 'Más detalles', { size: 'sm', variant: 'ghost', iconOnly: true, icon: isOpen ? 'chevron-up' : 'chevron-down', 'aria-expanded': String(isOpen), title: 'Notas, video, series, variante y superserie', onClick: () => { if (isOpen) expanded.delete(item.key); else expanded.add(item.key); rerender(); } }),
          button('Eliminar ejercicio', { size: 'sm', variant: 'ghost', iconOnly: true, icon: 'trash', onClick: () => { list.splice(index, 1); expanded.delete(item.key); touch(); rerender(); } })
        )
      ),
      !isOpen && (item.notes || hasDetails) ? h('div', { class: 'ex-row__hint' }, [item.notes, item.variant?.name && `Variante: ${item.variant.name}`, item.superset?.length && `Superserie: ${item.superset.map((s) => s.name).filter(Boolean).join(', ')}`, item.series_breakdown && 'Por serie'].filter(Boolean).join(' · ')) : null,
      isOpen ? exerciseDetails({ item, section, rerender }) : null
    );
    return row;
  }

  function exerciseDetails({ item, section, rerender }) {
    const notes = textInput({ value: item.notes, placeholder: 'Observaciones para el alumno (técnica, tempo, descanso…)', 'aria-label': 'Observaciones' });
    notes.addEventListener('input', () => { item.notes = notes.value; touch(); });
    const yt = textInput({ type: 'url', value: item.youtube_url, placeholder: 'https://youtu.be/…', 'aria-label': 'Link de YouTube', className: 'input--mono' });
    const thumb = h('div', { class: 'yt-thumb' });
    const paintThumb = () => { const id = youtubeId(yt.value); mount(thumb, id ? h('img', { src: `https://img.youtube.com/vi/${id}/mqdefault.jpg`, alt: 'Miniatura del video', loading: 'lazy' }) : (yt.value.trim() ? h('span', { class: 'field__error' }, 'No parece un link de YouTube') : null)); };
    yt.addEventListener('input', () => { item.youtube_url = yt.value; paintThumb(); touch(); });
    paintThumb();

    const parts = [h('div', { class: 'ex-details__grid' }, field('Observaciones', notes), field('Video', h('div', { class: 'col', style: { gap: '6px' } }, yt, thumb)))];

    if (section) {
      const duration = textInput({ value: item.duration, placeholder: 'Ej. 10 min', 'aria-label': 'Duración' });
      duration.addEventListener('input', () => { item.duration = duration.value; touch(); });
      parts.push(h('div', { style: { maxWidth: '220px' } }, field('Duración', duration, { hint: 'Para calentamiento, cardio, etc.' })));
    }

    // Series por separado
    const seriesOn = Array.isArray(item.series_breakdown);
    const seriesToggle = switchInput({ checked: seriesOn, label: 'Cargar peso, reps y RIR serie por serie', onChange: (on) => {
      if (on) { const n = Math.max(1, parseInt(item.sets, 10) || 3); item.series_breakdown = Array.from({ length: n }, () => ({ key: newKey(), weight: item.suggested_weight || '', reps: item.reps || '', rir: item.rir || '' })); }
      else item.series_breakdown = null;
      touch(); rerender();
    } });
    parts.push(seriesToggle);
    if (seriesOn) {
      const rows = item.series_breakdown;
      parts.push(h('div', { class: 'series' }, h('div', { class: 'series__head' }, h('span'), h('span', null, 'Kg'), h('span', null, item.reps_unit === 'seconds' ? 'Seg' : 'Reps'), h('span', null, 'RIR'), h('span')),
        ...rows.map((s, i) => {
          const w = numInput(s, 'weight', { min: 0, step: 0.5, placeholder: '—', label: `Peso de la serie ${i + 1}` });
          const r = numInput(s, 'reps', { min: 1, max: 999, step: 1, placeholder: '—', label: `Repeticiones de la serie ${i + 1}` });
          const ri = selectInput([{ value: '', label: '—' }, { value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' }], String(s.rir ?? ''), { className: 'input--sm select--sm', 'aria-label': `RIR de la serie ${i + 1}` });
          ri.addEventListener('change', () => { s.rir = ri.value; touch(); });
          return h('div', { class: 'series__row' }, h('span', { class: 'series__n' }, `Serie ${i + 1}`), w, r, ri, button('Quitar serie', { size: 'sm', variant: 'ghost', iconOnly: true, icon: 'x', onClick: () => { rows.splice(i, 1); if (!rows.length) item.series_breakdown = null; touch(); rerender(); } }));
        }),
        button('Agregar serie', { size: 'sm', variant: 'ghost', icon: 'plus', onClick: () => { const last = rows[rows.length - 1]; rows.push({ key: newKey(), weight: last?.weight || '', reps: last?.reps || '', rir: last?.rir || '' }); touch(); rerender(); } })));
    }

    // Variante
    parts.push(variantBox(item, rerender));

    // Superserie
    parts.push(supersetBox(item, rerender));

    return h('div', { class: 'ex-details' }, ...parts);
  }

  function variantBox(item, rerender) {
    if (!item.variant) {
      return h('div', null, button('Agregar variante', { size: 'sm', variant: 'ghost', icon: 'plus', title: 'Una alternativa del mismo ejercicio (ej. con mancuernas en vez de barra)', onClick: () => { item.variant = { id: null, name: '', youtube_url: '', sets: '', reps: '', reps_unit: 'reps', notes: '', suggested_weight: '' }; touch(); rerender(); } }));
    }
    const v = item.variant;
    const name = catalogCombobox({ getItems: () => catalog, value: v.name, placeholder: 'Nombre de la variante', ariaLabel: 'Nombre de la variante', className: 'input--sm',
      onInput: (t) => { v.name = t; v.id = null; touch(); },
      onPick: (picked) => { v.id = picked.id; v.name = picked.name; if (picked.youtube_url) v.youtube_url = picked.youtube_url; if (!v.sets && picked.sets) v.sets = picked.sets; if (!v.reps && picked.reps) v.reps = picked.reps; if (!v.notes && picked.notes) v.notes = picked.notes; touch(); rerender(); } });
    const yt = textInput({ type: 'url', value: v.youtube_url, placeholder: 'Link de YouTube (obligatorio)', className: ['input--sm', 'input--mono', invalidFor(item.key, 'variant') && !v.youtube_url && 'is-invalid'], 'aria-label': 'Link de YouTube de la variante' });
    yt.addEventListener('input', () => { v.youtube_url = yt.value; touch(); });
    const notes = textInput({ value: v.notes, placeholder: 'Notas de la variante', className: 'input--sm', 'aria-label': 'Notas de la variante' });
    notes.addEventListener('input', () => { v.notes = notes.value; touch(); });
    return h('div', { class: 'sub-box' },
      h('div', { class: 'sub-box__head' }, h('strong', null, 'Variante'), button('Quitar variante', { size: 'sm', variant: 'ghost', icon: 'trash', onClick: () => { item.variant = null; touch(); rerender(); } })),
      h('div', { class: 'sub-box__grid' }, name, numInput(v, 'sets', { min: 1, max: 20, step: 1, placeholder: 'Series', label: 'Series de la variante' }), numInput(v, 'reps', { min: 1, max: 999, step: 1, placeholder: 'Reps', label: 'Repeticiones de la variante' }), numInput(v, 'suggested_weight', { min: 0, step: 0.5, placeholder: 'Kg', label: 'Peso de la variante' })),
      h('div', { class: 'sub-box__grid sub-box__grid--2' }, yt, notes));
  }

  function supersetBox(item, rerender) {
    const items = item.superset;
    const rows = items.map((s, i) => {
      const name = catalogCombobox({ getItems: () => catalog, value: s.name, placeholder: 'Ejercicio de la superserie', ariaLabel: `Ejercicio ${i + 1} de la superserie`, className: 'input--sm',
        onInput: (t) => { s.name = t; s.id = null; touch(); },
        onPick: (picked) => { s.id = picked.id; s.name = picked.name; if (!s.sets && picked.sets) s.sets = picked.sets; if (!s.reps && picked.reps) s.reps = picked.reps; if (!s.youtube_url && picked.youtube_url) s.youtube_url = picked.youtube_url; if (!s.notes && picked.notes) s.notes = picked.notes; touch(); rerender(); } });
      const rir = selectInput([{ value: '', label: 'RIR' }, { value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' }], String(s.rir ?? ''), { className: 'input--sm select--sm', 'aria-label': 'RIR' });
      rir.addEventListener('change', () => { s.rir = rir.value; touch(); });
      const unitBtn = button(s.reps_unit === 'seconds' ? 'Seg' : 'Reps', { size: 'sm', variant: 'secondary', title: 'Cambiar entre repeticiones y segundos', onClick: (e) => { s.reps_unit = s.reps_unit === 'seconds' ? 'reps' : 'seconds'; e.currentTarget.textContent = s.reps_unit === 'seconds' ? 'Seg' : 'Reps'; touch(); } });
      return h('div', { class: 'sub-box__grid sub-box__grid--super' }, name, numInput(s, 'sets', { min: 1, max: 20, step: 1, placeholder: 'Series', label: 'Series' }), numInput(s, 'reps', { min: 1, max: 999, step: 1, placeholder: 'Reps', label: 'Repeticiones' }), unitBtn, rir, numInput(s, 'suggested_weight', { min: 0, step: 0.5, placeholder: 'Kg', label: 'Peso' }), button('Quitar', { size: 'sm', variant: 'ghost', iconOnly: true, icon: 'x', onClick: () => { items.splice(i, 1); touch(); rerender(); } }));
    });
    if (!items.length) return h('div', null, button('Agregar superserie', { size: 'sm', variant: 'ghost', icon: 'plus', title: 'Un ejercicio que se hace enseguida del anterior, sin descanso', onClick: () => { items.push(emptySuperset()); touch(); rerender(); } }));
    return h('div', { class: 'sub-box' }, h('div', { class: 'sub-box__head' }, h('strong', null, 'Superserie'), h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, 'Se hace enseguida de este ejercicio')), ...rows, button('Agregar otro ejercicio', { size: 'sm', variant: 'ghost', icon: 'plus', onClick: () => { items.push(emptySuperset()); touch(); rerender(); } }));
  }

  // ─── Vista previa (cómo lo ve el alumno) ───
  function openPreview() {
    const body = h('div', { class: 'preview selectable' });
    if (draft.category === 'nutrition') {
      body.appendChild(h('pre', { class: 'preview__text' }, draft.content || 'Todavía no escribiste nada.'));
    } else {
      const block = (title, items) => items.filter((x) => x.name.trim()).length ? h('div', { class: 'preview__block' }, h('div', { class: 'preview__label' }, title), items.filter((x) => x.name.trim()).map(previewItem)) : null;
      const general = draft.general.order.map((t) => block(`${SECTION_LABELS[t]} general`, draft.general[t]));
      body.append(...general.filter(Boolean));
      draft.days.forEach((d, i) => {
        body.appendChild(h('section', { class: 'preview__day' }, h('h3', { class: 'preview__dayname' }, `Día ${i + 1}`, d.name ? h('span', null, ` · ${d.name}`) : null), ...d.sectionOrder.map((t) => block(t === 'exercises' ? 'Ejercicios' : SECTION_LABELS[t], d[t])).filter(Boolean), d.exercises.filter((x) => x.name.trim()).length + SECTION_TYPES.reduce((n, t) => n + d[t].length, 0) === 0 ? h('p', { class: 'faint' }, 'Sin ejercicios.') : null));
      });
    }
    openModal({ title: draft.title || 'Vista previa', subtitle: 'Así se organiza el plan para el alumno (el diseño en la app puede variar).', size: 'lg', body });
  }

  function previewItem(x) {
    return h('div', { class: 'preview__item' },
      h('div', { class: 'row' }, h('strong', null, x.name), x.youtube_url ? icon('play', 14) : null, h('span', { class: 'grow' }), h('span', { class: 'preview__sum num' }, summarize(x))),
      x.notes ? h('div', { class: 'preview__notes' }, x.notes) : null,
      x.series_breakdown ? h('div', { class: 'preview__series' }, x.series_breakdown.map((s, i) => h('span', { class: 'chip' }, `S${i + 1}: ${[s.weight && `${s.weight} kg`, s.reps && `${s.reps}${x.reps_unit === 'seconds' ? ' seg' : ''}`, s.rir !== '' && `RIR ${s.rir}`].filter(Boolean).join(' · ') || '—'}`))) : null,
      x.variant?.name ? h('div', { class: 'preview__sub' }, `Variante: ${x.variant.name}${summarize({ ...x.variant, rir: '' }) ? ` — ${summarize({ ...x.variant, rir: '' })}` : ''}`) : null,
      (x.superset || []).filter((s) => s.name.trim()).map((s) => h('div', { class: 'preview__sub' }, `+ Superserie: ${s.name}${summarize(s) ? ` — ${summarize(s)}` : ''}`)));
  }

  // ─── Atajos del editor ───
  let editorSave = () => {};
  const onKey = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 's') { e.preventDefault(); editorSave(); }
    else if (key === 'd' && draft?.category === 'training' && !document.querySelector('.overlay')) { e.preventDefault(); duplicateDay(); }
  };
  document.addEventListener('keydown', onKey);

  load();

  return {
    async beforeLeave() {
      if (!isDirty()) return true;
      return new Promise((resolve) => {
        let decided = false;
        const finish = (value) => { if (decided) return; decided = true; layer.close(); resolve(value); };
        const layer = openModal({
          title: 'Hay cambios sin guardar',
          size: 'sm',
          body: h('p', { class: 'muted' }, `Si salís ahora, se pierden los cambios de “${draft.title || 'este plan'}”.`),
          footer: [
            button('Seguir editando', { variant: 'ghost', onClick: () => finish(false) }),
            button('Salir sin guardar', { variant: 'danger', onClick: () => { try { localStorage.removeItem(draftKey); } catch (_e) { /* nada */ } finish(true); } }),
            button('Guardar y salir', { variant: 'primary', onClick: async () => { const ok = await save({ silent: true }); if (ok) { notify.ok('Plan guardado.'); finish(true); } } }),
          ],
          onClose: () => { if (!decided) { decided = true; resolve(false); } },
        });
      });
    },
    refresh: () => { if (!isDirty()) load(); else notify.info('Tenés cambios sin guardar; no se recarga el plan.'); },
    destroy() {
      destroyed = true;
      document.removeEventListener('keydown', onKey);
      if (window.__ftEditor?.undo === undo) delete window.__ftEditor;
      document.querySelectorAll('.combo').forEach((el) => el.remove());
      window.onbeforeunload = null;
    },
  };
}
