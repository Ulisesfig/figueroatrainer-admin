// Panel lateral de un alumno (Datos · Planes · Pesos · Cuenta) y alta de alumnos.
import { h, mount, svg } from '../lib/h.js';
import { icon } from '../lib/icons.js';
import { api, errorMessage } from '../lib/api.js';
import { button, badge, avatar, field, textInput, selectInput, switchInput, emptyState, errorBox, loadingBlock, notify, openModal, openDrawer, confirmDialog, tabs, withBusy, notice, markInvalid } from '../lib/ui.js';
import { loadPlans, loadUser } from '../lib/data.js';
import { trackingTab, notesTab } from './userTracking.js';
import { nutritionTab } from './userNutrition.js';
import { fullName, formatDate, formatDateTime, formatWeight, toDateKey, todayKey, addMonthsKey, relativeDays, whatsappUrl, timeAgo } from '../lib/format.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[0-9 +\-()]{7,20}$/;

function validateDocument(type, value) {
  const v = String(value || '').trim();
  if (!v) return 'Ingresá el documento.';
  if (type === 'dni' && !/^\d{6,9}$/.test(v)) return 'El DNI debe tener entre 6 y 9 números.';
  if (type === 'pasaporte' && !/^[A-Za-z0-9]{5,15}$/.test(v)) return 'El pasaporte solo puede tener letras y números.';
  return '';
}

function generatePassword() {
  // Sin caracteres ambiguos (0/O, 1/l/I) para poder dictarla por teléfono.
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(bytes, (n) => chars[n % chars.length]).join('');
}

// ─── Alta de alumno ─────────────────────────────────────────────────────────

