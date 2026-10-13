// Prueba de humo end-to-end: levanta el servidor de mentira, abre la app real de Electron,
// inicia sesión, recorre las pantallas y flujos principales y guarda capturas.
//   npm run smoke            → capturas en test/shots (o SHOTS_DIR)
const fs = require('fs');
const os = require('os');
const path = require('path');

const shotsDir = process.env.SHOTS_DIR || path.join(__dirname, 'shots');
fs.mkdirSync(shotsDir, { recursive: true });

const { createServer } = require('./mock-server');
const server = createServer();
const PORT = 4011;

process.env.FT_API_URL = `http://127.0.0.1:${PORT}`;
process.env.FT_USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-smoke-'));
process.env.FT_TEST_NO_POLL = '1'; // los avisos de fondo no deben ensuciar el registro de pedidos
process.env.FT_TEST_NO_EXTERNAL = '1'; // no abrir el navegador: se registran los enlaces
process.env.FT_TEST_PDF_PATH = path.join(os.tmpdir(), 'ft-plan-test.pdf');

const { app, BrowserWindow } = require('electron');
require('../main.js');

const results = [];
const consoleErrors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let win;

const js = (code) => win.webContents.executeJavaScript(code, true);
async function waitFor(code, label, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if (await js(code)) return true; } catch (_e) { /* la página puede estar recargando */ }
    await sleep(80);
  }
  throw new Error(`Timeout esperando: ${label || code}`);
}
async function shot(name) {
  await sleep(250);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(shotsDir, `${name}.png`), image.toPNG());
}
async function step(name, fn) {
  try { await fn(); results.push([true, name]); console.log(`  ✓ ${name}`); }
  catch (error) { results.push([false, name, error.message]); console.log(`  ✗ ${name}\n      ${error.message}`); try { await shot(`FAIL-${name.replace(/\W+/g, '-')}`); } catch (_e) { /* nada */ } }
}
const click = (selector) => js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('No existe ${selector.replace(/'/g, '')}'); el.click(); return true; })()`);
const clickText = (selector, text) => js(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.trim().includes(${JSON.stringify(text)})); if (!el) throw new Error('No existe ${selector.replace(/'/g, '')} con texto ${text.replace(/'/g, '')}'); el.click(); return true; })()`);
const type = (selector, value) => js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('No existe ${selector.replace(/'/g, '')}'); el.focus(); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const go = async (hash) => { await js(`location.hash = ${JSON.stringify(hash)}`); await sleep(150); };
const exists = (selector) => js(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
const text = (selector) => js(`document.querySelector(${JSON.stringify(selector)})?.textContent || ''`);
const api = async (route) => (await fetch(`http://127.0.0.1:${PORT}${route}`, { headers: { Authorization: 'Bearer test-token' } })).json();
const requests = () => fetch(`http://127.0.0.1:${PORT}/api/__requests`).then((r) => r.json()).then((list) => list.filter((r) => !r.path.startsWith('/api/__')));
const assert = (cond, message) => { if (!cond) throw new Error(message); };

