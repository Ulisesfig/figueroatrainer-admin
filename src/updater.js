// Actualizaciones automáticas (electron-updater + feed propio en /updates del backend).
// La app busca versiones nuevas al abrir y cada 4 horas, las descarga en segundo plano y
// avisa cuando están listas para instalarse (también se instalan solas al cerrar la app).
const { app } = require('electron');

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

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = null;

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking', message: undefined }));
  autoUpdater.on('update-available', (info) => setStatus({ state: 'downloading', latest: info.version, percent: 0 }));
  autoUpdater.on('update-not-available', () => setStatus({ state: 'none', checkedAt: Date.now() }));
  autoUpdater.on('download-progress', (progress) => setStatus({ state: 'downloading', percent: Math.round(progress.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => setStatus({ state: 'ready', latest: info.version, percent: 100 }));
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
