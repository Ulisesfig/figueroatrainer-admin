// Panel de ingresos: cobrado por mes (suscripciones y tienda), altas de alumnos y números clave.
import { h, svg } from '../lib/h.js';
import { icon } from '../lib/icons.js';
import { emptyState } from '../lib/ui.js';
import { expirationState } from '../lib/data.js';
import { formatMoney, plural, toDateKey } from '../lib/format.js';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const monthKey = (dateKey) => dateKey.slice(0, 7);

function lastMonths(count) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MONTHS[d.getMonth()], year: d.getFullYear() };
  });
}

const compact = (value) => (value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1).replace('.', ',')} M` : value >= 1000 ? `${Math.round(value / 1000)} mil` : String(Math.round(value)));

// Barras (apiladas si hay más de una serie). series: [{ name, className, values }]
function barChart({ months, series, format = (v) => String(v), ariaLabel }) {
  const width = 640; const height = 210; const padL = 44; const padB = 28; const padT = 16;
  const totals = months.map((_, i) => series.reduce((sum, s) => sum + s.values[i], 0));
  const max = Math.max(...totals, 1);
  const step = (() => { const raw = max / 4; const pow = 10 ** Math.floor(Math.log10(raw || 1)); return Math.max(1, Math.ceil(raw / pow) * pow); })();
  const top = Math.ceil(max / step) * step;
  const slot = (width - padL) / months.length;
  const barW = Math.min(36, slot * 0.62);
  const y = (v) => padT + (height - padT - padB) * (1 - v / top);

  const el = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart', role: 'img', 'aria-label': ariaLabel });
  for (let v = 0; v <= top; v += step) {
    el.appendChild(svg('line', { x1: padL, x2: width, y1: y(v), y2: y(v), stroke: 'rgba(236,232,220,0.1)' }));
    const t = svg('text', { x: padL - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'chart__axis' }); t.textContent = compact(v); el.appendChild(t);
  }
  months.forEach((m, i) => {
    const x = padL + slot * i + (slot - barW) / 2;
    let acc = 0;
    series.forEach((s) => {
      const value = s.values[i];
      if (value <= 0) return;
      const rect = svg('rect', { x, y: y(acc + value), width: barW, height: Math.max(1.5, y(acc) - y(acc + value)), class: s.className, rx: series.length === 1 ? 4 : 2 });
      const tip = svg('title', {}); tip.textContent = `${m.label} ${m.year} · ${s.name}: ${format(value)}`; rect.appendChild(tip);
      el.appendChild(rect);
      acc += value;
    });
    const label = svg('text', { x: x + barW / 2, y: height - 9, 'text-anchor': 'middle', class: 'chart__axis' }); label.textContent = m.label; el.appendChild(label);
    if (totals[i] > 0 && slot > 40) { const v = svg('text', { x: x + barW / 2, y: y(totals[i]) - 4, 'text-anchor': 'middle', class: 'chart__value' }); v.textContent = compact(totals[i]); el.appendChild(v); }
  });
  return el;
}

const legend = (items) => h('div', { class: 'row wrap', style: { gap: '14px', marginTop: '6px' } }, items.map(([cls, text]) => h('span', { class: 'legend' }, h('span', { class: `legend__dot ${cls}` }), text)));

export function incomePanel(payments, users) {
  const months = lastMonths(12);
  const approved = payments.filter((p) => String(p.status).toLowerCase() === 'approved');
  if (!approved.length && !users.length) return emptyState({ icon: 'card', title: 'Todavía no hay datos', text: 'Cuando haya cobros y alumnos, acá vas a ver cómo evoluciona el negocio.' });

  const plans = months.map(() => 0);
  const store = months.map(() => 0);
  approved.forEach((p) => {
    const i = months.findIndex((m) => m.key === monthKey(toDateKey(p.created_at)));
    if (i < 0) return;
    if (String(p.source).toLowerCase() === 'store') store[i] += Number(p.amount || 0); else plans[i] += Number(p.amount || 0);
  });
  const students = users.filter((u) => String(u.role).toLowerCase() !== 'admin');
  const signups = months.map((m) => students.filter((u) => monthKey(toDateKey(u.created_at)) === m.key).length);

  const monthTotals = months.map((_, i) => plans[i] + store[i]);
  const total12 = monthTotals.reduce((a, b) => a + b, 0);
  const activeMonths = monthTotals.filter((v) => v > 0).length || 1;
  const bestIndex = monthTotals.indexOf(Math.max(...monthTotals));
  const inRange = approved.filter((p) => months.some((m) => m.key === monthKey(toDateKey(p.created_at))));
  const ticket = inRange.length ? inRange.reduce((s, p) => s + Number(p.amount || 0), 0) / inRange.length : 0;
  const storeShare = total12 ? Math.round((store.reduce((a, b) => a + b, 0) / total12) * 100) : 0;
  const current = students.filter((u) => ['ok', 'soon'].includes(expirationState(u).kind)).length;
  const expiredNow = students.filter((u) => expirationState(u).kind === 'expired').length;
  const thisMonthSignups = signups[signups.length - 1];

  const kpi = (label, value, sub, tone) => h('div', { class: ['stat', tone && `stat--${tone}`] }, h('div', { class: 'stat__label' }, label), h('div', { class: 'stat__value num' }, value), h('div', { class: 'stat__sub' }, sub));

  return h('div', { class: 'col gap-24' },
    h('div', { class: 'stat-row' },
      kpi('Cobrado en 12 meses', formatMoney(total12), `${formatMoney(total12 / activeMonths)} por mes en promedio`, 'brass'),
      kpi('Mejor mes', monthTotals[bestIndex] > 0 ? formatMoney(monthTotals[bestIndex]) : '—', monthTotals[bestIndex] > 0 ? `${months[bestIndex].label} ${months[bestIndex].year}` : 'Sin cobros todavía'),
      kpi('Cobro promedio', formatMoney(ticket), `${plural(inRange.length, 'pago aprobado', 'pagos aprobados')} · ${storeShare}% tienda`),
      kpi('Alumnos con plan vigente', String(current), `${plural(expiredNow, 'vencido', 'vencidos')} · ${plural(thisMonthSignups, 'alta este mes', 'altas este mes')}`)),
    h('div', { class: 'income-grid' },
      h('section', { class: 'card' }, h('div', { class: 'card__head' }, h('h2', { class: 'card__title' }, 'Cobrado por mes')),
        h('div', { class: 'card__body' }, total12 ? [barChart({ months, series: [{ name: 'Suscripciones', className: 'chart__bar', values: plans }, { name: 'Tienda', className: 'chart__bar chart__bar--alt', values: store }], format: formatMoney, ariaLabel: 'Cobrado por mes' }), legend([['chart__bar', 'Suscripciones'], ['chart__bar chart__bar--alt', 'Tienda']])] : h('p', { class: 'faint' }, 'Todavía no hay cobros aprobados en los últimos 12 meses.'))),
      h('section', { class: 'card' }, h('div', { class: 'card__head' }, h('h2', { class: 'card__title' }, 'Alumnos nuevos por mes')),
        h('div', { class: 'card__body' }, signups.some(Boolean) ? barChart({ months, series: [{ name: 'Altas', className: 'chart__bar chart__bar--info', values: signups }], ariaLabel: 'Alumnos nuevos por mes' }) : h('p', { class: 'faint' }, 'Todavía no hay altas en los últimos 12 meses.')))),
    h('p', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, icon('info', 13), ' Solo se cuentan los pagos aprobados. La fecha es la del pago, no la del vencimiento del alumno.'));
}
