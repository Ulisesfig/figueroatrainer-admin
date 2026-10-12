// Componentes de interfaz reutilizables: avisos, diálogos, paneles y controles de formulario.
import { h, mount } from './h.js';
import { icon } from './icons.js';
import { initials } from './format.js';

// ─── Botones y estados ──────────────────────────────────────────────────────

export function button(label, { variant = 'secondary', size, icon: iconName, onClick, type = 'button', title, disabled, iconOnly, ...rest } = {}) {
  return h(
    'button',
    {
      type,
      class: ['btn', `btn--${variant}`, size === 'sm' && 'btn--sm', iconOnly && 'btn--icon'],
      title: title || (iconOnly ? label : undefined),
      'aria-label': iconOnly ? label : undefined,
      disabled,
      onClick,
      ...rest,
    },
    iconName ? icon(iconName, size === 'sm' ? 15 : 17) : null,
    iconOnly ? null : label
  );
}

// Ejecuta una acción asíncrona mostrando el botón "cargando" y evitando dobles clics.
export async function withBusy(btn, task) {
  if (btn.classList.contains('is-loading')) return undefined;
  btn.classList.add('is-loading');
  btn.disabled = true;
  try {
    return await task();
  } finally {
    btn.classList.remove('is-loading');
    btn.disabled = false;
  }
}

export function badge(text, variant = 'neutral', { dot = false } = {}) {
  return h('span', { class: ['badge', variant !== 'neutral' && `badge--${variant}`] }, dot ? h('span', { class: 'badge__dot' }) : null, text);
}

export function avatar(user, size) {
  return h('span', { class: ['avatar', size && `avatar--${size}`], 'aria-hidden': 'true' }, initials(user));
}

export function emptyState({ icon: iconName = 'info', title, text, action } = {}) {
  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'empty__icon' }, icon(iconName, 26)),
    h('div', { class: 'empty__title' }, title),
    text ? h('p', { class: 'empty__text' }, text) : null,
    action || null
  );
}

export function loadingBlock(text = 'Cargando…') {
  return h('div', { class: 'loading-block', role: 'status' }, h('div', { class: 'spinner' }), text);
}

export function errorBox(message, onRetry) {
  return h(
    'div',
    { class: 'error-box', role: 'alert' },
    icon('alert', 20),
    h('div', { class: 'error-box__text' }, message),
    onRetry ? button('Reintentar', { size: 'sm', icon: 'refresh', onClick: onRetry }) : null
  );
}

export function notice(text, { warn = false, iconName = 'info' } = {}) {
  return h('div', { class: ['notice', warn && 'notice--warn'] }, icon(iconName, 16), h('div', null, text));
}

// ─── Formularios ────────────────────────────────────────────────────────────

export function field(label, control, { hint, error, className } = {}) {
  return h(
    'label',
    { class: ['field', className] },
    label ? h('span', { class: 'field__label' }, label) : null,
    control,
    hint ? h('span', { class: 'field__hint' }, hint) : null,
    error ? h('span', { class: 'field__error' }, error) : null
  );
}

export function textInput(props = {}) {
  const { className, ...rest } = props;
  return h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', ...rest, class: ['input', className] });
}

export function textArea(props = {}) {
  const { className, ...rest } = props;
  return h('textarea', { ...rest, class: ['textarea', className] });
}

export function selectInput(options, value, props = {}) {
  const { className, ...rest } = props;
  const el = h(
    'select',
    { ...rest, class: ['select', className] },
    options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label))
  );
  el.value = value ?? '';
  return el;
}

export function switchInput({ checked = false, label, onChange, disabled } = {}) {
  const input = h('input', { type: 'checkbox', checked, disabled, onChange: (e) => onChange && onChange(e.target.checked, e) });
  return h('label', { class: 'switch' }, input, h('span', { class: 'switch__track' }), label ? h('span', null, label) : null);
}

export function checkInput({ checked = false, onChange, label, indeterminate = false, ...rest } = {}) {
  const input = h('input', { type: 'checkbox', checked, indeterminate, onChange: (e) => onChange && onChange(e.target.checked, e), ...rest });
  return h('label', { class: 'check', onClick: (e) => e.stopPropagation() }, input, label ? h('span', { style: { marginLeft: '8px' } }, label) : null);
}

