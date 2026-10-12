// Figueroa Trainer Admin — proceso principal de Electron.
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, Menu, Tray, nativeImage, dialog, ipcMain, shell, clipboard } = require('electron');

// Carpeta de datos aislada para pruebas automáticas (no toca la sesión real).
if (process.env.FT_USER_DATA) app.setPath('userData', process.env.FT_USER_DATA);

const storage = require('./src/storage');
const api = require('./src/api');
const notifier = require('./src/notifier');
const updater = require('./src/updater');
const pdf = require('./src/pdf');

// Necesario para que las notificaciones de Windows muestren el nombre y el ícono de la app.
app.setAppUserModelId('com.figueroatrainer.admin');

const isDev = !app.isPackaged;
const ALLOWED_EXTERNAL = /^(https?:|mailto:|tel:)/i;

let mainWindow = null;
let tray = null;
let isQuitting = false;

// ─── Ventana ────────────────────────────────────────────────────────────────

function createWindow() {
  const saved = storage.getSettings().window;

  mainWindow = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#0c1730',
    title: 'Figueroa Trainer Admin',
    icon: path.join(__dirname, 'build', 'icon.png'),
    // Barra de título integrada: los botones de Windows quedan sobre nuestra
    // propia barra superior en vez de una franja blanca aparte.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0c1730', symbolColor: '#e9e6dc', height: 44 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  if (saved.maximized) mainWindow.maximize();

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Nada de navegar la ventana a sitios externos ni abrir ventanas nuevas:
  // los links externos salen al navegador del sistema.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (ALLOWED_EXTERNAL.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (ALLOWED_EXTERNAL.test(url)) shell.openExternal(url);
    }
  });

  // El editor de planes marca "cambios sin guardar" con onbeforeunload: al cerrar la
  // ventana o recargar (F5) se pregunta antes de perder trabajo.
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['Seguir editando', 'Salir sin guardar'],
      defaultId: 0,
      cancelId: 0,
      title: 'Cambios sin guardar',
      message: 'Tenés cambios sin guardar en el editor.',
      detail: 'Si salís ahora se pierden (queda un borrador local que podés recuperar al volver a abrir el plan).',
    });
    if (choice === 1) event.preventDefault();
  });

  let saveTimer = null;
  const persistBounds = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const maximized = mainWindow.isMaximized();
      const bounds = maximized ? storage.getSettings().window : mainWindow.getBounds();
      storage.setSettings({ window: { ...bounds, maximized } });
    }, 400);
  };
  mainWindow.on('resize', persistBounds);
  mainWindow.on('move', persistBounds);
  mainWindow.on('maximize', persistBounds);
  mainWindow.on('unmaximize', persistBounds);

  // Con la opción activada, cerrar la ventana la manda a la bandeja (al lado del reloj) para
  // seguir recibiendo avisos. "Salir" del menú o de la bandeja cierra de verdad.
  mainWindow.on('close', (event) => {
    if (isQuitting || !tray || storage.getSettings().runInBackground === false) return;
    event.preventDefault();
    mainWindow.hide();
    if (!storage.getSettings().trayHintShown) {
      storage.setSettings({ trayHintShown: true });
      const { Notification } = require('electron');
      if (Notification.isSupported()) new Notification({ title: 'Figueroa Trainer Admin sigue abierto', body: 'Quedó en la bandeja para avisarte de pagos y vencimientos. Para cerrarlo del todo, usá clic derecho en el ícono → Salir.' }).show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  try {
    const image = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 20, height: 20 });
    tray = new Tray(image);
  } catch (error) {
    console.error('No se pudo crear el ícono de la bandeja:', error.message);
    tray = null;
    return;
  }
  tray.setToolTip('Figueroa Trainer Admin');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Figueroa Trainer Admin', click: showWindow },
    { label: 'Buscar actualizaciones', click: () => updater.check() },
    { type: 'separator' },
    { label: 'Salir', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', showWindow);
}

function sendToWindow(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

// ─── Menú (en español) ──────────────────────────────────────────────────────

function buildMenu() {
  const go = (view) => () => sendToWindow('menu-action', { type: 'navigate', view });
  const template = [
    {
      label: 'Archivo',
      submenu: [
        { label: 'Cerrar sesión', click: () => sendToWindow('menu-action', { type: 'logout' }) },
        { type: 'separator' },
        { role: 'quit', label: 'Salir' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        // Deshacer/rehacer los resuelve la interfaz: dentro de un campo de texto deshace lo escrito y,
        // en el editor de planes, deshace el último cambio del plan.
        { label: 'Deshacer', accelerator: 'CmdOrCtrl+Z', click: () => sendToWindow('menu-action', { type: 'undo' }) },
        { label: 'Rehacer', accelerator: 'CmdOrCtrl+Shift+Z', click: () => sendToWindow('menu-action', { type: 'redo' }) },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' },
      ],
    },
    {
      label: 'Ir a',
      submenu: [
        { label: 'Hoy', accelerator: 'CmdOrCtrl+1', click: go('home') },
        { label: 'Alumnos', accelerator: 'CmdOrCtrl+2', click: go('users') },
        { label: 'Planes', accelerator: 'CmdOrCtrl+3', click: go('plans') },
        { label: 'Ejercicios', accelerator: 'CmdOrCtrl+4', click: go('exercises') },
        { label: 'Tienda', accelerator: 'CmdOrCtrl+5', click: go('store') },
        { label: 'Pagos', accelerator: 'CmdOrCtrl+6', click: go('payments') },
        { label: 'Mensajes', accelerator: 'CmdOrCtrl+7', click: go('contacts') },
        { label: 'Ajustes', accelerator: 'CmdOrCtrl+,', click: go('settings') },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Actualizar datos', accelerator: 'F5', click: () => sendToWindow('menu-action', { type: 'refresh' }) },
        { type: 'separator' },
        { role: 'zoomIn', label: 'Acercar' },
        { role: 'zoomOut', label: 'Alejar' },
        { role: 'resetZoom', label: 'Tamaño normal' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
        ...(isDev ? [{ type: 'separator' }, { role: 'toggleDevTools', label: 'Herramientas de desarrollo' }] : []),
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        { label: 'Atajos de teclado', accelerator: 'CmdOrCtrl+/', click: () => sendToWindow('menu-action', { type: 'shortcuts' }) },
        { label: 'Abrir el sitio web', click: () => shell.openExternal('https://figueroatrainer.com') },
        { type: 'separator' },
        {
          label: 'Acerca de Figueroa Trainer Admin',
          click: () =>
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Figueroa Trainer Admin',
              message: 'Figueroa Trainer Admin',
              detail: `Versión ${app.getVersion()}\nElectron ${process.versions.electron}\nPrograma de escritorio para administrar alumnos, planes, ejercicios y tienda.`,
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── IPC ────────────────────────────────────────────────────────────────────

// Solo aceptamos mensajes de nuestra propia ventana (páginas file:// de la app).
function trusted(event) {
  const url = event.senderFrame?.url || '';
  return url.startsWith('file://');
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!trusted(event)) return { ok: false, error: { message: 'Origen no autorizado' } };
    try {
      return await fn(...args);
    } catch (error) {
      console.error(`[ipc ${channel}]`, error);
      return { ok: false, error: { message: error?.message || 'Error interno' } };
    }
  });
}

function registerIpc() {
  handle('api:request', (req) => api.request(req || {}));

  handle('auth:login', async (credentials) => {
    const result = await api.login(credentials || {});
    if (result.ok) storage.setSettings({ lastEmail: String(credentials?.email || '').trim().toLowerCase() });
    return result;
  });

  handle('auth:logout', async () => {
    await api.logout();
    notifier.reset();
    return { ok: true, data: {} };
  });

  handle('session:get', async () => {
    const session = api.getSession();
    const settings = storage.getSettings();
    return {
      ok: true,
      data: {
        hasSession: Boolean(session?.token),
        user: session?.user || null,
        apiUrl: settings.apiUrl,
        lastEmail: settings.lastEmail,
        sidebarCollapsed: settings.sidebarCollapsed,
      },
    };
  });

  handle('session:verify', () => api.verifySession());

  handle('settings:set', (patch) => {
    const allowed = {};
    if (typeof patch?.apiUrl === 'string') {
      try {
        const url = new URL(patch.apiUrl.trim());
        if (!/^https?:$/.test(url.protocol)) throw new Error('protocolo');
        allowed.apiUrl = url.origin + url.pathname.replace(/\/+$/, '');
      } catch (_error) {
        return { ok: false, error: { message: 'La dirección del servidor no es válida (ej. https://mi-servidor.com).' } };
      }
    }
    if (typeof patch?.sidebarCollapsed === 'boolean') allowed.sidebarCollapsed = patch.sidebarCollapsed;
    const next = storage.setSettings(allowed);
    return { ok: true, data: { apiUrl: next.apiUrl } };
  });

  handle('app:info', () => ({
    ok: true,
    data: {
      version: app.getVersion(),
      electron: process.versions.electron,
      platform: process.platform,
      encrypted: require('electron').safeStorage.isEncryptionAvailable(),
      dev: isDev,
    },
  }));

  handle('shell:openExternal', (url) => {
    if (typeof url !== 'string' || !ALLOWED_EXTERNAL.test(url)) {
      return { ok: false, error: { message: 'Enlace no permitido' } };
    }
    // Pruebas automáticas: no abrir el navegador, solo registrar el enlace.
    if (process.env.FT_TEST_NO_EXTERNAL) { (global.__openedUrls = global.__openedUrls || []).push(url); return { ok: true, data: {} }; }
    shell.openExternal(url);
    return { ok: true, data: {} };
  });

  handle('clipboard:write', (text) => {
    clipboard.writeText(String(text ?? ''));
    return { ok: true, data: {} };
  });

  // Guarda un CSV (con BOM UTF-8 para que Excel respete tildes y ñ).
  handle('file:saveCsv', async ({ defaultName, content }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Guardar como CSV',
      defaultPath: path.join(app.getPath('documents'), defaultName || 'exportacion.csv'),
      filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }],
    });
    if (result.canceled || !result.filePath) return { ok: true, data: { canceled: true } };
    fs.writeFileSync(result.filePath, `﻿${content}`, 'utf8');
    return { ok: true, data: { canceled: false, filePath: result.filePath } };
  });

  // Preferencias de la app (avisos y segundo plano)
  handle('prefs:get', () => {
    const s = storage.getSettings();
    return { ok: true, data: { notifications: s.notifications !== false, runInBackground: s.runInBackground !== false } };
  });

  handle('prefs:set', (patch) => {
    const allowed = {};
    if (typeof patch?.notifications === 'boolean') allowed.notifications = patch.notifications;
    if (typeof patch?.runInBackground === 'boolean') allowed.runInBackground = patch.runInBackground;
    const next = storage.setSettings(allowed);
    return { ok: true, data: { notifications: next.notifications !== false, runInBackground: next.runInBackground !== false } };
  });

  handle('notify:test', () => {
    notifier.sendTest();
    return { ok: true, data: {} };
  });

  // Exportar a PDF
  handle('file:savePdf', (payload) => pdf.exportPdf(mainWindow, payload || {}));

  // Actualizaciones
  handle('update:status', () => ({ ok: true, data: updater.getStatus() }));
  handle('update:check', () => ({ ok: true, data: updater.check() }));
  handle('update:install', () => ({ ok: true, data: { started: updater.install() } }));

  handle('file:reveal', (filePath) => {
    if (typeof filePath === 'string') shell.showItemInFolder(filePath);
    return { ok: true, data: {} };
  });
}

// ─── Ciclo de vida ──────────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(() => {
    api.init({ sessionExpiredHandler: () => sendToWindow('session-expired') });
    registerIpc();
    buildMenu();
    createWindow();
    createTray();

    updater.init({ onStatus: (status) => sendToWindow('update-status', status) });
    notifier.start({
      onOpenNotification: (hash) => {
        showWindow();
        if (hash) sendToWindow('menu-action', { type: 'hash', hash });
      },
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', () => { isQuitting = true; });

  app.on('window-all-closed', () => {
    // Con la bandeja activa la app sigue viva aunque no haya ventana.
    if (process.platform !== 'darwin' && (!tray || isQuitting)) app.quit();
  });
}

module.exports = { getWindow: () => mainWindow };
