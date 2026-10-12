// Pantalla de acceso (y pantallas de estado previas al panel: conectando / sin conexión).
import { h, mount } from '../lib/h.js';
import { icon } from '../lib/icons.js';
import { button, field, textInput, withBusy, checkInput } from '../lib/ui.js';

const STYLE_ID = 'login-styles';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  .gate { position: fixed; inset: 0; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(420px, 0.95fr); background: var(--ink); }
  .gate__art { position: relative; display: flex; flex-direction: column; justify-content: flex-end; padding: 56px; overflow: hidden; -webkit-app-region: drag; }
  .gate__art::before { content: ''; position: absolute; inset: 0; background: url('assets/brick.jpg') center / 560px repeat; opacity: 0.16; mix-blend-mode: luminosity; }
  .gate__art::after { content: ''; position: absolute; inset: 0; background: linear-gradient(200deg, rgba(10,19,41,0.2) 0%, rgba(10,19,41,0.92) 78%); }
  .gate__art > * { position: relative; z-index: 1; }
  .gate__logo { position: absolute; top: 48px; left: 56px; height: 34px; }
  .gate__kicker { font-size: 0.75rem; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--brass-bright); margin-bottom: 14px; }
  .gate__headline { font-family: var(--font-display); font-weight: 700; font-size: clamp(3rem, 5.4vw, 5.2rem); line-height: 0.92; letter-spacing: 0.01em; text-transform: uppercase; max-width: 11ch; }
  .gate__headline em { font-style: normal; color: var(--brass-bright); }
  .gate__lead { margin-top: 20px; max-width: 42ch; color: var(--chalk-dim); font-size: 1.0625rem; }
  .gate__panel { display: flex; align-items: center; justify-content: center; padding: 48px; background: var(--board); border-left: 1px solid var(--line); }
  .gate__form { width: min(380px, 100%); display: flex; flex-direction: column; gap: 18px; }
  .gate__title { font-family: var(--font-display); font-weight: 700; font-size: 2.2rem; letter-spacing: 0.03em; text-transform: uppercase; line-height: 1; }
  .gate__sub { color: var(--chalk-dim); margin-top: 6px; }
  .gate__error { display: flex; gap: 10px; align-items: flex-start; padding: 11px 13px; border-radius: var(--r-md); background: var(--danger-wash); border: 1px solid rgba(240,115,106,0.4); font-size: var(--fs-sm); }
  .gate__error .icon { color: var(--danger); margin-top: 1px; }
  .gate__foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 4px; }
  .gate__center { position: fixed; inset: 0; display: grid; place-items: center; background: var(--board); text-align: center; padding: 32px; }
  .gate__center-card { max-width: 440px; display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .gate__center-card h1 { font-family: var(--font-display); font-weight: 700; font-size: 2rem; letter-spacing: 0.04em; text-transform: uppercase; }
  .pw { position: relative; }
  .pw .btn { position: absolute; right: 4px; top: 4px; height: 30px; }
  .pw .input { padding-right: 44px; }
  @media (max-width: 920px) { .gate { grid-template-columns: 1fr; } .gate__art { display: none; } }
  `;
  document.head.appendChild(style);
}

export function showConnecting(root, { message = 'Conectando con el servidor…', detail = 'Si el servidor estuvo un rato sin uso, puede tardar unos segundos en despertar.' } = {}) {
  ensureStyles();
  mount(
    root,
    h(
      'div',
      { class: 'gate__center' },
      h('div', { class: 'gate__center-card' }, h('img', { src: 'assets/logo.png', alt: 'Figueroa Trainer', style: { height: '30px' } }), h('div', { class: 'spinner', style: { marginTop: '10px' } }), h('h1', null, message), h('p', { class: 'muted' }, detail))
    )
  );
}

export function showOffline(root, { message, onRetry, onLogout }) {
  ensureStyles();
  mount(
    root,
    h(
      'div',
      { class: 'gate__center' },
      h(
        'div',
        { class: 'gate__center-card' },
        h('div', { class: 'empty__icon' }, icon('wifi', 26)),
        h('h1', null, 'No pudimos conectar'),
        h('p', { class: 'muted' }, message || 'Revisá tu conexión a internet. Tu sesión sigue guardada: cuando vuelva la conexión, seguís donde estabas.'),
        h('div', { class: 'row', style: { marginTop: '6px' } }, button('Reintentar', { variant: 'primary', icon: 'refresh', onClick: onRetry }), button('Cerrar sesión', { variant: 'ghost', onClick: onLogout }))
      )
    )
  );
}

export function showLogin(root, { lastEmail = '', notice, onSuccess }) {
  ensureStyles();

  const errorSlot = h('div');
  const email = textInput({ type: 'email', name: 'email', value: lastEmail, placeholder: 'tu@email.com', autocomplete: 'username', required: true });
  const password = textInput({ type: 'password', name: 'password', placeholder: 'Tu contraseña', autocomplete: 'current-password', required: true });
  const remember = checkInput({ checked: true, label: 'Mantener la sesión en este equipo' });
  const showBtn = button('Mostrar contraseña', { variant: 'ghost', size: 'sm', iconOnly: true, icon: 'eye', onClick: () => {
    const hidden = password.type === 'password';
    password.type = hidden ? 'text' : 'password';
    showBtn.setAttribute('aria-pressed', String(hidden));
  } });

  function showError(message) {
    mount(errorSlot, message ? h('div', { class: 'gate__error', role: 'alert' }, icon('alert', 18), h('div', null, message)) : null);
  }

  const submitBtn = button('Ingresar', { variant: 'primary', type: 'submit', style: { height: '42px', fontSize: '0.9375rem' } });

  async function submit(event) {
    event.preventDefault();
    showError('');
    if (!email.value.trim() || !password.value) {
      showError('Completá tu email y tu contraseña.');
      (email.value.trim() ? password : email).focus();
      return;
    }
    await withBusy(submitBtn, async () => {
      const result = await window.ft.login({ email: email.value, password: password.value, remember: remember.querySelector('input').checked });
      if (!result.ok) {
        showError(result.error?.message || 'No se pudo iniciar sesión.');
        password.select();
        return;
      }
      onSuccess(result.data.user);
    });
  }

  const form = h(
    'form',
    { class: 'gate__form', onSubmit: submit, novalidate: true },
    h('div', null, h('h1', { class: 'gate__title' }, 'Ingresá'), h('p', { class: 'gate__sub' }, 'Solo cuentas de administrador.')),
    notice ? h('div', { class: 'notice notice--warn' }, icon('alert', 16), h('div', null, notice)) : null,
    errorSlot,
    field('Email', email),
    field('Contraseña', h('div', { class: 'pw' }, password, showBtn)),
    remember,
    submitBtn,
    h('div', { class: 'gate__foot' }, h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, 'Figueroa Trainer · Panel de entrenadores'))
  );

  mount(
    root,
    h(
      'div',
      { class: 'gate' },
      h(
        'section',
        { class: 'gate__art', 'aria-hidden': 'true' },
        h('img', { class: 'gate__logo', src: 'assets/logo.png', alt: '' }),
        h('p', { class: 'gate__kicker' }, 'Panel de entrenadores'),
        h('h2', { class: 'gate__headline' }, 'Tu sala de ', h('em', null, 'control')),
        h('p', { class: 'gate__lead' }, 'Alumnos, planes y tienda en un solo lugar, con todo a un atajo de distancia.')
      ),
      h('section', { class: 'gate__panel' }, form)
    )
  );
  setTimeout(() => (lastEmail ? password : email).focus(), 50);
}
