// Arma el contenido imprimible de un plan (rutina o alimentación) a partir del borrador del editor.
// Se construye con nodos DOM (texto siempre escapado) y se serializa; el proceso principal lo
// imprime a PDF en una ventana oculta y sin scripts.
import { h } from './h.js';
import { SECTION_LABELS, summarize } from './planModel.js';
import { formatDate } from './format.js';

const named = (list) => list.filter((x) => x.name.trim());

function exerciseRow(item) {
  const sub = [];
  if (item.notes) sub.push(h('div', { class: 'note' }, item.notes));
  if (item.series_breakdown?.length) {
    sub.push(h('div', { class: 'sub' }, item.series_breakdown.map((s, i) => `Serie ${i + 1}: ${[s.weight !== '' && `${s.weight} kg`, s.reps !== '' && `${s.reps}${item.reps_unit === 'seconds' ? ' seg' : ' reps'}`, s.rir !== '' && `RIR ${s.rir}`].filter(Boolean).join(' · ') || '—'}`).join('   |   ')));
  }
  if (item.variant?.name) sub.push(h('div', { class: 'sub' }, `Variante: ${item.variant.name}${summarize({ ...item.variant, rir: '' }) ? ` — ${summarize({ ...item.variant, rir: '' })}` : ''}`));
  named(item.superset || []).forEach((s) => sub.push(h('div', { class: 'sub' }, `Superserie: ${s.name}${summarize(s) ? ` — ${summarize(s)}` : ''}`)));
  return h('tr', null,
    h('td', null, h('div', { class: 'ex-name' }, item.name), ...sub),
    h('td', { class: 'nowrap' }, [item.sets && item.reps ? `${item.sets} × ${item.reps}${item.reps_unit === 'seconds' ? ' seg' : ''}` : item.sets ? `${item.sets} series` : item.reps ? `${item.reps}${item.reps_unit === 'seconds' ? ' seg' : ' reps'}` : item.duration || ''].join('')),
    h('td', { class: 'nowrap' }, item.rir !== '' && item.rir != null ? `RIR ${item.rir}` : ''),
    h('td', { class: 'nowrap' }, item.suggested_weight !== '' && item.suggested_weight != null ? `${String(item.suggested_weight).replace('.', ',')} kg` : ''));
}

function block(title, items) {
  const rows = named(items);
  if (!rows.length) return null;
  return h('div', null, h('h3', null, title), h('table', null, h('thead', null, h('tr', null, h('th', null, 'Ejercicio'), h('th', null, 'Series × reps'), h('th', null, 'RIR'), h('th', null, 'Kg'))), h('tbody', null, rows.map(exerciseRow))));
}

// Devuelve { title, bodyHtml } listo para mandar al proceso principal.
export function buildPlanDocument(draft) {
  const head = h('div', { class: 'doc-head' }, h('div', null, h('h1', { class: 'doc-title' }, draft.title || 'Plan'), draft.description ? h('p', { class: 'doc-sub' }, draft.description) : null));
  const root = h('div', null, head);

  if (draft.category === 'nutrition') {
    root.appendChild(h('div', { class: 'text' }, draft.content || ''));
  } else {
    draft.general.order.forEach((type) => { const b = block(`${SECTION_LABELS[type]} general`, draft.general[type]); if (b) root.appendChild(b); });
    draft.days.forEach((day, index) => {
      const sections = day.sectionOrder.map((type) => block(type === 'exercises' ? 'Ejercicios' : SECTION_LABELS[type], day[type])).filter(Boolean);
      if (!sections.length) return;
      root.appendChild(h('h2', null, `Día ${index + 1}${day.name ? ` · ${day.name}` : ''}`));
      sections.forEach((s) => root.appendChild(s));
    });
  }
  root.appendChild(h('div', { class: 'footer' }, `Figueroa Trainer · ${formatDate(new Date())}`));
  return { title: draft.title || 'Plan', // el logo se agrega ya serializado (un <img> creado acá intentaría cargarse desde la ventana)
bodyHtml: root.outerHTML.replace('<div class="doc-head">', '<div class="doc-head"><img src="__LOGO__" alt="">') };
}
