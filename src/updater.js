// Actualizaciones automáticas (electron-updater + feed propio en /updates del backend).
// La app busca versiones nuevas al abrir y cada 4 horas, las descarga en segundo plano y
// avisa cuando están listas para instalarse (también se instalan solas al cerrar la app).
// Antes de habilitar la instalación se verifica latest.sig (ver updateSignature.js).
const { app, net } = require('electron');
const updateSignature = require('./updateSignature');

const FEED_URL = process.env.FT_UPDATE_FEED || 'https://figueroatrainer-backend-production.up.railway.app/updates/';

async function hasValidSignature(info) {
  const sha512 = info?.files?.[0]?.sha512 || info?.sha512;
  try {
    const resp = await net.fetch(`${FEED_URL}latest.sig?v=${encodeURIComponent(info.version)}`, { cache: 'no-store' });
    if (!resp.ok) return false;
    return updateSignature.verify(info.version, sha512, await resp.text());
  } catch (_) {
    return false;
  }
}

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 15 * 1000;

let autoUpdater = null;
let status = { state: 'idle', enabled: false };
let notify = () => {};
let timer = null;

function setStatus(next) {
  status = { ...status, ...next };
  notify(status);
}

function init({ onStatus }) {
  notify = onStatus || notify;

  // Solo tiene sentido en la app instalada (en desarrollo no hay versión publicada que comparar).
  const enabled = app.isPackaged || process.env.FT_FORCE_UPDATER === '1';
  status = { state: 'idle', enabled, version: app.getVersion() };
  if (!enabled) return;

  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (error) {
    console.error('electron-updater no está disponible:', error.message);
    status.enabled = false;
    return;
  }

  if (!app.isPackaged) autoUpdater.forceDevUpdateConfig = true; // solo pruebas (FT_FORCE_UPDATER)
  autoUpdater.autoDownload = true;
  // Se activa recién cuando la firma de la versión descargada resulta válida.
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = null;

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking', message: undefined }));
  autoUpdater.on('update-available', (info) => setStatus({ state: 'downloading', latest: info.version, percent: 0 }));
  autoUpdater.on('update-not-available', () => setStatus({ state: 'none', checkedAt: Date.now() }));
  autoUpdater.on('download-progress', (progress) => setStatus({ state: 'downloading', percent: Math.round(progress.percent || 0) }));
  autoUpdater.on('update-downloaded', async (info) => {
    setStatus({ state: 'downloading', latest: info.version, percent: 100 });
    if (await hasValidSignature(info)) {
      autoUpdater.autoInstallOnAppQuit = true;
      setStatus({ state: 'ready', latest: info.version, percent: 100 });
    } else {
      autoUpdater.autoInstallOnAppQuit = false;
      setStatus({ state: 'rejected', latest: info.version, message: 'Firma de la actualización inválida' });
    }
  });
  autoUpdater.on('error', (error) => {
    // Sin internet o sin versiones publicadas: no es un problema para quien usa el programa.
    setStatus({ state: 'error', message: String(error?.message || error).split('\n')[0].slice(0, 200) });
  });

  setTimeout(check, FIRST_CHECK_DELAY_MS);
  timer = setInterval(check, CHECK_EVERY_MS);
}

function check() {
  if (!autoUpdater || !status.enabled) return getStatus();
  if (status.state === 'checking' || status.state === 'downloading' || status.state === 'ready') return getStatus();
  autoUpdater.checkForUpdates().catch(() => { /* ya se informa por el evento 'error' */ });
  return getStatus();
}

function install() {
  if (autoUpdater && status.state === 'ready') {
    // isSilent=true: el instalador corre sin ventanas (probado a mano: con false pedía 2 clics
    // extra, "Siguiente" y "Terminar", que no tiene sentido mostrarle a nadie acá). isForceRunAfter
    // reabre la app sola al terminar.
    autoUpdater.quitAndInstall(true, true);
    return true;
  }
  return false;
}

function getStatus() {
  return { ...status };
}

function stop() {
  if (timer) clearInterval(timer);
}

module.exports = { init, check, install, getStatus, stop };
