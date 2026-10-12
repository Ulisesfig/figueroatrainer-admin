// Persistencia local de la app: preferencias (JSON plano) y sesión (token
// cifrado con el almacén seguro del sistema operativo cuando está disponible).
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const DEFAULT_API_URL = 'https://figueroatrainer-backend-production.up.railway.app';

function userFile(name) {
  return path.join(app.getPath('userData'), name);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function writeJsonAtomic(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

// ─── Preferencias ────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  apiUrl: DEFAULT_API_URL,
  lastEmail: '',
  sidebarCollapsed: false,
  window: { width: 1360, height: 860, maximized: false },
};

let settingsCache = null;

function getSettings() {
  if (!settingsCache) {
    const saved = readJson(userFile('settings.json'), {});
    settingsCache = {
      ...DEFAULT_SETTINGS,
      ...saved,
      window: { ...DEFAULT_SETTINGS.window, ...(saved.window || {}) },
    };
    if (process.env.FT_API_URL) settingsCache.apiUrl = process.env.FT_API_URL;
  }
  return settingsCache;
}

function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  if (patch.window) next.window = { ...getSettings().window, ...patch.window };
  // No persistimos la URL forzada por variable de entorno (uso de pruebas).
  const toSave = { ...next };
  if (process.env.FT_API_URL) toSave.apiUrl = readJson(userFile('settings.json'), {}).apiUrl || DEFAULT_API_URL;
  settingsCache = next;
  try {
    writeJsonAtomic(userFile('settings.json'), toSave);
  } catch (error) {
    console.error('No se pudieron guardar las preferencias:', error.message);
  }
  return next;
}

// ─── Sesión ──────────────────────────────────────────────────────────────────

function loadSession() {
  const raw = readJson(userFile('session.json'), null);
  if (!raw || !raw.token) return null;
  try {
    const token = raw.encrypted
      ? safeStorage.decryptString(Buffer.from(raw.token, 'base64'))
      : Buffer.from(raw.token, 'base64').toString('utf8');
    return { token, user: raw.user || null };
  } catch (_error) {
    // Si el sistema no puede descifrar (por ejemplo, otro usuario de Windows),
    // es más seguro descartar la sesión que reventar al abrir.
    clearSession();
    return null;
  }
}

function saveSession({ token, user }) {
  const canEncrypt = safeStorage.isEncryptionAvailable();
  const payload = canEncrypt
    ? safeStorage.encryptString(token).toString('base64')
    : Buffer.from(token, 'utf8').toString('base64');
  writeJsonAtomic(userFile('session.json'), { encrypted: canEncrypt, token: payload, user });
}

function clearSession() {
  try {
    fs.unlinkSync(userFile('session.json'));
  } catch (_error) {
    // Ya no existía.
  }
}

module.exports = {
  DEFAULT_API_URL,
  getSettings,
  setSettings,
  loadSession,
  saveSession,
  clearSession,
};
