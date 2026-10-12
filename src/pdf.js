// Exportar un plan a PDF: la interfaz manda el contenido ya armado (HTML generado desde
// nodos de texto, sin datos sin escapar) y acá se imprime en una ventana oculta y sin scripts.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, dialog } = require('electron');

const CSS = `
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #14213d; font-size: 11pt; line-height: 1.4; margin: 0; }
  .doc-head { display: flex; align-items: center; gap: 16px; padding-bottom: 12px; border-bottom: 3px solid #b8a143; margin-bottom: 14px; }
  .doc-head img { height: 44px; }
  .doc-title { font-size: 20pt; font-weight: 700; text-transform: uppercase; letter-spacing: .02em; margin: 0; }
  .doc-sub { color: #55607a; margin: 2px 0 0; font-size: 10pt; }
  h2 { font-size: 13pt; text-transform: uppercase; letter-spacing: .06em; margin: 18px 0 8px; padding: 5px 10px; background: #14213d; color: #f4efe0; border-radius: 4px; break-after: avoid; }
  h3 { font-size: 10pt; text-transform: uppercase; letter-spacing: .08em; color: #8a7a2b; margin: 12px 0 4px; break-after: avoid; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .06em; color: #55607a; padding: 4px 6px; border-bottom: 1.5px solid #c9cfdc; }
  td { padding: 6px; border-bottom: 1px solid #e3e6ee; vertical-align: top; }
  tr { break-inside: avoid; }
  .ex-name { font-weight: 600; }
  .note { color: #55607a; font-size: 9.5pt; margin-top: 2px; }
  .sub { color: #3d4a68; font-size: 9.5pt; margin-top: 2px; }
  .nowrap { white-space: nowrap; }
  .text { white-space: pre-wrap; font-size: 11pt; line-height: 1.6; }
  .footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #c9cfdc; color: #7b849c; font-size: 8.5pt; text-align: center; }
`;

function wrapDocument(title, bodyHtml) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file: data:; style-src 'unsafe-inline'">
<title>${String(title).replace(/[<>&"]/g, '')}</title><style>${CSS}</style></head><body>${bodyHtml}</body></html>`;
}

async function exportPdf(parent, { title, bodyHtml, defaultName }) {
  if (typeof bodyHtml !== 'string' || !bodyHtml.trim() || bodyHtml.length > 5_000_000) {
    return { ok: false, error: { message: 'No hay contenido para exportar.' } };
  }
  const logoUrl = pathToFileURL(path.join(__dirname, '..', 'renderer', 'assets', 'logo.png')).href;
  const documentHtml = wrapDocument(title || 'Plan', bodyHtml.replace(/__LOGO__/g, logoUrl));

  const tmpFile = path.join(os.tmpdir(), `ft-plan-${Date.now()}.html`);
  fs.writeFileSync(tmpFile, documentHtml, 'utf8');
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false, contextIsolation: true } });
  try {
    await win.loadFile(tmpFile);
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true });

    const safeName = String(defaultName || 'plan').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'plan';
    // Pruebas automáticas: guardar directo en la ruta indicada, sin diálogo.
    if (process.env.FT_TEST_PDF_PATH) {
      fs.writeFileSync(process.env.FT_TEST_PDF_PATH, pdf);
      return { ok: true, data: { canceled: false, filePath: process.env.FT_TEST_PDF_PATH } };
    }
    const target = await dialog.showSaveDialog(parent, {
      title: 'Guardar plan en PDF',
      defaultPath: path.join(app.getPath('documents'), `${safeName}.pdf`),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (target.canceled || !target.filePath) return { ok: true, data: { canceled: true } };
    fs.writeFileSync(target.filePath, pdf);
    return { ok: true, data: { canceled: false, filePath: target.filePath } };
  } catch (error) {
    return { ok: false, error: { message: `No se pudo generar el PDF: ${error.message}` } };
  } finally {
    win.destroy();
    fs.unlink(tmpFile, () => {});
  }
}

module.exports = { exportPdf };
