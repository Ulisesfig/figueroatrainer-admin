// Genera build/icon.png (512×512) a partir de tools/icon.html.  npm run icon
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, webPreferences: { offscreen: false } });
  await win.loadFile(path.join(__dirname, 'icon.html'));
  await new Promise((r) => setTimeout(r, 600)); // deja cargar la tipografía
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  fs.mkdirSync(path.join(__dirname, '..', 'build'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.png'), image.toPNG());
  console.log('Ícono generado en build/icon.png');
  app.quit();
});
