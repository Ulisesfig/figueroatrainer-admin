// Avisos en tanda por WhatsApp: se elige a quién (por vencer, vencidos, sin entrenar...),
// se ajusta el mensaje y se van abriendo los chats de a uno con el texto ya escrito.
// El envío lo confirma la persona en WhatsApp; acá solo se registra a quién ya se le abrió hoy.
import { h, mount } from '../lib/h.js';
import { icon } from '../lib/icons.js';
import { button, badge, avatar, checkInput, emptyState, notify, openModal, segmented, textArea } from '../lib/ui.js';
import { loadUsers, loadActivity, expirationState, inactivityState } from '../lib/data.js';
import { fullName, formatDate, relativeDays, toDateKey, whatsappUrl } from '../lib/format.js';
import { TEMPLATE_KINDS, VARIABLES, DEFAULT_TEMPLATES, getTemplate, setTemplate, isCustomized, renderTemplate, wasOpenedToday, markOpened } from '../lib/templates.js';

const isStudent = (u) => String(u.role).toLowerCase() !== 'admin';

// Detalle corto de cada alumno según el tipo de aviso
function detailFor(kind, user, inactivity) {
  if (kind === 'inactive') return inactivity.kind === 'never' ? 'Todavía no entrenó' : `Sin entrenar hace ${inactivity.days} días`;
  if (kind === 'welcome') return `Alta el ${formatDate(user.created_at)}`;
  const key = toDateKey(user.expires_at);
  return key ? `${kind === 'expired' ? 'Venció' : 'Vence'} ${relativeDays(key)} · ${formatDate(key)}` : 'Sin vencimiento';
}

