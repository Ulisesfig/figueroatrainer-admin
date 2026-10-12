// Mensajes de contacto: lo que la gente manda desde la página de Contacto del sitio.
// También llega por email, pero acá queda guardado siempre (y se puede ver, responder
// o borrar aunque el email haya fallado).
import { h, mount } from '../lib/h.js';
import { icon } from '../lib/icons.js';
import { api, errorMessage } from '../lib/api.js';
import { button, badge, emptyState, errorBox, loadingBlock, notify, openModal, confirmDialog, segmented, textInput, withBusy } from '../lib/ui.js';
import { loadContacts, invalidate, removeCached, getContactsLastSeenId, markContactsSeen } from '../lib/data.js';
import { normalize, debounce, formatDateTime, timeAgo, whatsappUrl } from '../lib/format.js';

export const TOPIC_LABELS = { planes: 'Planes y tarifas', rutina: 'Dudas sobre rutina', nutricion: 'Consulta de nutrición', tienda: 'Pedido en tienda', otro: 'Otro' };
const TOPIC_VARIANT = { planes: 'brass', rutina: 'info', nutricion: 'ok', tienda: 'warn', otro: 'neutral' };

function topicBadge(topicKey) {
  return badge(TOPIC_LABELS[topicKey] || topicKey || 'Otro', TOPIC_VARIANT[topicKey] || 'neutral');
}