export function segmented(items, value, onChange) {
  let current = value;
  const buttons = new Map();
  const root = h('div', { class: 'segmented', role: 'tablist' });
  const paint = () => buttons.forEach((btn, key) => btn.classList.toggle('is-active', key === current));
  items.forEach((item) => {
    const btn = h(
      'button',
      { type: 'button', class: 'segmented__btn', role: 'tab', onClick: () => { current = item.value; paint(); onChange(item.value); } },
      item.label,
      item.count !== undefined ? h('span', { class: 'segmented__count num' }, item.count) : null
    );
    buttons.set(item.value, btn);
    root.appendChild(btn);
  });
  paint();
  root.set = (v) => { current = v; paint(); };
  root.setCount = (key, count) => {
    const countEl = buttons.get(key)?.querySelector('.segmented__count');
    if (countEl) countEl.textContent = String(count);
  };
  return root;
}

export function tabs(items, value, onChange) {
  let current = value;
  const buttons = new Map();
  const root = h('div', { class: 'tabs', role: 'tablist' });
  const paint = () => buttons.forEach((btn, key) => {
    btn.classList.toggle('is-active', key === current);
    btn.setAttribute('aria-selected', String(key === current));
  });
  items.forEach((item) => {
    const btn = h('button', { type: 'button', class: 'tabs__btn', role: 'tab', onClick: () => { current = item.value; paint(); onChange(item.value); } }, item.label);
    buttons.set(item.value, btn);
    root.appendChild(btn);
  });
  paint();
  root.set = (v) => { current = v; paint(); };
  return root;
}

// ─── Avisos (toasts) ────────────────────────────────────────────────────────

let toastRoot = null;

export function toast(message, { type = 'info', duration = 4200, action } = {}) {
  if (!toastRoot) {
    toastRoot = h('div', { class: 'toasts', 'aria-live': 'polite' });
    document.body.appendChild(toastRoot);
  }
  const iconName = { ok: 'check', error: 'alert', warn: 'alert', info: 'info' }[type] || 'info';
  const el = h(
    'div',
    { class: ['toast', type !== 'info' && `toast--${type}`], role: type === 'error' ? 'alert' : 'status' },
    icon(iconName, 18),
    h('div', { class: 'toast__text' }, message),
    action ? button(action.label, { variant: 'ghost', size: 'sm', onClick: () => { action.onClick(); dismiss(); } }) : null,
    button('Cerrar aviso', { variant: 'ghost', size: 'sm', iconOnly: true, icon: 'x', onClick: () => dismiss() })
  );
  let timer = null;
  function dismiss() {
    clearTimeout(timer);
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 220);
  }
  toastRoot.appendChild(el);
  // Los errores se quedan más tiempo: hay que poder leerlos.
  timer = setTimeout(dismiss, type === 'error' ? Math.max(duration, 7000) : duration);
  return dismiss;
}

export const notify = {
  ok: (msg, opts) => toast(msg, { ...opts, type: 'ok' }),
  error: (msg, opts) => toast(msg, { ...opts, type: 'error' }),
  warn: (msg, opts) => toast(msg, { ...opts, type: 'warn' }),
  info: (msg, opts) => toast(msg, opts),
};

// ─── Capas: modal y panel lateral ───────────────────────────────────────────