export async function openReminders({ kind = 'soon', selectedIds = null } = {}) {
  let users = [];
  let activity = { available: false, byUser: {} };
  let current = kind;
  const checked = new Map(); // kind → Set(userId)

  const listHost = h('div', { class: 'reminders__list' });
  const messageBox = textArea({ rows: 4, className: 'reminders__message', 'aria-label': 'Mensaje' });
  const previewHost = h('div', { class: 'reminders__preview faint' });
  const hintHost = h('div', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } });
  const resetBtn = button('Restaurar el mensaje original', { size: 'sm', variant: 'ghost', icon: 'undo' });
  const chips = h('div', { class: 'row wrap', style: { gap: '6px' } }, VARIABLES.map((v) => h('button', { type: 'button', class: 'chip chip--action', title: v.label, onClick: () => insertVariable(v.key) }, v.key)));
  const nextBtn = button('Abrir el siguiente', { variant: 'primary', icon: 'chat' });
  const segments = segmented(TEMPLATE_KINDS.map((k) => ({ value: k.value, label: k.label, count: 0 })), current, (v) => { current = v; paint(); });

  function audience(k) {
    const students = users.filter(isStudent);
    if (k === 'soon') return students.filter((u) => expirationState(u).kind === 'soon').sort((a, b) => toDateKey(a.expires_at).localeCompare(toDateKey(b.expires_at)));
    if (k === 'expired') return students.filter((u) => expirationState(u).kind === 'expired').sort((a, b) => toDateKey(b.expires_at).localeCompare(toDateKey(a.expires_at)));
    if (k === 'inactive') return students.filter((u) => ['inactive', 'never'].includes(inactivityState(u, activity).kind)).sort((a, b) => (inactivityState(b, activity).days ?? 9999) - (inactivityState(a, activity).days ?? 9999));
    if (k === 'welcome') { const limit = Date.now() - 14 * 86400000; return students.filter((u) => new Date(u.created_at).getTime() >= limit).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); }
    return selectedIds ? students.filter((u) => selectedIds.has(u.id)) : [];
  }

  function checkedSet(k) {
    if (!checked.has(k)) {
      // por defecto: todos los que tienen teléfono y todavía no se avisaron hoy
      checked.set(k, new Set(audience(k).filter((u) => whatsappUrl(u.phone) && !wasOpenedToday(k, u.id)).map((u) => u.id)));
    }
    return checked.get(k);
  }

  function insertVariable(text) {
    const start = messageBox.selectionStart ?? messageBox.value.length;
    const end = messageBox.selectionEnd ?? start;
    messageBox.setRangeText(text, start, end, 'end');
    messageBox.dispatchEvent(new Event('input', { bubbles: true }));
    messageBox.focus();
  }

  function messageFor(user) {
    return renderTemplate(messageBox.value, user, { days: inactivityState(user, activity).days });
  }

  function openChat(user) {
    const url = whatsappUrl(user.phone, messageFor(user));
    if (!url) { notify.warn(`${fullName(user)} no tiene un teléfono válido.`); return false; }
    window.ft.openExternal(url);
    markOpened(current, user.id);
    return true;
  }

  function pending() {
    const set = checkedSet(current);
    return audience(current).filter((u) => set.has(u.id) && whatsappUrl(u.phone) && !wasOpenedToday(current, u.id));
  }

  function paintNext() {
    const count = pending().length;
    nextBtn.disabled = count === 0;
    nextBtn.lastChild.textContent = count ? `Abrir el siguiente (${count} por avisar)` : 'Nada por avisar';
  }

  function paintPreview() {
    const first = pending()[0] || audience(current)[0];
    previewHost.textContent = first ? `Así le llega a ${first.name || 'un alumno'}: “${messageFor(first)}”` : '';
  }

  function paintList() {
    const list = audience(current);
    const set = checkedSet(current);
    if (current === 'inactive' && !activity.available) {
      mount(listHost, emptyState({ icon: 'info', title: 'Esta función necesita el servidor actualizado', text: 'Cuando el servidor tenga la última versión, acá vas a ver quién dejó de entrenar.' }));
      return;
    }
    if (!list.length) {
      mount(listHost, emptyState({ icon: 'check', title: current === 'custom' ? 'Elegí alumnos desde la lista' : 'No hay nadie en este grupo', text: current === 'custom' ? 'En Alumnos, seleccioná a quiénes querés escribirles y tocá “Avisar”.' : 'Cuando haya alumnos que cumplan la condición, van a aparecer acá.' }));
      return;
    }
    mount(listHost, ...list.map((user) => {
      const opened = wasOpenedToday(current, user.id);
      const hasPhone = Boolean(whatsappUrl(user.phone));
      const inactivity = inactivityState(user, activity);
      const row = h('div', { class: ['list__item', 'reminders__row', opened && 'is-done'] },
        checkInput({ checked: set.has(user.id) && hasPhone, disabled: !hasPhone, 'aria-label': `Avisar a ${fullName(user)}`, onChange: (on) => { on ? set.add(user.id) : set.delete(user.id); paintNext(); paintPreview(); } }),
        avatar(user, 'sm'),
        h('div', { class: 'grow' }, h('div', { class: 'cell-name trunc' }, fullName(user)), h('div', { class: 'faint trunc', style: { fontSize: 'var(--fs-xs)' } }, detailFor(current, user, inactivity))),
        !hasPhone ? badge('Sin teléfono', 'warn') : opened ? badge('Ya abierto hoy', 'ok', { dot: true }) : null,
        button('Abrir el chat de WhatsApp', { size: 'sm', variant: 'ghost', iconOnly: true, icon: 'chat', disabled: !hasPhone, onClick: () => { if (openChat(user)) paintList(); } }));
      return row;
    }));
  }

  function paintCounts() {
    TEMPLATE_KINDS.forEach((k) => segments.setCount(k.value, audience(k.value).length));
  }

  function paint() {
    segments.set(current);
    messageBox.value = getTemplate(current);
    hintHost.textContent = TEMPLATE_KINDS.find((k) => k.value === current)?.hint || '';
    resetBtn.classList.toggle('hidden', !isCustomized(current));
    paintCounts();
    paintList();
    paintNext();
    paintPreview();
  }

  messageBox.addEventListener('input', () => {
    setTemplate(current, messageBox.value);
    resetBtn.classList.toggle('hidden', !isCustomized(current));
    paintPreview();
  });
  resetBtn.addEventListener('click', () => { setTemplate(current, DEFAULT_TEMPLATES[current]); paint(); });

  nextBtn.addEventListener('click', () => {
    const target = pending()[0];
    if (!target) return;
    if (openChat(target)) { paintList(); paintNext(); paintPreview(); }
  });

  const body = h('div', { class: 'col gap-16' },
    segments,
    h('div', { class: 'col', style: { gap: '8px' } },
      h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', { class: 'field__label' }, 'Mensaje'), resetBtn),
      messageBox,
      h('div', { class: 'row wrap', style: { gap: '8px' } }, h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, 'Insertar:'), chips),
      previewHost,
      hintHost),
    listHost);

  const modal = openModal({
    title: 'Avisar a los alumnos',
    subtitle: 'Se abre WhatsApp con el mensaje escrito; solo tenés que enviarlo.',
    size: 'lg',
    body,
    footer: [button('Copiar mensaje', { variant: 'ghost', icon: 'copy', onClick: async () => { await window.ft.copyText(messageBox.value); notify.ok('Mensaje copiado.'); } }), h('span', { class: 'grow' }), button('Cerrar', { variant: 'ghost', onClick: () => modal.close() }), nextBtn],
  });

  try {
    [users, activity] = await Promise.all([loadUsers(), loadActivity().catch(() => ({ available: false, byUser: {} }))]);
  } catch (error) {
    notify.error('No se pudo cargar la lista de alumnos.');
    modal.close();
    return null;
  }
  paint();
  return modal;
}