export function contactsView(container, params, app) {
  let contacts = [];
  let query = '';
  let topic = 'all';
  let destroyed = false;
  let modal = null;
  let lastParamId = null;
  // Se fija una sola vez al entrar a la pantalla: define qué se marca "nuevo" durante esta
  // visita, sin ir cambiando con cada repintado (si no, un mensaje recién abierto "perdería"
  // la marca antes de que el administrador termine de mirar la lista).
  let seenWatermark = getContactsLastSeenId();

  const searchInput = textInput({ type: 'search', placeholder: 'Buscar por nombre, email o mensaje…', 'aria-label': 'Buscar mensajes' });
  const segments = segmented(
    [{ value: 'all', label: 'Todos', count: 0 }, ...Object.entries(TOPIC_LABELS).map(([value, label]) => ({ value, label, count: 0 }))],
    topic,
    (v) => { topic = v; paint(); }
  );
  const listHost = h('div');
  let clearAllBtn;

  const page = h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'page__head' },
      h('div', null, h('h1', { class: 'page__title' }, 'Mensajes'), h('p', { class: 'page__sub' }, 'Lo que la gente te escribe desde la página de Contacto. También llega por email; acá queda guardado siempre.')),
      h('div', { class: 'page__actions' }, button('Actualizar', { icon: 'refresh', onClick: () => load({ force: true }) }), clearAllBtn = button('Vaciar todos', { variant: 'danger', icon: 'trash', onClick: () => clearAll() }))
    ),
    h('div', { class: 'toolbar' }, h('div', { class: 'input-icon grow', style: { maxWidth: '420px' } }, icon('search', 16), searchInput), segments),
    listHost
  );
  mount(container, page);

  searchInput.addEventListener('input', debounce(() => { query = normalize(searchInput.value.trim()); paint(); }, 120));

  async function load({ force = false } = {}) {
    mount(listHost, loadingBlock('Cargando mensajes…'));
    try {
      contacts = await loadContacts({ force });
      if (destroyed) return;
      paint();
      handleParams(params);
      markAllSeen();
    } catch (error) {
      if (!destroyed) mount(listHost, errorBox(errorMessage(error), () => load({ force: true })));
    }
  }

  // Al entrar se marcan como vistos (actualiza el contador de la barra lateral); el resaltado
  // de "nuevo" en esta pantalla sigue usando el valor de antes (seenWatermark) hasta que se salga.
  function markAllSeen() {
    if (!contacts.length) return;
    markContactsSeen(Math.max(...contacts.map((c) => c.id)));
    app.refreshBadges?.();
  }

  function filtered() {
    return contacts
      .filter((c) => topic === 'all' || c.topic === topic)
      .filter((c) => !query || normalize(`${c.name} ${c.email} ${c.message}`).includes(query))
      .sort((a, b) => b.id - a.id);
  }

  function paintCounts() {
    segments.setCount('all', contacts.length);
    Object.keys(TOPIC_LABELS).forEach((key) => segments.setCount(key, contacts.filter((c) => c.topic === key).length));
  }

  function paint() {
    if (destroyed) return;
    paintCounts();
    const list = filtered();

    if (!contacts.length) {
      mount(listHost, emptyState({ icon: 'mail', title: 'Todavía no llegó ningún mensaje', text: 'Cuando alguien escriba desde la página de Contacto, va a aparecer acá (y también te llega por email).' }));
      return;
    }
    if (!list.length) {
      mount(listHost, h('div', { class: 'table-wrap' }, emptyState({ icon: 'search', title: 'Sin resultados', text: 'Ningún mensaje coincide con la búsqueda o el filtro.' })));
      return;
    }

    mount(listHost, h('div', { class: 'col gap-8' }, list.map((c) => {
      const isNew = c.id > seenWatermark;
      const preview = (c.message || '').replace(/\s+/g, ' ').trim();
      return h(
        'article',
        { class: ['contact-row', isNew && 'is-new'], tabindex: 0, onClick: () => app.navigate(`contacts/${c.id}`), onKeydown: (e) => { if (e.key === 'Enter') app.navigate(`contacts/${c.id}`); } },
        isNew ? h('span', { class: 'contact-row__dot', title: 'Nuevo', 'aria-label': 'Nuevo' }) : h('span', { class: 'contact-row__dot contact-row__dot--empty' }),
        h('div', { class: 'grow', style: { minWidth: 0 } },
          h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, h('strong', null, c.name), h('span', { class: 'faint' }, c.email), c.phone ? h('span', { class: 'faint' }, c.phone) : null, topicBadge(c.topic)),
          h('div', { class: 'faint trunc', style: { fontSize: 'var(--fs-sm)', marginTop: '2px' } }, preview)),
        h('div', { class: 'col', style: { alignItems: 'flex-end', gap: '2px', flex: 'none' } }, h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, timeAgo(c.created_at)), h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, formatDateTime(c.created_at)))
      );
    })));
  }

  // ─── Detalle ───
  function openDetail(contact) {
    const mailto = `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(`Re: ${TOPIC_LABELS[contact.topic] || 'Consulta'} - Figueroa Trainer`)}`;
    const wa = whatsappUrl(contact.phone, `Hola ${contact.name}! Te escribo de Figueroa Trainer por tu consulta.`);
    const deleteBtn = button('Eliminar', { variant: 'danger', icon: 'trash' });
    deleteBtn.addEventListener('click', () => remove(contact));
    modal = openModal({
      title: contact.name,
      subtitle: `${contact.email}${contact.phone ? ` · ${contact.phone}` : ''} · ${formatDateTime(contact.created_at)}`,
      size: 'md',
      body: h('div', { class: 'col gap-16' }, topicBadge(contact.topic), h('div', { class: 'contact-message selectable' }, contact.message)),
      footer: [
        deleteBtn,
        h('span', { class: 'grow' }),
        wa ? button('Responder por WhatsApp', { icon: 'chat', onClick: () => window.ft.openExternal(wa) }) : null,
        button('Responder por email', { variant: 'primary', icon: 'mail', onClick: () => window.ft.openExternal(mailto) }),
      ],
      onClose: () => { modal = null; if (!destroyed) app.navigate('contacts', { replace: true }); },
    });
  }

  async function remove(contact) {
    if (!(await confirmDialog({ title: 'Eliminar mensaje', message: `Se elimina el mensaje de ${contact.name}. Esta acción no se puede deshacer.`, confirmText: 'Eliminar', danger: true }))) return;
    try {
      await api.del(`/api/contact/${contact.id}`);
      removeCached('contacts', contact.id);
      contacts = contacts.filter((c) => c.id !== contact.id);
      notify.ok('Mensaje eliminado.');
      modal?.close();
      paint();
    } catch (error) { notify.error(errorMessage(error)); }
  }

  // Vacía la bandeja entera. Irreversible: pide escribir "VACIAR" además del diálogo normal,
  // igual que borrar un alumno pide escribir su email.
  async function clearAll() {
    if (!contacts.length) { notify.info('No hay mensajes para borrar.'); return; }
    const confirmed = await confirmDialog({
      title: 'Vaciar todos los mensajes',
      message: `Esto borra los ${contacts.length} mensajes guardados, para siempre. No se puede deshacer.`,
      confirmText: 'Vaciar todo',
      danger: true,
      requireText: 'VACIAR',
    });
    if (!confirmed) return;
    await withBusy(clearAllBtn, async () => {
      try {
        const res = await api.del('/api/contact', { body: { confirm: 'VACIAR' } });
        contacts = [];
        invalidate('contacts');
        modal?.close();
        paint();
        notify.ok(res.message || 'Mensajes eliminados.');
      } catch (error) { notify.error(errorMessage(error)); }
    });
  }

  function handleParams(p) {
    params = p;
    const id = p.id || null;
    if (id === lastParamId && (modal || !id)) return;
    lastParamId = id;
    if (modal) { modal.close(); modal = null; }
    if (!id) return;
    const contact = contacts.find((c) => String(c.id) === String(id));
    if (!contact) { notify.warn('No encontramos ese mensaje. Puede que ya se haya eliminado.'); app.navigate('contacts', { replace: true }); return; }
    openDetail(contact);
  }

  load();

  return {
    onParams: (p) => { if (contacts.length || p.id) handleParams(p); else params = p; },
    refresh: () => load({ force: true }),
    destroy() {
      destroyed = true;
      modal?.close();
    },
  };
}