const layerStack = []; // la última capa abierta es la que responde a Esc

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !layerStack.length) return;
  const top = layerStack[layerStack.length - 1];
  if (top.dismissible !== false) {
    event.preventDefault();
    event.stopPropagation();
    top.close();
  }
}, true);

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapFocus(container, event) {
  if (event.key !== 'Tab') return;
  const items = [...container.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

export function openModal({ title, subtitle, body, footer, size, dismissible = true, onClose, initialFocus } = {}) {
  const previousFocus = document.activeElement;
  let closed = false;

  const modal = h(
    'div',
    { class: ['modal', size && `modal--${size}`], role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h(
      'div',
      { class: 'modal__head' },
      h('div', null, h('h2', { class: 'modal__title' }, title), subtitle ? h('p', { class: 'modal__sub' }, subtitle) : null),
      dismissible ? button('Cerrar', { variant: 'ghost', size: 'sm', iconOnly: true, icon: 'x', onClick: () => layer.close() }) : null
    ),
    h('div', { class: 'modal__body' }, body),
    footer ? h('div', { class: 'modal__foot' }, footer) : null
  );
  const overlay = h('div', {
    class: 'overlay',
    onMousedown: (e) => { if (e.target === overlay && dismissible) layer.close(); },
    onKeydown: (e) => trapFocus(modal, e),
  }, modal);

  const layer = {
    el: modal,
    dismissible,
    close(result) {
      if (closed) return;
      closed = true;
      const idx = layerStack.indexOf(layer);
      if (idx >= 0) layerStack.splice(idx, 1);
      overlay.remove();
      if (previousFocus && previousFocus.focus) previousFocus.focus();
      if (onClose) onClose(result);
    },
  };
  layerStack.push(layer);
  document.body.appendChild(overlay);
  const target = (initialFocus && modal.querySelector(initialFocus)) || modal.querySelector('input:not([type=checkbox]), textarea, select') || modal.querySelector(FOCUSABLE);
  if (target) setTimeout(() => target.focus(), 30);
  return layer;
}

export function confirmDialog({ title = '¿Confirmás la acción?', message, confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false, requireText } = {}) {
  return new Promise((resolve) => {
    let decided = false;
    const finish = (value) => {
      if (decided) return;
      decided = true;
      layer.close();
      resolve(value);
    };

    let confirmBtn;
    let typed = null;
    const body = h('div', { class: 'col' }, h('p', { class: 'muted', style: { whiteSpace: 'pre-line' } }, message));
    if (requireText) {
      typed = textInput({ placeholder: requireText, 'aria-label': `Escribí ${requireText} para confirmar`, onInput: () => { confirmBtn.disabled = typed.value.trim().toLowerCase() !== requireText.toLowerCase(); } });
      body.appendChild(field(`Para confirmar, escribí “${requireText}”`, typed));
    }
    confirmBtn = button(confirmText, { variant: danger ? 'danger' : 'primary', onClick: () => finish(true), disabled: Boolean(requireText) });
    const layer = openModal({
      title,
      body,
      size: 'sm',
      footer: [button(cancelText, { variant: 'ghost', onClick: () => finish(false) }), confirmBtn],
      onClose: () => { if (!decided) { decided = true; resolve(false); } },
      initialFocus: requireText ? 'input' : undefined,
    });
    if (!requireText) setTimeout(() => confirmBtn.focus(), 40);
  });
}

export function promptDialog({ title, label, value = '', placeholder, confirmText = 'Aceptar', type = 'text' } = {}) {
  return new Promise((resolve) => {
    let decided = false;
    const input = textInput({ value, placeholder, type, onKeydown: (e) => { if (e.key === 'Enter') submit(); } });
    const submit = () => { decided = true; layer.close(); resolve(input.value); };
    const layer = openModal({
      title,
      size: 'sm',
      body: field(label, input),
      footer: [button('Cancelar', { variant: 'ghost', onClick: () => layer.close() }), button(confirmText, { variant: 'primary', onClick: submit })],
      onClose: () => { if (!decided) resolve(null); },
    });
  });
}

let currentDrawer = null;

export function openDrawer({ head, tabsEl, body, foot, onClose } = {}) {
  if (currentDrawer) currentDrawer.close(true);
  const previousFocus = document.activeElement;
  let closed = false;

  const scrim = h('div', { class: 'drawer-scrim', onMousedown: () => layer.close() });
  const drawerEl = h(
    'aside',
    { class: 'drawer', role: 'dialog', 'aria-modal': 'true', tabindex: '-1', onKeydown: (e) => trapFocus(drawerEl, e) },
    h('div', { class: 'drawer__head' }, head, button('Cerrar panel', { variant: 'ghost', size: 'sm', iconOnly: true, icon: 'x', onClick: () => layer.close() })),
    tabsEl ? h('div', { class: 'drawer__tabs' }, tabsEl) : null,
    body,
    foot ? h('div', { class: 'drawer__foot' }, foot) : null
  );

  const layer = {
    el: drawerEl,
    body,
    close(silent) {
      if (closed) return;
      closed = true;
      const idx = layerStack.indexOf(layer);
      if (idx >= 0) layerStack.splice(idx, 1);
      if (currentDrawer === layer) currentDrawer = null;
      scrim.remove();
      drawerEl.remove();
      if (previousFocus && previousFocus.focus && document.contains(previousFocus)) previousFocus.focus();
      if (onClose) onClose(silent);
    },
  };
  currentDrawer = layer;
  layerStack.push(layer);
  document.body.appendChild(scrim);
  document.body.appendChild(drawerEl);
  setTimeout(() => (drawerEl.querySelector('.tabs__btn.is-active') || drawerEl).focus(), 30);
  return layer;
}

export function closeAllLayers() {
  [...layerStack].reverse().forEach((layer) => layer.close());
}

export function hasOpenLayer() {
  return layerStack.length > 0;
}

// Mensaje de error de formulario en un campo puntual.
export function markInvalid(control, invalid = true) {
  control.classList.toggle('is-invalid', invalid);
  if (invalid) control.setAttribute('aria-invalid', 'true');
  else control.removeAttribute('aria-invalid');
}

export { mount };