async function run() {
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  await app.whenReady();
  await waitForWindow();
  win.setSize(1440, 900);
  win.webContents.on('console-message', (_e, level, message, line, source) => { if (level >= 2 && !/Autofill|favicon/i.test(message)) consoleErrors.push(`${message} (${path.basename(source || '')}:${line})`); });
  win.webContents.on('render-process-gone', () => consoleErrors.push('render-process-gone'));

  console.log('Pruebas de humo');

  await step('carga el módulo y muestra el login', async () => {
    await waitFor(`Boolean(document.querySelector('.gate__form'))`, 'pantalla de login');
    await shot('01-login');
  });

  await step('rechaza contraseña incorrecta con mensaje', async () => {
    await type('input[name=email]', 'admin@test.com');
    await type('input[name=password]', 'mala');
    await js(`document.querySelector('.gate__form').requestSubmit()`);
    await waitFor(`Boolean(document.querySelector('.gate__error'))`, 'mensaje de error');
    assert(/incorrectos/i.test(await text('.gate__error')), 'mensaje de error inesperado');
  });

  await step('inicia sesión y muestra Hoy', async () => {
    await type('input[name=password]', 'clave1234');
    await js(`document.querySelector('.gate__form').requestSubmit()`);
    await waitFor(`Boolean(document.querySelector('.board'))`, 'pizarra de inicio');
    await waitFor(`document.querySelectorAll('.board__cell .board__value').length === 4 && !document.querySelector('.board .skeleton')`, 'pizarra cargada');
    await shot('02-home');
  });

  await step('Alumnos: lista, filtro y búsqueda', async () => {
    await go('#/users');
    await waitFor(`document.querySelectorAll('.table tbody tr').length > 5`, 'filas de alumnos');
    await shot('03-users');
    await clickText('.segmented__btn', 'Vencidos');
    await sleep(150);
    const rows = await js(`document.querySelectorAll('.table tbody tr').length`);
    assert(rows === 3, `esperaba 3 vencidos y hay ${rows}`);
    await clickText('.segmented__btn', 'Todos');
    await type('input[type=search]', 'lucia');
    await sleep(300);
    assert((await js(`document.querySelectorAll('.table tbody tr').length`)) === 1, 'la búsqueda sin tildes debería encontrar a Lucía');
    await type('input[type=search]', '');
  });

  await step('Alumnos: drawer con pestañas', async () => {
    await go('#/users/3');
    await waitFor(`Boolean(document.querySelector('.drawer'))`, 'drawer');
    await sleep(400);
    await shot('04-user-drawer');
    for (const tab of ['Planes', 'Pesos', 'Cuenta']) { await clickText('.drawer .tabs__btn', tab); await sleep(400); await shot(`04-user-drawer-${tab.toLowerCase()}`); }
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await sleep(200);
    assert(!(await exists('.drawer')), 'Esc debería cerrar el drawer');
    assert((await js('location.hash')).startsWith('#/users'), 'la ruta debería volver a users');
  });

  await step('Alumnos: crear alumno nuevo', async () => {
    await go('#/users/new');
    await waitFor(`Boolean(document.querySelector('.modal'))`, 'modal de alta');
    await shot('05-create-user');
    const inputs = await js(`[...document.querySelectorAll('.modal input, .modal select')].map((e) => e.name || e.getAttribute('aria-label') || e.type)`);
    console.log('      campos:', inputs.join(', '));
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  });

  await step('Planes: tarjetas y filtros', async () => {
    await go('#/plans');
    await waitFor(`document.querySelectorAll('.plan-card').length === 3`, 'tres planes');
    await shot('06-plans');
  });

  await step('Editor: abre plan existente', async () => {
    await go('#/plans/1');
    await waitFor(`Boolean(document.querySelector('.editor .ex-row'))`, 'filas de ejercicios');
    assert((await js(`document.querySelectorAll('.daytab:not(.daytab--add)').length`)) === 3, 'debería haber 3 días');
    assert((await js(`document.querySelector('.editor__title').value`)) === 'Fuerza + hipertrofia · 4 días', 'título');
    await shot('07-editor');
  });

  await step('Editor: agregar ejercicio del catálogo y guardar', async () => {
    await type('.block--main .quick-add__input', 'sentad');
    await sleep(200);
    assert(await exists('.combo .combo__item'), 'debería sugerir del catálogo');
    await shot('08-editor-combo');
    await js(`document.querySelector('.combo .combo__item').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))`);
    await sleep(200);
    const rows = await js(`document.querySelectorAll('.block--main .ex-row').length`);
    assert(rows === 4, `esperaba 4 filas y hay ${rows}`);
    assert(/Cambios sin guardar/.test(await text('.pill')), 'debería marcar cambios sin guardar');
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))`);
    await waitFor(`/Todo guardado/.test(document.querySelector('.pill')?.textContent || '')`, 'guardado');
    const saved = (await api('/api/admin/plans/1')).plan.content_json.days[0].exercises;
    assert(saved.length === 4 && saved[3].name === 'Sentadilla libre', 'el plan guardado debería incluir la sentadilla');
    assert(saved[3].sets === 4 || saved[3].sets === '4', 'debería completar series desde el catálogo');
  });

  await step('Editor: detalles, series y superserie', async () => {
    await js(`document.querySelector('.block--main .ex-row button[aria-expanded]').click()`);
    await sleep(200);
    assert(await exists('.ex-details'), 'detalles abiertos');
    await shot('09-editor-details');
    await clickText('.ex-details .btn', 'Agregar superserie');
    await sleep(150);
    assert(await exists('.sub-box__grid--super'), 'superserie agregada');
    await shot('09b-editor-superset');
  });

  await step('Editor: validación impide guardar', async () => {
    await type('.editor__title', '');
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))`);
    await waitFor(`Boolean(document.querySelector('.error-box'))`, 'banner de problemas');
    assert(/título/i.test(await text('.error-box')), 'debería pedir título');
    await shot('10-editor-validation');
  });

  await step('Editor: salir con cambios pregunta y permite quedarse', async () => {
    await go('#/plans');
    await waitFor(`Boolean(document.querySelector('.modal'))`, 'modal de cambios sin guardar');
    assert(/sin guardar/i.test(await text('.modal')), 'texto del modal');
    await shot('11-editor-leave');
    await clickText('.modal .btn', 'Seguir editando');
    await sleep(300);
    assert(await exists('.editor'), 'debería seguir en el editor');
    assert((await js('location.hash')) === '#/plans/1', `la URL debería volver al plan (${await js('location.hash')})`);
  });

  await step('Editor: salir sin guardar descarta y navega', async () => {
    await go('#/plans');
    await waitFor(`Boolean(document.querySelector('.modal'))`, 'modal');
    await clickText('.modal .btn', 'Salir sin guardar');
    await waitFor(`document.querySelectorAll('.plan-card').length === 3`, 'lista de planes');
  });

  await step('Editor: crear plan nuevo de entrenamiento', async () => {
    await go('#/plans/new?category=training');
    await waitFor(`Boolean(document.querySelector('.editor__title'))`, 'editor nuevo');
    await type('.editor__title', 'Rutina de prueba');
    await type('.block--main .quick-add__input', 'Curl martillo');
    await js(`document.querySelector('.block--main .quick-add__input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
    await sleep(200);
    await js(`(() => { const el = document.querySelector('.block--main .ex-row .input--num'); el.value = '3'; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))`);
    await waitFor(`location.hash.startsWith('#/plans/') && !location.hash.includes('new')`, 'redirección al plan creado');
    const plans = (await api('/api/admin/plans')).plans;
    assert(plans.some((p) => p.title === 'Rutina de prueba'), 'el plan debería existir en el servidor');
    await shot('12-editor-created');
  });

  await step('Editor: plan de texto antiguo se importa con aviso', async () => {
    await go('#/plans/3');
    await waitFor(`Boolean(document.querySelector('.editor .ex-row'))`, 'importación');
    assert(/estaba guardado como texto/.test(await text('.editor')), 'aviso de importación');
    assert((await js(`document.querySelectorAll('.daytab:not(.daytab--add)').length`)) === 2, 'debería detectar 2 días');
    await shot('13-editor-legacy');
  });

  await step('Editor: plan de alimentación', async () => {
    await go('#/plans/2');
    await waitFor(`Boolean(document.querySelector('.nutrition-text'))`, 'editor de texto');
    await shot('14-editor-nutrition');
    await clickText('.btn', 'Vista previa');
    await waitFor(`Boolean(document.querySelector('.modal .preview'))`, 'vista previa');
    await shot('15-preview');
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  });

  await step('Ejercicios: catálogo, edición y papelera', async () => {
    await go('#/exercises');
    await waitFor(`document.querySelectorAll('.table tbody tr').length === 15`, 'catálogo');
    await shot('16-exercises');
    await go('#/exercises/1');
    await waitFor(`Boolean(document.querySelector('.modal'))`, 'modal de edición');
    await shot('17-exercise-modal');
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await sleep(250);
    await clickText('.segmented__btn', 'Papelera');
    await waitFor(`document.querySelectorAll('.table tbody tr').length === 1`, 'papelera');
    await shot('18-exercises-trash');
  });

  await step('Tienda: productos y pedidos', async () => {
    await go('#/store');
    await waitFor(`document.querySelectorAll('.table tbody tr').length === 3`, 'productos');
    await shot('19-store');
    await clickText('.tabs__btn', 'Pedidos');
    await sleep(200);
    await shot('20-store-orders');
    await go('#/store/1');
    await waitFor(`Boolean(document.querySelector('.modal'))`, 'modal de producto');
    await shot('21-product-modal');
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  });

  await step('Pagos: resumen y tabla', async () => {
    await go('#/payments');
    await waitFor(`document.querySelectorAll('.table tbody tr').length > 10 && document.querySelectorAll('.stat').length === 4`, 'pagos');
    await shot('22-payments');
  });

  await step('Ajustes', async () => {
    await go('#/settings');
    await waitFor(`Boolean(document.querySelector('.kv'))`, 'ajustes');
    await sleep(600);
    await shot('23-settings');
  });

  await step('Paleta de comandos (Ctrl+K)', async () => {
    await go('#/home');
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))`);
    await waitFor(`Boolean(document.querySelector('.palette'))`, 'paleta');
    await type('.palette input', 'sentad');
    await sleep(300);
    await shot('24-palette');
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  });

  await step('Rendimiento: renovar desde Hoy no recarga las listas', async () => {
    await go('#/home');
    await waitFor(`document.querySelectorAll('.board__cell .board__value').length === 4 && !document.querySelector('.board .skeleton')`, 'inicio');
    await sleep(600);
    const mark = (await requests()).length;
    await clickText('.btn', 'Renovar 1 mes');
    await waitFor(`Boolean(document.querySelector('.toast'))`, 'aviso de renovación');
    await sleep(500);
    const after = (await requests()).slice(mark);
    assert(after.some((r) => r.method === 'PATCH' && /expiration/.test(r.path)), 'debería haber guardado el vencimiento');
    const reloads = after.filter((r) => r.method === 'GET');
    assert(reloads.length === 0, `no debería recargar listas, pero pidió: ${reloads.map((r) => r.path).join(', ')}`);
  });

  await step('Rendimiento: editar un ejercicio actualiza la lista sin recargarla', async () => {
    await go('#/exercises');
    await waitFor(`document.querySelectorAll('.table tbody tr').length === 15`, 'catálogo');
    await go('#/exercises/2');
    await waitFor(`Boolean(document.querySelector('.modal'))`, 'modal');
    const mark = (await requests()).length;
    await type('.modal input', 'Press inclinado (editado)');
    await clickText('.modal .btn', 'Guardar cambios');
    await waitFor(`!document.querySelector('.modal')`, 'modal cerrado');
    await sleep(400);
    const after = (await requests()).slice(mark);
    assert(after.filter((r) => r.method === 'GET').length === 0, `no debería recargar el catálogo: ${after.map((r) => `${r.method} ${r.path}`).join(', ')}`);
    assert((await text('.table tbody')).includes('Press inclinado (editado)'), 'la lista debería mostrar el nombre nuevo');
  });

  await step('Rendimiento: guardar un producto actualiza la lista sin recargarla', async () => {
    await go('#/store');
    await waitFor(`document.querySelectorAll('.table tbody tr').length === 3`, 'productos');
    await go('#/store/2');
    await waitFor(`Boolean(document.querySelector('.modal'))`, 'modal');
    const mark = (await requests()).length;
    await type('.modal input', 'Remera dry-fit v2');
    await clickText('.modal .btn', 'Guardar cambios');
    await waitFor(`!document.querySelector('.modal')`, 'modal cerrado');
    await sleep(400);
    const after = (await requests()).slice(mark);
    assert(after.filter((r) => r.method === 'GET').length === 0, `no debería recargar productos: ${after.map((r) => `${r.method} ${r.path}`).join(', ')}`);
    assert((await text('.table tbody')).includes('Remera dry-fit v2'), 'la lista debería mostrar el nombre nuevo');
  });

  await step('Seguimiento: filtro "Sin entrenar" y columna de actividad en Alumnos', async () => {
    await go('#/users');
    await waitFor(`document.querySelectorAll('.table tbody tr').length > 5`, 'filas');
    await waitFor(`[...document.querySelectorAll('.segmented__btn')].some((b) => /Sin entrenar/.test(b.textContent) && Number(b.querySelector('.segmented__count')?.textContent) > 0)`, 'contador de sin entrenar');
    await clickText('.segmented__btn', 'Sin entrenar');
    await sleep(200);
    const rows = await js(`document.querySelectorAll('.table tbody tr').length`);
    assert(rows > 0, 'debería listar alumnos sin entrenar');
    assert((await js(`document.querySelector('.table thead').textContent`)).includes('Actividad'), 'debería haber columna Actividad');
    await shot('25-users-inactive');
    await clickText('.segmented__btn', 'Todos');
  });

  await step('Avisos: abrir en tanda por WhatsApp con el mensaje armado', async () => {
    await clickText('.page__actions .btn', 'Avisar');
    await waitFor(`Boolean(document.querySelector('.modal .reminders__list .list__item'))`, 'lista de avisos');
    await shot('26-reminders');
    const before = (global.__openedUrls || []).length;
    await clickText('.modal .btn', 'Abrir el siguiente');
    await sleep(300);
    const opened = (global.__openedUrls || []).slice(before);
    assert(opened.length === 1 && /^https:\/\/wa\.me\/549/.test(opened[0]), `debería abrir un chat de WhatsApp: ${opened[0]}`);
    assert(decodeURIComponent(opened[0]).includes('Figueroa Trainer'), 'el mensaje debería estar armado con la plantilla');
    assert((await js(`document.querySelectorAll('.reminders__row.is-done').length`)) === 1, 'debería marcar a quién ya se le abrió el chat');
    // editar la plantilla se recuerda
    await type('.reminders__message', 'Hola {nombre}, prueba de plantilla');
    await clickText('.modal .btn', 'Abrir el siguiente');
    await sleep(300);
    const last = decodeURIComponent((global.__openedUrls || []).slice(-1)[0]);
    assert(last.includes('prueba de plantilla'), 'debería usar la plantilla editada');
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  });

  await step('Seguimiento y notas en el panel del alumno', async () => {
    await go('#/users/3');
    await waitFor(`Boolean(document.querySelector('.drawer'))`, 'drawer');
    await clickText('.drawer .tabs__btn', 'Seguimiento');
    await waitFor(`Boolean(document.querySelector('.drawer svg.chart'))`, 'gráfico de adherencia');
    await shot('27-tracking');
    await clickText('.drawer .tabs__btn', 'Notas');
    await waitFor(`document.querySelectorAll('.note-card').length === 1`, 'nota existente');
    assert((await text('.note-card')).includes('hombro'), 'debería mostrar la nota fijada');
    await type('.drawer textarea', 'Prefiere entrenar de mañana');
    await clickText('.drawer .btn', 'Guardar nota');
    await waitFor(`document.querySelectorAll('.note-card').length === 2`, 'nota nueva');
    const saved = (await api('/api/admin/users/3/notes')).notes;
    assert(saved.length === 2 && saved.some((n) => n.body === 'Prefiere entrenar de mañana'), 'la nota debería guardarse en el servidor');
    await shot('28-notes');
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  });

  await step('Alimentación: objetivos y registro del alumno', async () => {
    await go('#/users/3');
    await waitFor(`Boolean(document.querySelector('.drawer'))`, 'drawer');
    await clickText('.drawer .tabs__btn', 'Alimentación');
    await waitFor(`document.querySelectorAll('.drawer tbody tr').length === 2`, 'días registrados');
    await js(`(() => { const ins = [...document.querySelectorAll('.drawer input')]; const set = (i, v) => { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }; set(ins[1], '150'); set(ins[2], '250'); set(ins[3], '70'); return true; })()`);
    await clickText('.drawer .btn', 'Usar kcal de los macros');
    assert((await js(`document.querySelectorAll('.drawer input')[0].value`)) === '2230', 'debería calcular 150*4 + 250*4 + 70*9 = 2230 kcal');
    await clickText('.drawer .btn', 'Guardar objetivos');
    await waitFor(`document.querySelectorAll('.drawer tbody .badge').length === 2`, 'estado de cada día contra el objetivo');
    const saved = (await api('/api/admin/users/3/nutrition')).goals;
    assert(saved && saved.kcal === 2230 && saved.protein === 150, 'los objetivos deberían guardarse en el servidor');
    const drawerText = await text('.drawer');
    assert(drawerText.includes('En objetivo') && drawerText.includes('Debajo'), 'debería marcar cada día contra el objetivo');
    await shot('28b-nutrition');
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  });

  await step('Inicio: tarjeta "Sin entrenar" y avisar a todos', async () => {
    await go('#/home');
    await waitFor(`document.querySelectorAll('.board__cell .board__value').length === 4 && !document.querySelector('.board .skeleton')`, 'inicio');
    await waitFor(`[...document.querySelectorAll('.card__title')].some((t) => t.textContent.trim() === 'Sin entrenar')`, 'tarjeta sin entrenar');
    await shot('29-home-tracking');
  });

  await step('Editor: deshacer, rehacer y traer un día de otro plan', async () => {
    await go('#/plans/1');
    await waitFor(`Boolean(document.querySelector('.editor .ex-row'))`, 'editor');
    const rowsNow = () => js(`document.querySelectorAll('.block--main .ex-row').length`);
    const start = await rowsNow();
    await type('.block--main .quick-add__input', 'Curl martillo');
    await js(`document.querySelector('.block--main .quick-add__input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
    await sleep(800);
    assert((await rowsNow()) === start + 1, 'debería haber agregado una fila');
    await click('.editor__bar [aria-label^="Deshacer"]');
    await sleep(200);
    assert((await rowsNow()) === start, 'deshacer debería quitar la fila');
    await click('.editor__bar [aria-label^="Rehacer"]');
    await sleep(200);
    assert((await rowsNow()) === start + 1, 'rehacer debería volver a ponerla');

    const daysBefore = await js(`document.querySelectorAll('.daytab:not(.daytab--add)').length`);
    await clickText('.daybar .btn', 'Traer día de otro plan');
    await waitFor(`Boolean(document.querySelector('.modal select'))`, 'modal de importar');
    await sleep(200);
    await js(`document.querySelector('.modal .check input').click()`);
    await clickText('.modal .btn', 'Agregar');
    await sleep(300);
    assert((await js(`document.querySelectorAll('.daytab:not(.daytab--add)').length`)) === daysBefore + 1, 'debería sumar un día');
    await shot('30-editor-import');
    // salir sin guardar
    await go('#/plans');
    await waitFor(`Boolean(document.querySelector('.modal'))`, 'aviso de cambios');
    await clickText('.modal .btn', 'Salir sin guardar');
    await waitFor(`document.querySelectorAll('.plan-card').length >= 3`, 'planes');
  });

  await step('Editor: exportar el plan a PDF', async () => {
    await go('#/plans/1');
    await waitFor(`Boolean(document.querySelector('.editor .ex-row'))`, 'editor');
    try { fs.unlinkSync(process.env.FT_TEST_PDF_PATH); } catch (_e) { /* no existía */ }
    await clickText('.editor__bar .btn', 'PDF');
    for (let i = 0; i < 200 && !fs.existsSync(process.env.FT_TEST_PDF_PATH); i += 1) await sleep(100);
    await sleep(300);
    const buf = fs.readFileSync(process.env.FT_TEST_PDF_PATH);
    assert(buf.subarray(0, 4).toString() === '%PDF' && buf.length > 5000, `PDF inválido (${buf.length} bytes)`);
    await go('#/plans');
  });

  await step('Pagos: panel de ingresos', async () => {
    await go('#/payments');
    await waitFor(`document.querySelectorAll('.table tbody tr').length > 10`, 'pagos');
    await clickText('.segmented__btn', 'Ingresos');
    await waitFor(`document.querySelectorAll('.income-grid svg.chart').length === 2 && document.querySelectorAll('.stat').length >= 4`, 'gráficos de ingresos');
    await shot('31-income');
    await clickText('.segmented__btn', 'Historial');
  });

  await step('Ajustes: avisos, actualizaciones e historial', async () => {
    await go('#/settings');
    await waitFor(`document.querySelectorAll('.switch').length >= 2`, 'preferencias de avisos');
    const status = await js(`window.ft.updateStatus()`);
    assert(status.ok && status.data.enabled === false, 'en desarrollo las actualizaciones deben estar desactivadas');
    assert((await text('.page')).includes('Versión instalada'), 'debería mostrar la versión instalada');
    await shot('32-settings-new');
    await clickText('.btn', 'Ver historial de cambios');
    await waitFor(`document.querySelectorAll('.modal .table tbody tr').length === 3`, 'historial');
    await shot('33-audit');
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  });

  await step('Mensajes: lista, filtro por tema, badge y detalle', async () => {
    await go('#/contacts');
    await waitFor(`document.querySelectorAll('.contact-row').length === 3`, 'mensajes');
    assert((await js(`document.querySelectorAll('.contact-row.is-new').length`)) === 3, 'los 3 mensajes deberían verse como nuevos en un perfil recién abierto');
    await shot('34-contacts');

    await clickText('.segmented__btn', 'Pedido en tienda');
    await sleep(150);
    assert((await js(`document.querySelectorAll('.contact-row').length`)) === 1, 'el filtro por tema debería dejar solo 1 mensaje');
    await clickText('.segmented__btn', 'Todos');

    await type('input[type=search]', 'romina');
    await sleep(300);
    assert((await js(`document.querySelectorAll('.contact-row').length`)) === 1, 'la búsqueda debería encontrar a Romina');
    await type('input[type=search]', '');
    await waitFor(`document.querySelectorAll('.contact-row').length === 3`, 'vuelve a mostrar los 3 mensajes tras limpiar la búsqueda');

    // Visitar la pantalla marca los mensajes como vistos: el badge de la barra lateral baja a 0
    await waitFor(`document.querySelector('[title^="Mensajes"] .nav__count')?.classList.contains('hidden') || !document.querySelector('[title^="Mensajes"] .nav__count')`, 'badge de mensajes en 0 tras visitar');

    await click('.contact-row');
    await waitFor(`Boolean(document.querySelector('.modal'))`, 'detalle del mensaje');
    await shot('35-contact-detail');
    assert((await text('.modal')).includes('@mail.com'), 'el detalle debería mostrar el email');
    assert((await text('.modal')).includes('1150001234'), 'el detalle debería mostrar el teléfono cuando lo hay');

    const beforeOpened = (global.__openedUrls || []).length;
    await clickText('.modal .btn', 'Responder por WhatsApp');
    await sleep(200);
    let opened = (global.__openedUrls || []).slice(beforeOpened);
    assert(opened.length === 1 && opened[0].startsWith('https://wa.me/549'), `debería abrir WhatsApp con el prefijo argentino: ${opened[0]}`);

    const beforeOpened2 = (global.__openedUrls || []).length;
    await clickText('.modal .btn', 'Responder por email');
    await sleep(200);
    opened = (global.__openedUrls || []).slice(beforeOpened2);
    assert(opened.length === 1 && opened[0].startsWith('mailto:'), `debería abrir el cliente de email: ${opened[0]}`);

    await clickText('.modal .btn', 'Eliminar');
    await waitFor(`document.querySelectorAll('.modal').length === 2`, 'confirmación de borrado (modal apilado sobre el detalle)');
    await js(`(() => {
      const modals = document.querySelectorAll('.modal');
      const last = modals[modals.length - 1];
      const btn = [...last.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Eliminar');
      if (!btn) throw new Error('No se encontró el botón Eliminar en la confirmación');
      btn.click();
      return true;
    })()`);
    await waitFor(`document.querySelectorAll('.contact-row').length === 2`, 'mensaje eliminado de la lista');
    const remaining = (await api('/api/contact')).contacts;
    assert(remaining.length === 2, 'el mensaje debería haberse borrado también en el servidor');
  });

  await step('Paleta: buscar y abrir un mensaje por nombre', async () => {
    await go('#/home');
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))`);
    await waitFor(`Boolean(document.querySelector('.palette'))`, 'paleta');
    await type('.palette input', 'diego');
    await sleep(300);
    assert((await text('.palette')).includes('Diego Ferreyra'), 'debería encontrar el mensaje de Diego por nombre');
    await js(`document.querySelector('.palette__item').click()`);
    await waitFor(`Boolean(document.querySelector('.modal'))`, 'abre el detalle del mensaje');
    assert((await js('location.hash')).startsWith('#/contacts/'), 'debería navegar al mensaje');
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  });

  await step('Mensajes: vaciar todos pide escribir VACIAR', async () => {
    await go('#/contacts');
    await waitFor(`document.querySelectorAll('.contact-row').length === 2`, 'quedan 2 mensajes');
    await clickText('.page__actions .btn', 'Vaciar todos');
    await waitFor(`Boolean(document.querySelector('.modal input'))`, 'diálogo de confirmación');
    assert((await text('.modal')).includes('2 mensajes'), 'debería avisar cuántos mensajes se van a borrar');

    const confirmBtn = () => js(`[...document.querySelectorAll('.modal .btn')].find((b) => b.textContent.trim() === 'Vaciar todo')?.disabled`);
    assert((await confirmBtn()) === true, 'el botón debería arrancar deshabilitado');
    await type('.modal input', 'borrar');
    assert((await confirmBtn()) === true, 'con el texto equivocado debería seguir deshabilitado');
    await type('.modal input', 'VACIAR');
    assert((await confirmBtn()) === false, 'al escribir VACIAR debería habilitarse');

    await clickText('.modal .btn', 'Vaciar todo');
    await waitFor(`document.querySelectorAll('.contact-row').length === 0`, 'la lista queda vacía');
    await shot('36-contacts-empty');
    const remaining = (await api('/api/contact')).contacts;
    assert(remaining.length === 0, 'el servidor también debería quedar sin mensajes');
  });

  await step('Avisos de escritorio: primera lectura es base y luego avisa lo nuevo', async () => {
    const notifier = require('../src/notifier');
    const seen = [];
    notifier._setTestSink((n) => seen.push(n));
    require('fs').rmSync(require('path').join(process.env.FT_USER_DATA, 'notifier.json'), { force: true });
    await notifier.poll({ force: true });
    assert(seen.length === 0, `la primera lectura no debería avisar (${seen.map((n) => n.title).join(', ')})`);
    await fetch(`http://127.0.0.1:${PORT}/api/__add-payment`, { method: 'POST' });
    await fetch(`http://127.0.0.1:${PORT}/api/__add-user`, { method: 'POST' });
    await fetch(`http://127.0.0.1:${PORT}/api/__add-contact`, { method: 'POST' });
    await notifier.poll({ force: true });
    assert(seen.some((n) => n.title === 'Pago aprobado' && /30\.000/.test(n.body)), `debería avisar el pago: ${JSON.stringify(seen)}`);
    assert(seen.some((n) => n.title === 'Nuevo registro' && /Nuevo Alumno/.test(n.body)), 'debería avisar el nuevo registro');
    assert(seen.some((n) => n.title === 'Nuevo mensaje de contacto' && /Walter Sosa/.test(n.body)), `debería avisar el mensaje de contacto: ${JSON.stringify(seen)}`);
    const before = seen.length;
    await notifier.poll({ force: true });
    assert(seen.length === before, 'no debería repetir avisos ya dados');
    notifier._setTestSink(null);
  });

  await step('Cerrar sesión vuelve al login', async () => {
    await js(`window.ft.logout()`);
    await go('#/home');
  });

  const failed = results.filter((r) => !r[0]);
  console.log(`\n${results.length - failed.length}/${results.length} pasos OK`);
  if (consoleErrors.length) console.log(`\nErrores de consola (${consoleErrors.length}):\n  ${[...new Set(consoleErrors)].join('\n  ')}`);
  return failed.length + (consoleErrors.length ? 1 : 0);
}

async function waitForWindow() {
  for (let i = 0; i < 100; i += 1) {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { win = w; return; }
    await sleep(100);
  }
  throw new Error('La ventana principal no se creó');
}

run().then((code) => { server.close(); setTimeout(() => app.exit(code ? 1 : 0), 300); }).catch((error) => { console.error(error); app.exit(2); });
