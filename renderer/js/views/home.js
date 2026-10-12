// Hoy: la "pizarra" del entrenador. Qué vence, quién se anotó y qué hay que atender.
import { h, mount, svg } from '../lib/h.js';
import { icon } from '../lib/icons.js';
import { api, errorMessage } from '../lib/api.js';
import { button, badge, avatar, emptyState, errorBox, notify, withBusy } from '../lib/ui.js';
import { loadUsers, loadPlans, loadOrders, loadPayments, loadStats, loadActivity, inactivityState, expirationState, patchCached } from '../lib/data.js';
import { openReminders } from './reminders.js';
import { getTemplate, renderTemplate } from '../lib/templates.js';
import { orderStatusBadge } from '../lib/status.js';
import { fullName, formatDate, formatLongToday, greeting, formatMoney, formatNumber, timeAgo, todayKey, addMonthsKey, toDateKey, relativeDays, whatsappUrl, plural } from '../lib/format.js';

// Marcas de conteo (||||/): cada grupo de cinco cuenta cinco. Solo para cifras chicas.
function tally(count) {
  const n = Math.max(0, Math.min(count, 40));
  const groups = [];
  for (let remaining = n; remaining > 0; remaining -= 5) groups.push(Math.min(5, remaining));
  return h(
    'div',
    { class: 'tally', role: 'img', 'aria-label': `${count} en marcas de conteo` },
    groups.map((size) => {
      const el = svg('svg', { width: 30, height: 22, viewBox: '0 0 30 22', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' });
      for (let i = 0; i < Math.min(size, 4); i += 1) el.appendChild(svg('line', { x1: 4 + i * 7, y1: 2, x2: 4 + i * 7, y2: 20 }));
      if (size === 5) el.appendChild(svg('line', { x1: 0, y1: 17, x2: 29, y2: 5 }));
      return el;
    })
  );
}

function cell(label, value, { sub, extra, tone } = {}) {
  return h(
    'div',
    { class: ['board__cell', tone && `is-${tone}`] },
    h('div', { class: 'board__label' }, label),
    h('div', { class: 'board__value num' }, value),
    sub ? h('div', { class: 'board__sub' }, sub) : null,
    extra || null
  );
}

function skeletonRows(n) {
  return Array.from({ length: n }, () => h('div', { class: 'list__item' }, h('div', { class: 'skeleton', style: { width: '34px', height: '34px', borderRadius: '50%' } }), h('div', { class: 'grow col', style: { gap: '6px' } }, h('div', { class: 'skeleton', style: { width: '40%', height: '12px' } }), h('div', { class: 'skeleton', style: { width: '25%', height: '10px' } }))));
}

export function homeView(container, _params, app) {
  let destroyed = false;
  const boardEl = h('section', { class: 'board', 'aria-label': 'Resumen' });
  const expiringEl = h('div', { class: 'card card--flush' });
  const attentionEl = h('div', { class: 'col gap-16' });

  const page = h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'page__head' },
      h('div', null, h('h1', { class: 'page__title' }, `${greeting()}, ${app.user.name || 'entrenador'}`), h('p', { class: 'page__sub' }, formatLongToday())),
      h('div', { class: 'page__actions' }, button('Actualizar', { icon: 'refresh', onClick: () => paint({ skeleton: true, force: true }) }))
    ),
    boardEl,
    h('div', { class: 'home-grid' }, h('div', { class: 'card card--flush home-grid__main' }, h('div', { class: 'card__head' }, h('h2', { class: 'card__title' }, 'Vencimientos'), h('div', { class: 'row', style: { gap: '4px' } }, button('Avisar a todos', { variant: 'secondary', size: 'sm', icon: 'chat', onClick: () => openReminders({ kind: 'soon' }) }), button('Ver todos', { variant: 'ghost', size: 'sm', onClick: () => app.navigate('users?filter=soon') }))), expiringEl), attentionEl)
  );
  mount(container, page);

  function paintBoardLoading() {
    mount(boardEl, ...[0, 1, 2, 3].map(() => h('div', { class: 'board__cell' }, h('div', { class: 'skeleton', style: { width: '60%', height: '11px' } }), h('div', { class: 'skeleton', style: { width: '45%', height: '52px', marginTop: '14px' } }))));
    mount(expiringEl, ...skeletonRows(4));
    mount(attentionEl);
  }

  async function renew(user, button_) {
    const current = toDateKey(user.expires_at);
    const base = current && current > todayKey() ? current : todayKey();
    const next = addMonthsKey(base, 1);
    await withBusy(button_, async () => {
      try {
        await api.patch(`/api/admin/users/${user.id}/expiration`, { expiresAt: next });
        patchCached('users', user.id, { expires_at: next });
        notify.ok(`${fullName(user)} vence ahora el ${formatDate(next)}.`, {
          duration: 8000,
          action: { label: 'Deshacer', onClick: async () => {
            try {
              await api.patch(`/api/admin/users/${user.id}/expiration`, { expiresAt: current || null });
              patchCached('users', user.id, { expires_at: current || null });
              notify.info('Se restauró el vencimiento anterior.');
              paint({ skeleton: false });
            } catch (error) { notify.error(errorMessage(error)); }
          } },
        });
        paint({ skeleton: false });
      } catch (error) {
        notify.error(errorMessage(error));
      }
    });
  }

  function expiringRow(user) {
    const state = expirationState(user);
    const label = state.kind === 'expired' ? `Venció ${relativeDays(user.expires_at)}` : `Vence ${relativeDays(user.expires_at)}`;
    const wa = whatsappUrl(user.phone, renderTemplate(getTemplate(state.kind === 'expired' ? 'expired' : 'soon'), user));
    const renewBtn = button('Renovar 1 mes', { size: 'sm', variant: 'secondary', icon: 'calendar' });
    renewBtn.addEventListener('click', (e) => { e.stopPropagation(); renew(user, renewBtn); });
    return h(
      'div',
      { class: 'list__item is-clickable', onClick: () => app.navigate(`users/${user.id}`) },
      avatar(user),
      h('div', { class: 'grow' }, h('div', { class: 'cell-name trunc' }, fullName(user)), h('div', { class: 'faint trunc', style: { fontSize: 'var(--fs-xs)' } }, formatDate(user.expires_at))),
      badge(label, state.kind === 'expired' ? 'danger' : state.days <= 3 ? 'warn' : 'brass', { dot: true }),
      wa ? button('Avisar por WhatsApp', { size: 'sm', variant: 'ghost', iconOnly: true, icon: 'chat', onClick: (e) => { e.stopPropagation(); window.ft.openExternal(wa); } }) : null,
      renewBtn
    );
  }

  function attentionCard(title, subtitle, iconName, body, action) {
    return h('div', { class: 'card card--flush' }, h('div', { class: 'card__head' }, h('div', { class: 'row' }, icon(iconName, 18, { class: 'brass-icon' }), h('div', null, h('h2', { class: 'card__title' }, title), subtitle ? h('div', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, subtitle) : null)), action || null), body);
  }

  async function paint({ skeleton = true, force = false } = {}) {
    if (skeleton) paintBoardLoading();
    const [statsR, usersR, plansR, ordersR, paymentsR, activityR] = await Promise.allSettled([loadStats({ force }), loadUsers({ force }), loadPlans({ force }), loadOrders({ force }), loadPayments({ force }), loadActivity({ force })]);
    if (destroyed) return;

    // ─── Pizarra ───
    const users = usersR.status === 'fulfilled' ? usersR.value : null;
    const stats = statsR.status === 'fulfilled' ? statsR.value : null;
    const plans = plansR.status === 'fulfilled' ? plansR.value : null;
    const payments = paymentsR.status === 'fulfilled' ? paymentsR.value : null;

    const soonCount = users ? users.filter((u) => expirationState(u).kind === 'soon').length : null;
    const expiredCount = users ? users.filter((u) => expirationState(u).kind === 'expired').length : null;
    const monthStart = `${todayKey().slice(0, 7)}-01`;
    const monthRevenue = payments ? payments.filter((p) => String(p.status).toLowerCase() === 'approved' && toDateKey(p.created_at) >= monthStart).reduce((sum, p) => sum + Number(p.amount || 0), 0) : null;
    const activeWeek = stats?.activeUsers;

    mount(
      boardEl,
      cell('Alumnos', users ? formatNumber(users.filter((u) => String(u.role).toLowerCase() !== 'admin').length) : '—', { sub: plans ? `${plural(plans.filter((p) => p.category !== 'nutrition').length, 'plan de entrenamiento', 'planes de entrenamiento')}` : 'No se pudo cargar' }),
      cell('Entrenaron esta semana', activeWeek !== undefined ? formatNumber(activeWeek) : '—', { sub: 'Ingresaron en los últimos 7 días', extra: activeWeek ? tally(activeWeek) : null }),
      cell('Por vencer o vencidos', soonCount === null ? '—' : formatNumber(soonCount + expiredCount), { tone: soonCount + expiredCount > 0 ? 'warn' : undefined, sub: soonCount === null ? 'No se pudo cargar' : `${soonCount} en 14 días · ${expiredCount} vencidos` }),
      cell('Cobrado este mes', monthRevenue === null ? '—' : formatMoney(monthRevenue), { sub: 'Pagos aprobados (planes y tienda)' })
    );

    // ─── Vencimientos ───
    if (!users) {
      mount(expiringEl, h('div', { class: 'list__item' }, errorBox(errorMessage(usersR.reason), () => paint({ force: true }))));
    } else {
      const list = users
        .filter((u) => ['expired', 'soon'].includes(expirationState(u).kind))
        .sort((a, b) => toDateKey(a.expires_at).localeCompare(toDateKey(b.expires_at)));
      if (!list.length) {
        mount(expiringEl, emptyState({ icon: 'check', title: 'Todo al día', text: 'Ningún alumno tiene el plan vencido ni por vencer en los próximos 14 días.' }));
      } else {
        const shown = list.slice(0, 8);
        mount(expiringEl, ...shown.map(expiringRow), list.length > shown.length ? h('div', { class: 'table-foot' }, h('span', null, `Y ${list.length - shown.length} más`), button('Ver la lista completa', { size: 'sm', variant: 'ghost', onClick: () => app.navigate('users?filter=soon') })) : null);
      }
    }

    // ─── Para atender ───
    const cards = [];
    const activity = activityR.status === 'fulfilled' ? activityR.value : null;
    if (users && activity?.available) {
      const quiet = users
        .map((u) => ({ u, state: inactivityState(u, activity) }))
        .filter(({ state }) => state.kind === 'inactive')
        .sort((a, b) => b.state.days - a.state.days);
      if (quiet.length) {
        cards.push(
          attentionCard(
            'Sin entrenar',
            `${plural(quiet.length, 'alumno', 'alumnos')} hace una semana o más`,
            'flame',
            h('div', { class: 'list' }, quiet.slice(0, 5).map(({ u, state }) => {
              const wa = whatsappUrl(u.phone, renderTemplate(getTemplate('inactive'), u, { days: state.days }));
              return h('div', { class: 'list__item is-clickable', onClick: () => app.navigate(`users/${u.id}`) }, avatar(u, 'sm'), h('div', { class: 'grow' }, h('div', { class: 'cell-name trunc' }, fullName(u)), h('div', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, `Sin entrenar hace ${state.days} días`)), wa ? button('Escribirle por WhatsApp', { size: 'sm', variant: 'ghost', iconOnly: true, icon: 'chat', onClick: (e) => { e.stopPropagation(); window.ft.openExternal(wa); } }) : null);
            })),
            button('Avisar a todos', { size: 'sm', variant: 'secondary', icon: 'chat', onClick: () => openReminders({ kind: 'inactive' }) })
          )
        );
      }
    }
    if (users) {
      const noApp = users.filter((u) => !u.mobile_enabled && String(u.role).toLowerCase() !== 'admin');
      const recent = [...users].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);

      cards.push(
        attentionCard(
          'Últimos registros',
          noApp.length ? `${plural(noApp.length, 'alumno espera', 'alumnos esperan')} acceso a la app` : 'Todos tienen acceso a la app',
          'user',
          h('div', { class: 'list' }, recent.map((u) => {
            const enableBtn = !u.mobile_enabled && String(u.role).toLowerCase() !== 'admin' ? button('Habilitar app', { size: 'sm', variant: 'secondary' }) : null;
            if (enableBtn) {
              enableBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                withBusy(enableBtn, async () => {
                  try {
                    await api.patch(`/api/admin/users/${u.id}/mobile-access`, { enabled: true });
                    patchCached('users', u.id, { mobile_enabled: true });
                    notify.ok(`${fullName(u)} ya puede entrar a la app.`);
                    paint({ skeleton: false });
                  } catch (error) { notify.error(errorMessage(error)); }
                });
              });
            }
            return h('div', { class: 'list__item is-clickable', onClick: () => app.navigate(`users/${u.id}`) }, avatar(u, 'sm'), h('div', { class: 'grow' }, h('div', { class: 'cell-name trunc' }, fullName(u)), h('div', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, `Se registró ${timeAgo(u.created_at)}`)), enableBtn || (u.mobile_enabled ? badge('App activa', 'ok') : null));
          })),
          button('Nuevo alumno', { size: 'sm', variant: 'ghost', icon: 'plus', onClick: () => app.navigate('users/new') })
        )
      );
    }

    const orders = ordersR.status === 'fulfilled' ? ordersR.value : null;
    if (orders) {
      const latest = orders.slice(0, 4);
      cards.push(
        attentionCard(
          'Pedidos de la tienda',
          latest.length ? 'Los más recientes' : null,
          'bag',
          latest.length
            ? h('div', { class: 'list' }, latest.map((o) => h('div', { class: 'list__item is-clickable', onClick: () => app.navigate('store') }, h('div', { class: 'grow' }, h('div', { class: 'cell-name trunc' }, o.product_name || o.plan_type || 'Producto'), h('div', { class: 'faint trunc', style: { fontSize: 'var(--fs-xs)' } }, `${fullName({ name: o.name, surname: o.surname, email: o.email })} · ${timeAgo(o.created_at)}`)), h('span', { class: 'num', style: { fontWeight: 500 } }, formatMoney(o.amount)), orderStatusBadge(o.status))))
            : emptyState({ icon: 'bag', title: 'Sin pedidos todavía', text: 'Cuando alguien compre en la tienda, lo vas a ver acá.' })
        )
      );
    }

    mount(attentionEl, ...cards);
  }

  paint();

  return { refresh: () => paint({ skeleton: false }), destroy: () => { destroyed = true; } };
}

