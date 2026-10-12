// Pagos: historial de cobros (suscripciones y tienda) con filtros, totales del mes y exportación.
import { h, mount } from '../lib/h.js';
import { icon } from '../lib/icons.js';
import { errorMessage } from '../lib/api.js';
import { button, emptyState, errorBox, loadingBlock, notify, segmented, selectInput, textInput } from '../lib/ui.js';
import { loadPayments, loadUsers } from '../lib/data.js';
import { incomePanel } from './income.js';
import { paymentStatusBadge, paymentStatusInfo } from '../lib/status.js';
import { formatMoney, formatDateTime, fullName, normalize, debounce, plural, toCsv, toDateKey, todayKey, timeAgo, formatNumber } from '../lib/format.js';

const STATUSES = ['approved', 'pending', 'in_process', 'rejected', 'cancelled', 'expired'];
const PAGE_STEP = 100;

const sourceOf = (p) => (String(p.source || '').toLowerCase() === 'store' ? 'store' : 'plans');
const METHODS = { credit_card: 'Tarjeta de crédito', debit_card: 'Tarjeta de débito', account_money: 'Dinero en cuenta', ticket: 'Efectivo', bank_transfer: 'Transferencia', prepaid_card: 'Tarjeta prepaga', visa: 'Visa', master: 'Mastercard', amex: 'American Express', naranja: 'Naranja', cabal: 'Cabal', debvisa: 'Visa Débito', debmaster: 'Mastercard Débito', maestro: 'Maestro' };
const methodLabel = (p) => [p.payment_method, p.payment_type].filter(Boolean).map((m) => METHODS[String(m).toLowerCase()] || m).filter((m, i, a) => a.indexOf(m) === i).join(' · ') || '—';
const concept = (p) => p.product_name || p.plan_type || 'Pago';

