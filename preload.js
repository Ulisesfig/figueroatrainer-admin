// Puente seguro entre la interfaz y el proceso principal. La interfaz nunca ve
// el token ni tiene acceso a Node: solo puede pedir estas operaciones.
const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('ft', {
  api: (request) => ipcRenderer.invoke('api:request', request),
  login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
  logout: () => ipcRenderer.invoke('auth:logout'),
  session: () => ipcRenderer.invoke('session:get'),
  verifySession: () => ipcRenderer.invoke('session:verify'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  appInfo: () => ipcRenderer.invoke('app:info'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  saveCsv: (payload) => ipcRenderer.invoke('file:saveCsv', payload),
  reveal: (filePath) => ipcRenderer.invoke('file:reveal', filePath),
  savePdf: (payload) => ipcRenderer.invoke('file:savePdf', payload),
  getPrefs: () => ipcRenderer.invoke('prefs:get'),
  setPrefs: (patch) => ipcRenderer.invoke('prefs:set', patch),
  testNotification: () => ipcRenderer.invoke('notify:test'),
  updateStatus: () => ipcRenderer.invoke('update:status'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (callback) => subscribe('update-status', callback),
  onSessionExpired: (callback) => subscribe('session-expired', callback),
  onMenu: (callback) => subscribe('menu-action', callback),
  platform: process.platform,
});