export function openCreateUserModal({ app, onCreated }) {
  const name = textInput({ placeholder: 'Nombre', autocomplete: 'off' });
  const surname = textInput({ placeholder: 'Apellido' });
  const email = textInput({ type: 'email', placeholder: 'alumno@email.com' });
  const phone = textInput({ type: 'tel', placeholder: '3834 123456' });
  const docType = selectInput([{ value: 'dni', label: 'DNI' }, { value: 'pasaporte', label: 'Pasaporte' }], 'dni');
  const docNumber = textInput({ placeholder: 'Número de documento', inputmode: 'text' });
  const password = textInput({ type: 'text', placeholder: 'Mínimo 6 caracteres', className: 'input--mono', value: generatePassword() });
  const expires = textInput({ type: 'date', min: todayKey() });
  const mobile = switchInput({ checked: true, label: 'Habilitar acceso a la app móvil' });
  const errorSlot = h('div');
  const errorFields = { name, surname, email, phone, username: docNumber, password };

  function fail(message, control) {
    Object.values(errorFields).forEach((c) => markInvalid(c, false));
    if (control) { markInvalid(control); control.focus(); }
    mount(errorSlot, message ? h('div', { class: 'error-box', role: 'alert' }, icon('alert', 18), h('div', { class: 'error-box__text' }, message)) : null);
  }

  const copyBtn = button('Copiar contraseña', { variant: 'ghost', size: 'sm', iconOnly: true, icon: 'copy', onClick: async () => { await window.ft.copyText(password.value); notify.info('Contraseña copiada.'); } });
  const regenBtn = button('Generar otra', { variant: 'ghost', size: 'sm', iconOnly: true, icon: 'refresh', onClick: () => { password.value = generatePassword(); } });

  async function submit() {
    fail('');
    if (!name.value.trim()) return fail('Falta el nombre.', name);
    if (!surname.value.trim()) return fail('Falta el apellido.', surname);
    if (!EMAIL_RE.test(email.value.trim())) return fail('El email no es válido.', email);
    if (!PHONE_RE.test(phone.value.trim())) return fail('El teléfono no es válido (solo números, espacios, + - y paréntesis).', phone);
    const docError = validateDocument(docType.value, docNumber.value);
    if (docError) return fail(docError, docNumber);
    if (password.value.length < 6) return fail('La contraseña debe tener al menos 6 caracteres.', password);

    await withBusy(saveBtn, async () => {
      try {
        const payload = {
          name: name.value.trim(), surname: surname.value.trim(), phone: phone.value.trim(), email: email.value.trim().toLowerCase(),
          username: docType.value === 'pasaporte' ? docNumber.value.trim().toUpperCase() : docNumber.value.trim(), documentType: docType.value, password: password.value,
        };
        const created = await api.post('/api/auth/register', payload);
        const user = created.user;
        // Pasos opcionales: si alguno falla, el alumno ya existe y se avisa sin perderlo.
        const pending = [];
        if (mobile.querySelector('input').checked) pending.push(api.patch(`/api/admin/users/${user.id}/mobile-access`, { enabled: true }));
        if (expires.value) pending.push(api.patch(`/api/admin/users/${user.id}/expiration`, { expiresAt: expires.value }));
        const results = await Promise.allSettled(pending);
        const partial = results.some((r) => r.status === 'rejected');
        layer.close();
        notify.ok(`${fullName(user)} ya está dado de alta.`, { action: { label: 'Copiar contraseña', onClick: () => window.ft.copyText(payload.password) } });
        if (partial) notify.warn('El alumno se creó, pero no se pudo aplicar el acceso a la app o el vencimiento. Revisalo en su ficha.');
        const wantsMobile = mobile.querySelector('input').checked;
        const mobileOk = wantsMobile && results[0]?.status === 'fulfilled';
        const expiresOk = Boolean(expires.value) && results[wantsMobile ? 1 : 0]?.status === 'fulfilled';
        onCreated({ ...user, role: 'user', document_type: payload.documentType, mobile_enabled: mobileOk, expires_at: expiresOk ? expires.value : null, created_at: new Date().toISOString() });
      } catch (error) {
        const control = errorFields[error.field] || null;
        fail(errorMessage(error), control);
      }
    });
  }

  const saveBtn = button('Crear alumno', { variant: 'primary', icon: 'plus', onClick: submit });
  const form = h(
    'form',
    { class: 'col gap-16', onSubmit: (e) => { e.preventDefault(); submit(); }, novalidate: true },
    errorSlot,
    h('div', { class: 'grid-form' }, field('Nombre', name), field('Apellido', surname), field('Email', email, { className: 'span-2' }), field('Teléfono', phone), field('Vencimiento del plan (opcional)', expires), field('Tipo de documento', docType), field('Número de documento', docNumber),
      field('Contraseña inicial', h('div', { class: 'row', style: { gap: '4px' } }, password, regenBtn, copyBtn), { hint: 'Anotala o copiala ahora: después no se puede volver a ver.', className: 'span-2' })),
    mobile
  );
  const layer = openModal({ title: 'Nuevo alumno', subtitle: 'Se crea la cuenta y queda listo para ingresar.', size: 'lg', body: form, footer: [button('Cancelar', { variant: 'ghost', onClick: () => layer.close() }), saveBtn] });
  return layer;
}

// ─── Gráfico mini de evolución de peso ──────────────────────────────────────