export function paymentsView(container, _params, app) {
  let payments = [];
  let source = 'all';
  let status = 'all';
  let query = '';
  let visible = PAGE_STEP;
  let destroyed = false;
  let lastRows = [];

  const searchInput = textInput({ type: 'search', placeholder: 'Buscar por alumno, email o concepto…', 'aria-label': 'Buscar pagos' });
  const segments = segmented([{ value: 'all', label: 'Todos', count: 0 }, { value: 'plans', label: 'Suscripciones', count: 0 }, { value: 'store', label: 'Tienda', count: 0 }], source, (v) => { source = v; visible = PAGE_STEP; paint(); });
  const statusSelect = selectInput([{ value: 'all', label: 'Todos los estados' }, ...STATUSES.map((s) => ({ value: s, label: paymentStatusInfo(s)[0] }))], 'all', { 'aria-label': 'Filtrar por estado', style: { width: '190px' } });
  const summaryHost = h('div', { class: 'stat-row' });
  const tableHost = h('div');

  const exportBtn = button('Exportar CSV', { icon: 'download', onClick: () => exportCsv() });
  const incomeHost = h('div', { class: 'hidden' });
  const listWrap = h('div', null, summaryHost,
    h('div', { class: 'toolbar' }, h('div', { class: 'input-icon grow', style: { maxWidth: '420px' } }, icon('search', 16), searchInput), statusSelect, segments),
    tableHost);
  const viewSeg = segmented([{ value: 'list', label: 'Historial' }, { value: 'income', label: 'Ingresos' }], 'list', (v) => showView(v));

  async function showView(view) {
    listWrap.classList.toggle('hidden', view === 'income');
    incomeHost.classList.toggle('hidden', view !== 'income');
    exportBtn.classList.toggle('hidden', view === 'income');
    if (view !== 'income') return;
    mount(incomeHost, loadingBlock('Calculando ingresos…'));
    try {
      const [list, users] = await Promise.all([loadPayments(), loadUsers()]);
      if (!destroyed) mount(incomeHost, incomePanel(list, users));
    } catch (error) { if (!destroyed) mount(incomeHost, errorBox(errorMessage(error), () => showView('income'))); }
  }

  const page = h('div', { class: 'page' },
    h('div', { class: 'page__head' }, h('div', null, h('h1', { class: 'page__title' }, 'Pagos'), h('p', { class: 'page__sub' }, 'Todo lo que se cobró y lo que quedó pendiente, con su estado en Mercado Pago.')), h('div', { class: 'page__actions' }, viewSeg, exportBtn)),
    listWrap,
    incomeHost);
  mount(container, page);

  searchInput.addEventListener('input', debounce(() => { query = normalize(searchInput.value.trim()); visible = PAGE_STEP; paint(); }, 120));
  statusSelect.addEventListener('change', () => { status = statusSelect.value; visible = PAGE_STEP; paint(); });

  async function load({ force = false } = {}) {
    mount(tableHost, loadingBlock('Cargando pagos…'));
    try { payments = await loadPayments({ force }); if (!destroyed) paint(); }
    catch (error) { if (!destroyed) mount(tableHost, errorBox(errorMessage(error), () => load({ force: true }))); }
  }

  const isApproved = (p) => String(p.status).toLowerCase() === 'approved';

  function paintSummary() {
    const today = todayKey();
    const monthStart = `${today.slice(0, 7)}-01`;
    const prevDate = new Date(`${monthStart}T00:00:00`); prevDate.setMonth(prevDate.getMonth() - 1);
    const prevStart = toDateKey(prevDate);
    const inRange = (p, from, to) => { const k = toDateKey(p.created_at); return isApproved(p) && k >= from && (!to || k < to); };
    const sum = (list) => list.reduce((s, p) => s + Number(p.amount || 0), 0);
    const thisMonth = payments.filter((p) => inRange(p, monthStart));
    const lastMonth = payments.filter((p) => inRange(p, prevStart, monthStart));
    const pending = payments.filter((p) => ['pending', 'in_process'].includes(String(p.status).toLowerCase()));
    const totalThis = sum(thisMonth); const totalPrev = sum(lastMonth);
    const delta = totalPrev > 0 ? Math.round(((totalThis - totalPrev) / totalPrev) * 100) : null;
    const stat = (label, value, sub, tone) => h('div', { class: ['stat', tone && `stat--${tone}`] }, h('div', { class: 'stat__label' }, label), h('div', { class: 'stat__value num' }, value), h('div', { class: 'stat__sub' }, sub));
    mount(summaryHost,
      stat('Cobrado este mes', formatMoney(totalThis), `${plural(thisMonth.length, 'pago aprobado', 'pagos aprobados')}`, 'brass'),
      stat('Mes anterior', formatMoney(totalPrev), delta === null ? 'Sin datos para comparar' : `${delta >= 0 ? '+' : ''}${delta}% este mes`),
      stat('Pendientes', String(pending.length), pending.length ? `${formatMoney(sum(pending))} por confirmarse` : 'Nada por confirmar', pending.length ? 'warn' : undefined),
      stat('Cobrado en total', formatMoney(sum(payments.filter(isApproved))), `${plural(payments.filter(isApproved).length, 'pago', 'pagos')} aprobados`));
  }

  function filtered() {
    return payments
      .filter((p) => source === 'all' || sourceOf(p) === source)
      .filter((p) => status === 'all' || String(p.status).toLowerCase() === status)
      .filter((p) => !query || normalize(`${fullName({ name: p.name, surname: p.surname, email: p.email })} ${p.email || ''} ${concept(p)} ${p.mp_payment_id || ''}`).includes(query));
  }

  function paint() {
    if (destroyed) return;
    ['all', 'plans', 'store'].forEach((k) => segments.setCount(k, k === 'all' ? payments.length : payments.filter((p) => sourceOf(p) === k).length));
    paintSummary();
    const rows = filtered();
    lastRows = rows;
    if (!payments.length) { mount(tableHost, emptyState({ icon: 'card', title: 'Todavía no hay pagos', text: 'Cuando un alumno pague una suscripción o compre en la tienda, el cobro aparece acá.' })); return; }
    if (!rows.length) { mount(tableHost, h('div', { class: 'table-wrap' }, emptyState({ icon: 'search', title: 'Sin resultados', text: 'Ningún pago coincide con los filtros.', action: button('Limpiar filtros', { onClick: () => { source = 'all'; status = 'all'; query = ''; searchInput.value = ''; statusSelect.value = 'all'; segments.set('all'); paint(); } }) }))); return; }
    const shown = rows.slice(0, visible);
    mount(tableHost, h('div', { class: 'table-wrap' },
      h('div', { class: 'table-scroll' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', null, 'Fecha'), h('th', null, 'Alumno'), h('th', null, 'Concepto'), h('th', null, 'Origen'), h('th', null, 'Medio'), h('th', null, 'Monto'), h('th', null, 'Estado'))),
        h('tbody', null, shown.map((p) => h('tr', null,
          h('td', null, h('div', { class: 'num' }, formatDateTime(p.created_at)), h('div', { class: 'cell-sub' }, timeAgo(p.created_at))),
          h('td', null, h('div', { class: 'cell-name' }, fullName({ name: p.name, surname: p.surname, email: p.email })), h('div', { class: 'cell-sub' }, p.email || '')),
          h('td', null, concept(p), p.quantity > 1 ? h('span', { class: 'faint' }, ` × ${p.quantity}`) : null),
          h('td', null, sourceOf(p) === 'store' ? 'Tienda' : 'Suscripción'),
          h('td', { class: 'muted' }, methodLabel(p)),
          h('td', { class: 'num', style: { fontWeight: 500 } }, formatMoney(p.amount, p.currency || 'ARS')),
          h('td', null, paymentStatusBadge(p.status))))))),
      h('div', { class: 'table-foot' }, h('span', null, `Mostrando ${formatNumber(shown.length)} de ${formatNumber(rows.length)}${rows.length !== payments.length ? ` (de ${formatNumber(payments.length)} en total)` : ''}`), shown.length < rows.length ? button(`Mostrar ${Math.min(PAGE_STEP, rows.length - shown.length)} más`, { size: 'sm', variant: 'ghost', onClick: () => { visible += PAGE_STEP; paint(); } }) : h('span'))));
  }

  async function exportCsv() {
    const list = lastRows.length ? lastRows : payments;
    const csv = toCsv(
      ['Fecha', 'Alumno', 'Email', 'Concepto', 'Origen', 'Medio de pago', 'Monto', 'Moneda', 'Estado', 'ID Mercado Pago'],
      list.map((p) => [toDateKey(p.created_at), fullName({ name: p.name, surname: p.surname, email: p.email }), p.email, concept(p), sourceOf(p) === 'store' ? 'Tienda' : 'Suscripción', methodLabel(p), String(p.amount ?? '').replace('.', ','), p.currency || 'ARS', paymentStatusInfo(p.status)[0], p.mp_payment_id])
    );
    const result = await window.ft.saveCsv({ defaultName: `pagos-${new Date().toISOString().slice(0, 10)}.csv`, content: csv });
    if (result.ok && !result.data.canceled) notify.ok(`Se exportaron ${plural(list.length, 'pago', 'pagos')}.`, { action: { label: 'Mostrar', onClick: () => window.ft.reveal(result.data.filePath) } });
    else if (!result.ok) notify.error(errorMessage(result.error));
  }

  load();
  return { refresh: () => load({ force: true }), destroy() { destroyed = true; } };
}
