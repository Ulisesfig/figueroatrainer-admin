// Pestaña "Alimentación" del panel de cada alumno: objetivos diarios y lo que registró.
import { h, mount } from '../lib/h.js';
import { api, errorMessage } from '../lib/api.js';
import { button, badge, emptyState, errorBox, field, loadingBlock, markInvalid, notify, textInput, withBusy } from '../lib/ui.js';
import { formatDate } from '../lib/format.js';

const DAYS = 14;
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('es-AR');
const unavailable = (error) => error?.status === 400 || error?.status === 404;

// Un día "cumple" si queda dentro de ±10 % del objetivo de calorías.
function dayState(kcal, goal) {
  if (!goal) return null;
  const ratio = kcal / goal;
  if (ratio < 0.9) return ['Debajo', 'warn'];
  if (ratio > 1.1) return ['Arriba', 'danger'];
  return ['En objetivo', 'ok'];
}

export async function nutritionTab(host, user, isActive) {
  mount(host, loadingBlock('Cargando alimentación…'));
  let data;
  try {
    data = await api.get(`/api/admin/users/${user.id}/nutrition`, { days: DAYS });
  } catch (error) {
    if (!isActive()) return;
    if (unavailable(error)) {
      mount(host, h('div', { class: 'drawer__pad' }, emptyState({ icon: 'info', title: 'Esta función necesita el servidor actualizado', text: 'Cuando el servidor tenga la última versión, vas a verla acá.' })));
      return;
    }
    mount(host, h('div', { class: 'drawer__pad' }, errorBox(errorMessage(error), () => nutritionTab(host, user, isActive))));
    return;
  }
  if (!isActive()) return;

  const goals = data.goals || {};
  const inputs = {
    kcal: textInput({ inputmode: 'numeric', value: goals.kcal ?? '', placeholder: 'Ej: 2200' }),
    protein: textInput({ inputmode: 'numeric', value: goals.protein ?? '', placeholder: 'g' }),
    carbs: textInput({ inputmode: 'numeric', value: goals.carbs ?? '', placeholder: 'g' }),
    fat: textInput({ inputmode: 'numeric', value: goals.fat ?? '', placeholder: 'g' }),
  };
  const fromMacros = h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } });
  const readNumber = (input) => {
    const raw = String(input.value).trim().replace(',', '.');
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : NaN;
  };
  const paintMacros = () => {
    const [p, c, f] = [readNumber(inputs.protein), readNumber(inputs.carbs), readNumber(inputs.fat)];
    const total = (p || 0) * 4 + (c || 0) * 4 + (f || 0) * 9;
    fromMacros.textContent = total ? `Según los macros: ${fmt(total)} kcal` : '';
    return total;
  };
  ['protein', 'carbs', 'fat'].forEach((k) => inputs[k].addEventListener('input', paintMacros));
  paintMacros();

  const saveBtn = button('Guardar objetivos', { variant: 'primary', icon: 'check' });
  saveBtn.addEventListener('click', () => withBusy(saveBtn, async () => {
    const body = {};
    let invalid = false;
    for (const [key, input] of Object.entries(inputs)) {
      const v = readNumber(input);
      markInvalid(input, Number.isNaN(v));
      if (Number.isNaN(v)) invalid = true;
      body[key] = Number.isNaN(v) ? null : v;
    }
    if (invalid) { notify.error('Revisá los valores: tienen que ser números.'); return; }
    try {
      await api.put(`/api/admin/users/${user.id}/nutrition-goals`, body);
      notify.ok('Objetivos guardados. El alumno ya los ve en la app y en la web.');
      nutritionTab(host, user, isActive);
    } catch (error) {
      notify.error(errorMessage(error));
    }
  }));
  const useMacrosBtn = button('Usar kcal de los macros', { size: 'sm' });
  useMacrosBtn.addEventListener('click', () => { const t = paintMacros(); if (t) inputs.kcal.value = String(t); });

  const days = [...(data.days || [])].reverse();
  const logged = days.length;
  const avg = logged ? days.reduce((s, d) => s + d.kcal, 0) / logged : 0;
  const avgProtein = logged ? days.reduce((s, d) => s + d.protein, 0) / logged : 0;
  const onTarget = goals.kcal ? days.filter((d) => dayState(d.kcal, goals.kcal)?.[1] === 'ok').length : null;
  const statBox = (label, value, sub) => h('div', { class: 'stat' }, h('div', { class: 'stat__label' }, label), h('div', { class: 'stat__value num', style: { fontSize: '1.5rem' } }, value), h('div', { class: 'stat__sub' }, sub));

  mount(host, h('div', { class: 'drawer__pad col gap-16' },
    h('section', { class: 'section' },
      h('div', { class: 'section__title' }, 'Objetivos diarios'),
      h('p', { class: 'faint', style: { marginTop: 0 } }, 'Los ve el alumno en la sección "Comidas" de la app y en "Mi Día" de la web. Dejá vacío lo que no quieras fijar.'),
      h('div', { class: 'form-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px' } },
        field('Calorías (kcal)', inputs.kcal),
        field('Proteínas (g)', inputs.protein),
        field('Carbohidratos (g)', inputs.carbs),
        field('Grasas (g)', inputs.fat)),
      h('div', { class: 'row', style: { gap: '12px', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap' } }, saveBtn, useMacrosBtn, fromMacros)),
    h('div', { class: 'stat-row stat-row--3' },
      statBox(`Días registrados (${DAYS})`, String(logged), logged ? `de los últimos ${DAYS} días` : 'Todavía no registró comidas'),
      statBox('Promedio diario', logged ? `${fmt(avg)} kcal` : '—', logged ? `${fmt(avgProtein)} g de proteínas` : ''),
      statBox('Días en objetivo', onTarget === null ? '—' : `${onTarget} / ${logged}`, goals.kcal ? 'dentro de ±10 % de las calorías' : 'Fijá un objetivo de calorías')),
    h('section', { class: 'section' },
      h('div', { class: 'section__title' }, 'Lo que registró'),
      logged
        ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
          h('thead', null, h('tr', null, h('th', null, 'Día'), h('th', { class: 'num' }, 'Calorías'), h('th', { class: 'num' }, 'Prot.'), h('th', { class: 'num' }, 'Carb.'), h('th', { class: 'num' }, 'Grasas'), h('th', null, ''))),
          h('tbody', null, days.map((d) => {
            const st = dayState(d.kcal, goals.kcal);
            return h('tr', null,
              h('td', null, formatDate(`${d.day}T12:00:00`)),
              h('td', { class: 'num' }, goals.kcal ? `${fmt(d.kcal)} / ${fmt(goals.kcal)}` : fmt(d.kcal)),
              h('td', { class: 'num' }, `${fmt(d.protein)} g`),
              h('td', { class: 'num' }, `${fmt(d.carbs)} g`),
              h('td', { class: 'num' }, `${fmt(d.fat)} g`),
              h('td', null, st ? badge(st[0], st[1]) : null));
          }))))
        : h('p', { class: 'faint' }, 'Todavía no registró comidas en los últimos 14 días.'))));
}