function sparkline(points, { width = 120, height = 34 } = {}) {
  const values = points.map((p) => Number(p.weight)).filter(Number.isFinite);
  if (values.length < 2) return h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, 'Sin evolución todavía');
  const min = Math.min(...values); const max = Math.max(...values);
  const span = max - min || 1;
  const step = (width - 6) / (values.length - 1);
  const coords = values.map((v, i) => [3 + i * step, height - 4 - ((v - min) / span) * (height - 8)]);
  const up = values[values.length - 1] >= values[0];
  const el = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `De ${formatWeight(values[0])} a ${formatWeight(values[values.length - 1])}` });
  el.appendChild(svg('polyline', { points: coords.map((c) => c.join(',')).join(' '), fill: 'none', stroke: up ? 'var(--ok)' : 'var(--warn)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  const last = coords[coords.length - 1];
  el.appendChild(svg('circle', { cx: last[0], cy: last[1], r: 3, fill: up ? 'var(--ok)' : 'var(--warn)' }));
  return el;
}

// ─── Panel del alumno ───────────────────────────────────────────────────────

export function openUserDrawer({ user: initial, app, onChanged, onDeleted, onClose }) {
  let user = initial;
  let activeTab = 'data';
  let destroyed = false;
  const bodyHost = h('div', { class: 'drawer__body' });
  const headHost = h('div', { class: 'row grow', style: { minWidth: 0 } });

  const tabsEl = tabs([{ value: 'data', label: 'Datos' }, { value: 'plans', label: 'Planes' }, { value: 'weights', label: 'Pesos' }, { value: 'tracking', label: 'Seguimiento' }, { value: 'nutrition', label: 'Alimentación' }, { value: 'notes', label: 'Notas' }, { value: 'account', label: 'Cuenta' }], activeTab, (value) => { activeTab = value; paintTab(); });

  function paintHead() {
    const isAdmin = String(user.role).toLowerCase() === 'admin';
    const wa = whatsappUrl(user.phone);
    mount(
      headHost,
      avatar(user, 'lg'),
      h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'drawer__title trunc' }, fullName(user)), h('div', { class: 'row', style: { gap: '8px', marginTop: '4px' } }, h('span', { class: 'muted trunc', style: { fontSize: 'var(--fs-sm)' } }, user.email), isAdmin ? badge('Admin', 'brass') : null)),
      wa ? button('Escribir por WhatsApp', { variant: 'secondary', size: 'sm', icon: 'chat', onClick: () => window.ft.openExternal(wa) }) : null
    );
  }

  const layer = openDrawer({ head: headHost, tabsEl, body: bodyHost, onClose: (silent) => { destroyed = true; onClose(Boolean(silent)); } });

  function refreshUser(patch) {
    user = { ...user, ...patch };
    paintHead();
  }

  function paintTab() {
    tabsEl.set(activeTab);
    if (activeTab === 'data') mount(bodyHost, dataTab());
    else if (activeTab === 'plans') plansTab(bodyHost);
    else if (activeTab === 'weights') weightsTab(bodyHost);
    else if (activeTab === 'tracking') trackingTab(bodyHost, user, () => !destroyed && activeTab === 'tracking');
    else if (activeTab === 'nutrition') nutritionTab(bodyHost, user, () => !destroyed && activeTab === 'nutrition');
    else if (activeTab === 'notes') notesTab(bodyHost, user, () => !destroyed && activeTab === 'notes');
    else mount(bodyHost, accountTab());
  }

  // ─── Datos ───
  function dataTab() {
    const name = textInput({ value: user.name || '' });
    const surname = textInput({ value: user.surname || '' });
    const email = textInput({ type: 'email', value: user.email || '' });
    const phone = textInput({ type: 'tel', value: user.phone || '' });
    const docType = selectInput([{ value: 'dni', label: 'DNI' }, { value: 'pasaporte', label: 'Pasaporte' }], String(user.document_type || 'dni').toLowerCase());
    const docNumber = textInput({ value: user.username || '' });
    const errorSlot = h('div');
    const controls = { name, surname, email, phone, username: docNumber };
    const saveBtn = button('Guardar cambios', { variant: 'primary', icon: 'save', disabled: true });

    const original = { name: user.name || '', surname: user.surname || '', email: user.email || '', phone: user.phone || '', document_type: String(user.document_type || 'dni').toLowerCase(), username: user.username || '' };
    const current = () => ({ name: name.value.trim(), surname: surname.value.trim(), email: email.value.trim().toLowerCase(), phone: phone.value.trim(), document_type: docType.value, username: docType.value === 'pasaporte' ? docNumber.value.trim().toUpperCase() : docNumber.value.trim() });
    const dirty = () => Object.keys(original).some((k) => original[k] !== current()[k]);
    const syncDirty = () => { saveBtn.disabled = !dirty(); };
    [name, surname, email, phone, docType, docNumber].forEach((c) => c.addEventListener('input', syncDirty));
    docType.addEventListener('change', syncDirty);

    function fail(message, control) {
      Object.values(controls).forEach((c) => markInvalid(c, false));
      if (control) { markInvalid(control); control.focus(); }
      mount(errorSlot, message ? h('div', { class: 'error-box', role: 'alert' }, icon('alert', 18), h('div', { class: 'error-box__text' }, message)) : null);
    }

    async function save() {
      fail('');
      const next = current();
      if (!next.name) return fail('Falta el nombre.', name);
      if (!EMAIL_RE.test(next.email)) return fail('El email no es válido.', email);
      if (!PHONE_RE.test(next.phone)) return fail('El teléfono no es válido.', phone);
      const docError = validateDocument(next.document_type, next.username);
      if (docError) return fail(docError, docNumber);
      const changes = Object.fromEntries(Object.entries(next).filter(([k, v]) => original[k] !== v));
      await withBusy(saveBtn, async () => {
        try {
          const res = await api.patch(`/api/admin/users/${user.id}`, changes);
          Object.assign(original, next);
          refreshUser(res.user || next);
          notify.ok('Datos guardados.');
          syncDirty();
          onChanged(user);
        } catch (error) {
          fail(errorMessage(error), controls[error.field]);
        }
      });
    }
    saveBtn.addEventListener('click', save);

    const expiresInput = textInput({ type: 'date', value: toDateKey(user.expires_at) });
    const expiryInfo = h('div', { class: 'field__hint' });
    const paintExpiryInfo = () => { const k = toDateKey(user.expires_at); expiryInfo.textContent = k ? `Vence ${relativeDays(k)} · ${formatDate(k)}` : 'Sin fecha de vencimiento: no aparece en los avisos.'; };
    paintExpiryInfo();

    async function setExpiry(nextKey) {
      try {
        await api.patch(`/api/admin/users/${user.id}/expiration`, { expiresAt: nextKey || null });
        expiresInput.value = nextKey || '';
        refreshUser({ expires_at: nextKey || null });
        paintExpiryInfo();
        notify.ok(nextKey ? `Vencimiento: ${formatDate(nextKey)}.` : 'Se quitó el vencimiento.');
        onChanged(user);
      } catch (error) { notify.error(errorMessage(error)); }
    }
    const base = () => { const k = toDateKey(user.expires_at); return k && k > todayKey() ? k : todayKey(); };

    return h(
      'div',
      { class: 'drawer__pad' },
      h('div', { class: 'section' }, h('div', { class: 'section__title' }, 'Datos personales'), errorSlot, h('div', { class: 'grid-form' }, field('Nombre', name), field('Apellido', surname), field('Email', email, { className: 'span-2' }), field('Teléfono', phone), field('Tipo de documento', docType), field('Número de documento', docNumber, { className: 'span-2' })), h('div', { class: 'row' }, saveBtn, h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, `Alta: ${formatDateTime(user.created_at)}`))),
      h('div', { class: 'section' }, h('div', { class: 'section__title' }, 'Vencimiento del plan'),
        h('div', { class: 'row wrap' }, h('div', { style: { width: '190px' } }, field('Fecha', expiresInput)), button('Guardar fecha', { variant: 'secondary', onClick: () => setExpiry(expiresInput.value || null) })),
        expiryInfo,
        h('div', { class: 'row wrap', style: { gap: '8px' } }, button('+1 mes', { size: 'sm', icon: 'plus', onClick: () => setExpiry(addMonthsKey(base(), 1)) }), button('+3 meses', { size: 'sm', icon: 'plus', onClick: () => setExpiry(addMonthsKey(base(), 3)) }), button('+6 meses', { size: 'sm', icon: 'plus', onClick: () => setExpiry(addMonthsKey(base(), 6)) }), button('Quitar vencimiento', { size: 'sm', variant: 'ghost', onClick: () => setExpiry(null) })))
    );
  }

  // ─── Planes ───
  async function plansTab(host) {
    mount(host, loadingBlock('Cargando planes…'));
    try {
      const assigned = await api.get(`/api/admin/plans/user/${user.id}`).then((d) => d.plans || []);
      if (destroyed || activeTab !== 'plans') return;
      const progress = {};
      await Promise.allSettled(assigned.filter((p) => p.category !== 'nutrition').map(async (p) => {
        const data = await api.get(`/api/admin/users/${user.id}/plans/${p.plan_id}/progress`);
        progress[p.plan_id] = data;
      }));
      if (destroyed || activeTab !== 'plans') return;
      paintPlans(host, assigned, progress);
    } catch (error) {
      if (!destroyed) mount(host, h('div', { class: 'drawer__pad' }, errorBox(errorMessage(error), () => plansTab(host))));
    }
  }

  function paintPlans(host, assigned, progress) {
    const assignBtn = button('Asignar plan', { variant: 'primary', icon: 'plus', onClick: () => openAssignModal(assigned) });
    const items = assigned.length
      ? assigned.map((p) => {
          const isTraining = p.category !== 'nutrition';
          const exp = toDateKey(p.expires_at);
          const prog = progress[p.plan_id];
          const expInput = textInput({ type: 'date', value: exp, className: 'input--sm', style: { width: '150px' }, 'aria-label': `Vencimiento de ${p.title}` });
          expInput.addEventListener('change', async () => {
            try { await api.patch(`/api/admin/plans/assign/${user.id}/${p.plan_id}`, { expiresAt: expInput.value || null }); notify.ok('Vencimiento del plan actualizado.'); }
            catch (error) { notify.error(errorMessage(error)); expInput.value = exp; }
          });
          return h(
            'div',
            { class: 'card', style: { padding: '14px 16px' } },
            h('div', { class: 'row', style: { alignItems: 'flex-start' } },
              h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'row', style: { gap: '8px' } }, icon(isTraining ? 'clipboard' : 'flame', 16), h('strong', { class: 'trunc' }, p.title)), h('div', { class: 'faint', style: { fontSize: 'var(--fs-xs)', marginTop: '2px' } }, `${isTraining ? 'Entrenamiento' : 'Alimentación'}${p.assigned_at ? ` · asignado ${formatDate(p.assigned_at)}` : ''}`)),
              button('Editar plan', { size: 'sm', variant: 'ghost', icon: 'pencil', onClick: () => { layer.close(); app.navigate(`plans/${p.plan_id}`); } }),
              button('Quitar', { size: 'sm', variant: 'ghost', icon: 'trash', onClick: async () => {
                if (!(await confirmDialog({ title: 'Quitar plan', message: `“${p.title}” dejará de aparecerle a ${fullName(user)}. El plan en sí no se borra.`, confirmText: 'Quitar plan', danger: true }))) return;
                try { await api.del(`/api/admin/plans/assign/${user.id}/${p.plan_id}`); notify.ok('Plan quitado.'); plansTab(host); } catch (error) { notify.error(errorMessage(error)); }
              } })
            ),
            prog && prog.totalDays ? h('div', { class: 'row', style: { marginTop: '10px', gap: '6px', flexWrap: 'wrap' } }, h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)', marginRight: '4px' } }, `Esta semana: ${prog.completedCount}/${prog.totalDays}`), prog.days.map((d) => h('span', { class: ['daypill', d.completedThisWeek && 'is-done'], title: d.lastCompletedAt ? `Último: ${formatDate(d.lastCompletedAt)}` : 'Sin registrar' }, d.completedThisWeek ? icon('check', 12, { stroke: 2.5 }) : null, `Día ${d.day}`))) : null,
            h('div', { class: 'row', style: { marginTop: '10px' } }, h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, 'Vence el'), expInput)
          );
        })
      : [emptyState({ icon: 'clipboard', title: 'Sin planes asignados', text: 'Asignale una rutina o un plan de alimentación para que lo vea en la app.', action: assignBtn })];
    mount(host, h('div', { class: 'drawer__pad' }, assigned.length ? h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('div', { class: 'section__title', style: { border: 0, padding: 0 } }, 'Planes asignados'), assignBtn) : null, ...items));
  }

  async function openAssignModal(assigned) {
    let plans = [];
    try { plans = await loadPlans(); } catch (error) { notify.error(errorMessage(error)); return; }
    const assignedIds = new Set(assigned.map((p) => String(p.plan_id)));
    const available = plans.filter((p) => !assignedIds.has(String(p.id)));
    if (!available.length) { notify.info(plans.length ? 'Este alumno ya tiene todos los planes asignados.' : 'Todavía no creaste ningún plan.'); return; }

    const select = selectInput(available.map((p) => ({ value: p.id, label: `${p.category === 'nutrition' ? '🍎' : '🏋'} ${p.title}` })), available[0].id);
    const expires = textInput({ type: 'date', min: todayKey(), value: toDateKey(user.expires_at) || '' });
    const okBtn = button('Asignar', { variant: 'primary', icon: 'check' });
    const modal = openModal({
      title: 'Asignar plan', subtitle: `Para ${fullName(user)}`, size: 'sm',
      body: h('div', { class: 'col gap-16' }, field('Plan', select), field('Vence el (opcional)', expires, { hint: 'Por defecto usa el vencimiento del alumno.' })),
      footer: [button('Cancelar', { variant: 'ghost', onClick: () => modal.close() }), okBtn],
    });
    okBtn.addEventListener('click', () => withBusy(okBtn, async () => {
      try {
        await api.post(`/api/admin/plans/assign/${user.id}`, { planId: Number(select.value), expiresAt: expires.value || null });
        modal.close();
        notify.ok('Plan asignado.');
        plansTab(bodyHost);
      } catch (error) { notify.error(errorMessage(error)); }
    }));
  }

  // ─── Pesos ───
  async function weightsTab(host) {
    mount(host, loadingBlock('Cargando pesos…'));
    try {
      const [list, stats] = await Promise.all([api.get(`/api/admin/users/${user.id}/exercises`).then((d) => d.exercises || []), api.get(`/api/admin/users/${user.id}/exercises/stats`, { historyLimit: 12 }).then((d) => d.stats || [])]);
      if (destroyed || activeTab !== 'weights') return;
      const statBy = Object.fromEntries(stats.map((s) => [String(s.exercise_id), s]));
      if (!list.length) { mount(host, emptyState({ icon: 'barbell', title: 'Todavía no registró pesos', text: 'Cuando el alumno cargue lo que levanta desde la app, vas a ver acá su evolución.' })); return; }
      mount(host, h('div', { class: 'drawer__pad' }, h('div', { class: 'section__title', style: { border: 0, padding: 0 } }, `${list.length} ejercicios con pesos registrados`),
        h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', null, h('tr', null, h('th', null, 'Ejercicio'), h('th', { class: 'num' }, 'Último'), h('th', null, 'Evolución'), h('th', null, ''))), h('tbody', null, list.map((e) => {
          const st = statBy[String(e.exercise_id)];
          const history = (st?.history || []).slice().sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
          return h('tr', { class: 'is-clickable', onClick: () => openWeightModal(e, history) },
            h('td', null, h('div', { class: 'cell-name' }, e.exercise_name), h('div', { class: 'cell-sub' }, e.weight_updated_at ? `Actualizado ${timeAgo(e.weight_updated_at)}` : '')),
            h('td', { class: 'num' }, h('strong', null, formatWeight(e.weight)), e.reps != null ? h('span', { class: 'muted' }, ` × ${e.reps}`) : null),
            h('td', null, sparkline(history)),
            h('td', { class: 'right' }, icon('chevron-right', 16)));
        }))))));
    } catch (error) {
      if (!destroyed) mount(host, h('div', { class: 'drawer__pad' }, errorBox(errorMessage(error), () => weightsTab(host))));
    }
  }

  async function openWeightModal(exercise, history) {
    const weight = textInput({ type: 'number', step: '0.5', min: '0', value: exercise.weight ?? '' });
    const reps = textInput({ type: 'number', step: '1', min: '1', value: exercise.reps ?? '' });
    const historyHost = h('div', { class: 'col', style: { gap: '4px', maxHeight: '220px', overflow: 'auto' } }, loadingBlock('Cargando historial…'));
    const saveBtn = button('Guardar', { variant: 'primary', icon: 'save' });
    const delBtn = button('Eliminar ejercicio', { variant: 'danger', icon: 'trash' });
    const modal = openModal({
      title: exercise.exercise_name, subtitle: 'Corregí el último registro o revisá el historial.', size: 'md',
      body: h('div', { class: 'col gap-16' }, h('div', { class: 'grid-form' }, field('Peso (kg)', weight), field('Repeticiones', reps)), h('div', { class: 'section' }, h('div', { class: 'section__title' }, 'Historial'), historyHost)),
      footer: [delBtn, h('span', { class: 'grow' }), button('Cerrar', { variant: 'ghost', onClick: () => modal.close() }), saveBtn],
    });
    api.get(`/api/admin/users/${user.id}/exercises/${encodeURIComponent(exercise.exercise_id)}/history`, { limit: 30 }).then((d) => {
      const rows = (d.history || []).filter((r) => !(r.source === 'create' && Number(r.weight) === 0));
      mount(historyHost, ...(rows.length ? rows.map((r) => h('div', { class: 'list__item', style: { padding: '7px 10px', border: 0 } }, h('span', { class: 'muted num', style: { width: '120px' } }, formatDate(r.recorded_at)), h('strong', { class: 'num' }, formatWeight(r.weight)), r.reps != null ? h('span', { class: 'muted' }, `× ${r.reps}`) : null)) : [h('div', { class: 'faint' }, 'Todavía no hay historial.')]));
    }).catch((error) => mount(historyHost, h('div', { class: 'faint' }, errorMessage(error))));

    saveBtn.addEventListener('click', () => withBusy(saveBtn, async () => {
      const w = Number(weight.value); const r = reps.value === '' ? undefined : Number(reps.value);
      if (!Number.isFinite(w) || w < 0) { markInvalid(weight); weight.focus(); return; }
      try {
        await api.patch(`/api/admin/users/${user.id}/exercises/${encodeURIComponent(exercise.exercise_id)}`, { weight: w, reps: r });
        modal.close(); notify.ok('Peso actualizado.'); weightsTab(bodyHost);
      } catch (error) { notify.error(errorMessage(error)); }
    }));
    delBtn.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Eliminar ejercicio', message: `Se borra “${exercise.exercise_name}” de la lista de ${fullName(user)}, con todo su historial.`, confirmText: 'Eliminar', danger: true }))) return;
      try { await api.del(`/api/admin/users/${user.id}/exercises/${encodeURIComponent(exercise.exercise_id)}`); modal.close(); notify.ok('Ejercicio eliminado.'); weightsTab(bodyHost); }
      catch (error) { notify.error(errorMessage(error)); }
    });
  }

  // ─── Cuenta ───
  function accountTab() {
    const isAdmin = String(user.role).toLowerCase() === 'admin';
    const mobileSwitch = switchInput({ checked: Boolean(user.mobile_enabled), label: user.mobile_enabled ? 'Puede entrar a la app móvil' : 'Sin acceso a la app móvil', onChange: async (on, e) => {
      e.target.disabled = true;
      try {
        await api.patch(`/api/admin/users/${user.id}/mobile-access`, { enabled: on });
        refreshUser({ mobile_enabled: on });
        mobileSwitch.querySelector('span:last-child').textContent = on ? 'Puede entrar a la app móvil' : 'Sin acceso a la app móvil';
        notify.ok(on ? 'Acceso a la app habilitado.' : 'Acceso a la app deshabilitado.');
        onChanged(user);
      } catch (error) { e.target.checked = !on; notify.error(errorMessage(error)); }
      finally { e.target.disabled = false; }
    } });

    const roleSelect = selectInput([{ value: 'user', label: 'Alumno' }, { value: 'admin', label: 'Administrador' }], String(user.role).toLowerCase());
    roleSelect.addEventListener('change', async () => {
      const next = roleSelect.value;
      const previous = String(user.role).toLowerCase();
      if (next === 'admin' && !(await confirmDialog({ title: 'Convertir en administrador', message: `${fullName(user)} va a poder ver y modificar TODOS los alumnos, planes, tienda y pagos. Hacelo solo con personas de confianza.`, confirmText: 'Dar permisos de admin', danger: true, requireText: 'ADMIN' }))) { roleSelect.value = previous; return; }
      if (next === 'user' && !(await confirmDialog({ title: 'Quitar permisos de administrador', message: `${fullName(user)} dejará de tener acceso al panel de administración.`, confirmText: 'Quitar permisos', danger: true }))) { roleSelect.value = previous; return; }
      try {
        const res = await api.post(`/api/admin/users/${user.id}/role`, { role: next });
        refreshUser({ role: res.user?.role || next });
        notify.ok(next === 'admin' ? 'Ahora es administrador.' : 'Ahora es alumno.');
        onChanged(user);
        paintTab();
      } catch (error) { roleSelect.value = previous; notify.error(errorMessage(error)); }
    });

    const deleteBtn = button('Eliminar alumno…', { variant: 'danger', icon: 'trash' });
    deleteBtn.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: 'Eliminar alumno', message: `Se borra la cuenta de ${fullName(user)} y también sus planes asignados, pesos, historial y pagos. Esta acción no se puede deshacer.`, confirmText: 'Eliminar para siempre', danger: true, requireText: user.email });
      if (!ok) return;
      await withBusy(deleteBtn, async () => {
        try { await api.del(`/api/admin/users/${user.id}`); notify.ok('Alumno eliminado.'); layer.close(true); onDeleted(user.id); }
        catch (error) { notify.error(errorMessage(error)); }
      });
    });

    return h(
      'div',
      { class: 'drawer__pad' },
      h('div', { class: 'section' }, h('div', { class: 'section__title' }, 'Acceso'), isAdmin ? notice('Los administradores usan este panel, no la app móvil.') : mobileSwitch),
      h('div', { class: 'section' }, h('div', { class: 'section__title' }, 'Rol'), h('div', { style: { maxWidth: '260px' } }, field('Permisos de la cuenta', roleSelect))),
      h('div', { class: 'section' }, h('div', { class: 'section__title' }, 'Zona de peligro'), h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } }, 'Eliminar es definitivo. Si solo querés que no entre más, podés sacarle el acceso a la app o dejar vencer su plan.'), h('div', null, deleteBtn))
    );
  }

  paintHead();
  paintTab();

  // Datos frescos del alumno por si cambiaron desde otro lado.
  loadUser(user.id).then((fresh) => { if (!destroyed && fresh) { user = { ...user, ...fresh }; paintHead(); if (activeTab === 'data') paintTab(); } }).catch(() => {});

  return layer;
}
