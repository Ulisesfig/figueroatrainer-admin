// Cliente HTTP del proceso principal. Vive acá (y no en la ventana) para que:
//   - no haya problemas de CORS con el backend,
//   - el token nunca esté al alcance del código de la interfaz,
//   - los reintentos por "servidor dormido" (Railway) sean transparentes.
const { getSettings, loadSession, saveSession, clearSession } = require('./storage');

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_RETRIES = 2;

let session = null; // { token, user } en memoria
let onSessionExpired = () => {};

function init({ sessionExpiredHandler }) {
  session = loadSession();
  onSessionExpired = sessionExpiredHandler || onSessionExpired;
}

function getSession() {
  return session;
}

function setSession(next) {
  session = next;
  if (next) saveSession(next);
  else clearSession();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(pathname, query) {
  const base = getSettings().apiUrl.replace(/\/+$/, '');
  const url = new URL(base + pathname);
  if (query && typeof query === 'object') {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
  }
  return url;
}

function errorEnvelope(message, extra = {}) {
  return { ok: false, error: { message, ...extra } };
}

// request({ method, path, query, body, auth }) → { ok, data } | { ok:false, error }
async function request({ method = 'GET', path, query, body, auth = true, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!path || !path.startsWith('/')) return errorEnvelope('Ruta de API inválida');

  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (auth) {
    if (!session?.token) return errorEnvelope('No hay una sesión iniciada', { status: 401, code: 'NO_SESSION' });
    headers.Authorization = `Bearer ${session.token}`;
  }

  let url;
  try {
    url = buildUrl(path, query);
  } catch (_error) {
    return errorEnvelope('La dirección del servidor no es válida. Revisala en Ajustes.', { code: 'BAD_URL' });
  }

  let attempt = 0;
  let lastError = null;

  while (attempt <= MAX_RETRIES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const text = await response.text();
      let payload = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch (_error) {
          payload = { message: text.slice(0, 300) };
        }
      }

      const transient = [502, 503, 504].includes(response.status);
      if (transient && attempt < MAX_RETRIES) {
        attempt += 1;
        await sleep(1500 * attempt);
        continue;
      }

      if (response.status === 401 && auth) {
        // Token vencido o inválido: cerramos la sesión local y avisamos a la ventana.
        setSession(null);
        onSessionExpired();
        return errorEnvelope('Tu sesión venció. Iniciá sesión de nuevo.', { status: 401, code: 'SESSION_EXPIRED' });
      }

      if (!response.ok || (payload && payload.success === false)) {
        return errorEnvelope(payload?.message || `Error ${response.status}`, {
          status: response.status,
          code: payload?.code,
          field: payload?.field,
          transient,
        });
      }

      return { ok: true, data: payload ?? { success: true }, status: response.status };
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      const aborted = error?.name === 'AbortError';
      const network = aborted || /fetch failed|network|ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/i.test(String(error?.message) + String(error?.cause?.code || ''));
      if (network && attempt < MAX_RETRIES) {
        attempt += 1;
        await sleep(1500 * attempt);
        continue;
      }
      if (aborted) {
        return errorEnvelope('El servidor tardó demasiado en responder. Puede estar iniciándose: probá de nuevo en unos segundos.', {
          code: 'TIMEOUT',
          transient: true,
        });
      }
      if (network) {
        return errorEnvelope('No hay conexión con el servidor. Revisá tu internet e intentá de nuevo.', {
          code: 'NETWORK',
          transient: true,
        });
      }
      break;
    }
  }

  return errorEnvelope(lastError?.message || 'No se pudo completar la solicitud');
}

// Inicio de sesión: solo cuentas con rol admin pueden usar este programa.
async function login({ email, password, remember }) {
  const result = await request({
    method: 'POST',
    path: '/api/auth/login',
    auth: false,
    body: { email: String(email || '').trim().toLowerCase(), password, remember: Boolean(remember) },
  });
  if (!result.ok) return result;

  const { token, user } = result.data || {};
  if (!token || !user) return errorEnvelope('El servidor no devolvió una sesión válida');
  if (String(user.role || '').toLowerCase() !== 'admin') {
    return errorEnvelope('Esta cuenta no tiene permisos de administrador.', { code: 'NOT_ADMIN' });
  }

  setSession({ token, user });
  return { ok: true, data: { user } };
}

async function logout() {
  // Best effort: avisar al servidor, pero cerrar la sesión local pase lo que pase.
  if (session?.token) {
    await request({ method: 'POST', path: '/api/auth/logout', timeoutMs: 5000 }).catch(() => {});
  }
  setSession(null);
}

// Verifica que el token guardado siga siendo válido y que la cuenta siga siendo admin.
async function verifySession() {
  if (!session?.token) return { ok: false, error: { message: 'Sin sesión', code: 'NO_SESSION' } };
  const result = await request({ path: '/api/auth/me' });
  if (!result.ok) return result;
  const user = result.data?.user;
  if (!user || String(user.role || '').toLowerCase() !== 'admin') {
    setSession(null);
    return errorEnvelope('Esta cuenta ya no tiene permisos de administrador.', { code: 'NOT_ADMIN' });
  }
  session = { ...session, user };
  saveSession(session);
  return { ok: true, data: { user } };
}

module.exports = { init, request, login, logout, verifySession, getSession, setSession };
