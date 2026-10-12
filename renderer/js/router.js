// Router por hash (#/users/12). Cada vista devuelve opcionalmente
// { destroy(), refresh(), beforeLeave() } para limpiar, actualizar datos y
// proteger cambios sin guardar.
let routes = [];
let current = null; // { route, params, instance, hash }
let committedHash = '';
let ignoreNext = false;
let onChange = () => {};
let container = null;
let appRef = null;
let navToken = 0;

function compile(pattern) {
  const keys = [];
  const regex = new RegExp(
    '^' + pattern.replace(/\/?:(\w+)(\?)?/g, (_m, key, optional) => {
      keys.push(key);
      return optional ? '(?:/([^/]+))?' : '/([^/]+)';
    }) + '$'
  );
  return { regex, keys };
}

export function defineRoutes(list) {
  routes = list.map((route) => ({ ...route, ...compile(route.path) }));
}

function parse(hash) {
  const [pathPart, queryPart] = (hash || '').replace(/^#\/?/, '').split('?');
  const clean = pathPart || 'home';
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  for (const route of routes) {
    const match = clean.match(route.regex);
    if (match) {
      const params = { query };
      route.keys.forEach((key, i) => { params[key] = match[i + 1] ? decodeURIComponent(match[i + 1]) : undefined; });
      return { route, params };
    }
  }
  return { route: routes.find((r) => r.path === 'home'), params: { query } };
}

export function currentRoute() {
  return current;
}

export function navigate(path, { replace = false } = {}) {
  const target = `#/${path.replace(/^\/+/, '')}`;
  if (replace) {
    history.replaceState(null, '', target);
    render();
  } else if (location.hash === target) {
    render();
  } else {
    location.hash = target;
  }
}

async function render() {
  const token = ++navToken;
  const hash = location.hash || '#/home';
  const { route, params } = parse(hash);

  // Misma vista con distinto parámetro (ej. abrir otro alumno): se le avisa sin recrearla.
  if (current && current.route === route && current.instance?.onParams) {
    current.params = params;
    current.hash = hash;
    committedHash = hash;
    current.instance.onParams(params);
    onChange(current);
    return;
  }

  if (current?.instance?.beforeLeave) {
    const allowed = await current.instance.beforeLeave();
    if (token !== navToken) return;
    if (allowed === false) {
      ignoreNext = true;
      location.hash = committedHash;
      return;
    }
  }

  current?.instance?.destroy?.();
  container.replaceChildren();
  container.scrollTop = 0;

  const entry = { route, params, instance: null, hash };
  current = entry;
  committedHash = hash;
  onChange(entry);

  try {
    entry.instance = (await route.view(container, params, appRef)) || {};
  } catch (error) {
    console.error('Error al abrir la vista', error);
    entry.instance = {};
  }
}

let listening = false;

export function startRouter({ mountEl, app, onRouteChange }) {
  container = mountEl;
  appRef = app;
  onChange = onRouteChange || (() => {});
  if (!listening) {
    listening = true;
    window.addEventListener('hashchange', () => {
      if (!container) return;
      if (ignoreNext) { ignoreNext = false; return; }
      render();
    });
  }
  render();
}

// Al cerrar sesión: se limpia la vista actual sin preguntar nada.
export function stopRouter() {
  navToken += 1;
  current?.instance?.destroy?.();
  current = null;
  container = null;
  committedHash = '';
  ignoreNext = false;
}

export function refreshCurrent() {
  return current?.instance?.refresh?.();
}
