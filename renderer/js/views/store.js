// Tienda: habilitar/deshabilitar, productos (con imágenes, stock y estado) y pedidos.
import { h, mount } from '../lib/h.js';
import { icon } from '../lib/icons.js';
import { api, errorMessage } from '../lib/api.js';
import { button, badge, field, textInput, textArea, selectInput, switchInput, emptyState, errorBox, loadingBlock, notify, openModal, confirmDialog, tabs, withBusy, markInvalid } from '../lib/ui.js';
import { loadProducts, loadOrders, loadStoreEnabled, invalidate, upsertCached, removeCached, patchCached, onInvalidate } from '../lib/data.js';
import { orderStatusBadge } from '../lib/status.js';
import { formatMoney, formatDateTime, fullName, normalize, debounce, plural, timeAgo } from '../lib/format.js';

export const CATEGORIES = [
  { value: 'suplementacion', label: 'Suplementación' },
  { value: 'accesorios', label: 'Accesorios' },
  { value: 'ropa', label: 'Ropa' },
  { value: 'ebooks', label: 'Ebooks' },
  { value: 'otro', label: 'Otro' },
];
const categoryLabel = (v) => CATEGORIES.find((c) => c.value === v)?.label || 'Otro';
const MAX_IMAGES = 8;

function productThumb(product, size = 44) {
  const src = product.images?.[0];
  return h('span', { class: 'product-thumb', style: { width: `${size}px`, height: `${size}px` } }, src ? h('img', { src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onError: (e) => e.currentTarget.remove() }) : icon('image', Math.round(size / 2.2)));
}

// ─── Alta / edición de producto ─────────────────────────────────────────────

function openProductModal({ product = null, onSaved, onClosed }) {
  const isEdit = Boolean(product);
  const name = textInput({ value: product?.name || '', placeholder: 'Ej. Proteína whey 1 kg', maxlength: 140, 'aria-label': 'Nombre' });
  const price = textInput({ type: 'number', min: 0, step: '0.01', value: product?.price ?? '', placeholder: '0', 'aria-label': 'Precio' });
  const stock = textInput({ type: 'number', min: 0, step: 1, value: product?.stock ?? '', placeholder: 'Sin límite', 'aria-label': 'Stock' });
  const category = selectInput(CATEGORIES, product?.category || 'otro', { 'aria-label': 'Categoría' });
  const description = textArea({ rows: 4, value: product?.description || '', placeholder: 'Qué es, qué incluye y cómo se usa', 'aria-label': 'Descripción' });
  const active = switchInput({ checked: product ? Boolean(product.active) : true, label: 'Visible en la tienda' });
  let images = [...(product?.images || [])];
  const imagesHost = h('div', { class: 'image-list' });
  const newImage = textInput({ type: 'url', placeholder: 'Pegá el link de una imagen (https://…) y presioná Enter', className: 'input--mono', 'aria-label': 'Agregar imagen por link' });
  const errorHost = h('div');

  function paintImages() {
    mount(imagesHost, ...images.map((src, i) => h('div', { class: 'image-item' },
      h('img', { src, alt: `Imagen ${i + 1}`, referrerpolicy: 'no-referrer', onError: (e) => e.currentTarget.classList.add('is-broken') }),
      i === 0 ? h('span', { class: 'image-item__main' }, 'Principal') : null,
      h('div', { class: 'image-item__actions' },
        i > 0 ? button('Hacer principal', { size: 'sm', variant: 'secondary', iconOnly: true, icon: 'arrow-up', onClick: () => { images.unshift(images.splice(i, 1)[0]); paintImages(); } }) : null,
        button('Quitar imagen', { size: 'sm', variant: 'secondary', iconOnly: true, icon: 'x', onClick: () => { images.splice(i, 1); paintImages(); } })))),
    images.length ? null : h('p', { class: 'faint', style: { margin: 0 } }, 'Sin imágenes todavía.'));
  }
  paintImages();

  function addImage() {
    const value = newImage.value.trim();
    if (!value) return;
    if (!/^https?:\/\/.+/i.test(value)) { markInvalid(newImage); notify.warn('El link de la imagen debe empezar con http:// o https://'); return; }
    if (images.length >= MAX_IMAGES) { notify.warn(`Podés cargar hasta ${MAX_IMAGES} imágenes.`); return; }
    if (images.includes(value)) { notify.info('Esa imagen ya está cargada.'); return; }
    markInvalid(newImage, false);
    images.push(value); newImage.value = ''; paintImages();
  }
  newImage.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addImage(); } });

  const saveBtn = button(isEdit ? 'Guardar cambios' : 'Crear producto', { variant: 'primary', icon: 'check' });

  const body = h('form', { class: 'col gap-16', novalidate: true },
    h('div', { class: 'grid-form' }, field('Nombre', name), field('Categoría', category)),
    h('div', { class: 'grid-form' }, field('Precio (ARS)', price), field('Stock', stock, { hint: 'Dejalo vacío si no querés limitar las unidades.' })),
    field('Descripción', description),
    field(`Imágenes (${images.length}/${MAX_IMAGES})`, h('div', { class: 'col', style: { gap: '10px' } }, imagesHost, h('div', { class: 'row' }, h('div', { class: 'grow' }, newImage), button('Agregar', { icon: 'plus', onClick: addImage })))),
    active,
    errorHost);

  async function submit() {
    mount(errorHost);
    [name, price, stock].forEach((c) => markInvalid(c, false));
    const problems = [];
    if (!name.value.trim()) { markInvalid(name); problems.push('El nombre es obligatorio.'); }
    if (price.value === '' || !(Number(price.value) >= 0)) { markInvalid(price); problems.push('Ingresá un precio válido (0 o más).'); }
    if (stock.value !== '' && !(Number.isInteger(Number(stock.value)) && Number(stock.value) >= 0)) { markInvalid(stock); problems.push('El stock debe ser un número entero de 0 o más.'); }
    if (problems.length) { mount(errorHost, errorBox(problems.join(' '))); (modal.el.querySelector('.is-invalid') || name).focus(); return; }
    const payload = {
      name: name.value.trim(),
      price: Number(price.value),
      category: category.value,
      description: description.value.trim() || null,
      images,
      stock: stock.value === '' ? null : Number(stock.value),
      active: active.querySelector('input').checked,
    };
    try {
      const res = isEdit ? await api.patch(`/api/admin/store/products/${product.id}`, payload) : await api.post('/api/admin/store/products', payload);
      upsertCached('products', res.product || { ...(product || {}), ...payload });
      modal.close('saved');
      notify.ok(isEdit ? 'Producto actualizado.' : 'Producto creado.');
      if (onSaved) onSaved(res.product);
    } catch (error) { mount(errorHost, errorBox(errorMessage(error))); }
  }
  body.addEventListener('submit', (e) => { e.preventDefault(); withBusy(saveBtn, submit); });
  saveBtn.addEventListener('click', () => withBusy(saveBtn, submit));

  const modal = openModal({
    title: isEdit ? 'Editar producto' : 'Nuevo producto',
    size: 'lg',
    body,
    footer: [button('Cancelar', { variant: 'ghost', onClick: () => modal.close() }), saveBtn],
    initialFocus: 'input',
    onClose: (result) => { if (result !== 'saved' && onClosed) onClosed(); },
  });
  return modal;
}

// ─── Pantalla ───────────────────────────────────────────────────────────────

export function storeView(container, params, app) {
  let products = [];
  let orders = [];
  let enabled = null;
  let tab = params.query?.tab === 'orders' ? 'orders' : 'products';
  let query = '';
  let destroyed = false;
  let modal = null;
  let lastParamId = null;

  const switchHost = h('div', { class: 'store-switch' });
  const tabsHost = h('div');
  const searchInput = textInput({ type: 'search', placeholder: 'Buscar…', 'aria-label': 'Buscar' });
  const content = h('div');

  const page = h('div', { class: 'page' },
    h('div', { class: 'page__head' }, h('div', null, h('h1', { class: 'page__title' }, 'Tienda'), h('p', { class: 'page__sub' }, 'Productos que ven tus alumnos en la app y los pedidos que van entrando.')), h('div', { class: 'page__actions' }, button('Nuevo producto', { variant: 'primary', icon: 'plus', onClick: () => app.navigate('store/new') }))),
    switchHost,
    h('div', { class: 'toolbar' }, tabsHost, h('span', { class: 'grow' }), h('div', { class: 'input-icon', style: { width: '280px' } }, icon('search', 16), searchInput)),
    content);
  mount(container, page);
  app.setNewAction('Nuevo producto', () => app.navigate('store/new'));

  searchInput.addEventListener('input', debounce(() => { query = normalize(searchInput.value.trim()); paint(); }, 120));

  async function load({ force = false } = {}) {
    mount(content, loadingBlock('Cargando la tienda…'));
    const [p, o, e] = await Promise.allSettled([loadProducts({ force }), loadOrders({ force }), loadStoreEnabled({ force })]);
    if (destroyed) return;
    if (p.status === 'rejected') { mount(content, errorBox(errorMessage(p.reason), () => load({ force: true }))); return; }
    products = p.value;
    orders = o.status === 'fulfilled' ? o.value : [];
    enabled = e.status === 'fulfilled' ? e.value : null;
    paint();
    handleParams(params);
  }

  function paintSwitch() {
    if (enabled === null) { mount(switchHost); return; }
    const sw = switchInput({ checked: enabled, label: enabled ? 'La tienda está habilitada para los alumnos' : 'La tienda está oculta para los alumnos', onChange: async (on, ev) => {
      const input = ev.target;
      input.disabled = true;
      try {
        await api.patch('/api/admin/store/settings', { enabled: on });
        enabled = on; invalidate('storeEnabled');
        notify.ok(on ? 'Tienda habilitada.' : 'Tienda deshabilitada.');
      } catch (error) { input.checked = !on; notify.error(errorMessage(error)); }
      finally { input.disabled = false; paintSwitch(); }
    } });
    mount(switchHost, sw, h('span', { class: 'faint' }, 'Los productos inactivos nunca se muestran, aunque la tienda esté habilitada.'));
  }

  function paintTabs() {
    mount(tabsHost, tabs([{ value: 'products', label: `Productos (${products.length})` }, { value: 'orders', label: `Pedidos (${orders.length})` }], tab, (v) => { tab = v; paint(); }));
  }

  async function setActive(product, on) {
    try {
      await api.patch(`/api/admin/store/products/${product.id}/active`, { active: on });
      patchCached('products', product.id, { active: on });
      notify.ok(on ? 'Producto activado.' : 'Producto desactivado.');
    } catch (error) { notify.error(errorMessage(error)); paint(); }
  }

  async function remove(product) {
    if (!(await confirmDialog({ title: 'Eliminar producto', message: `Se elimina “${product.name}”. Si ya tiene pedidos no se puede borrar: en ese caso desactivalo.`, confirmText: 'Eliminar', danger: true }))) return;
    try { await api.del(`/api/admin/store/products/${product.id}`); removeCached('products', product.id); notify.ok('Producto eliminado.'); }
    catch (error) { notify.error(errorMessage(error), { action: error.status === 409 ? { label: 'Desactivar', onClick: () => setActive(product, false) } : undefined }); }
  }

  function productsTable() {
    const list = products.filter((p) => !query || normalize(`${p.name} ${categoryLabel(p.category)}`).includes(query));
    if (!products.length) return emptyState({ icon: 'bag', title: 'Todavía no cargaste productos', text: 'Agregá suplementos, ropa, accesorios o ebooks. Cuando habilites la tienda, tus alumnos los ven en la app.', action: button('Nuevo producto', { variant: 'primary', icon: 'plus', onClick: () => app.navigate('store/new') }) });
    if (!list.length) return h('div', { class: 'table-wrap' }, emptyState({ icon: 'search', title: 'Sin resultados', text: 'Ningún producto coincide con la búsqueda.' }));
    return h('div', { class: 'table-wrap' }, h('div', { class: 'table-scroll' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, h('th', null, 'Producto'), h('th', null, 'Categoría'), h('th', null, 'Precio'), h('th', null, 'Stock'), h('th', null, 'Estado'), h('th', { style: { width: '96px' } }))),
      h('tbody', null, list.map((p) => {
        const open = () => app.navigate(`store/${p.id}`);
        const low = p.stock !== null && p.stock !== undefined && p.stock <= 3;
        return h('tr', { class: ['is-clickable', !p.active && 'is-muted'], tabindex: 0, onClick: open, onKeydown: (e) => { if (e.key === 'Enter') open(); } },
          h('td', null, h('div', { class: 'cell-user' }, productThumb(p), h('div', { class: 'cell-user__text' }, h('div', { class: 'cell-name' }, p.name), p.description ? h('div', { class: 'cell-sub trunc', style: { maxWidth: '360px' } }, p.description) : null))),
          h('td', null, badge(categoryLabel(p.category))),
          h('td', { class: 'num' }, formatMoney(p.price)),
          h('td', { class: 'num' }, p.stock === null || p.stock === undefined ? h('span', { class: 'faint' }, 'Sin límite') : low ? badge(p.stock === 0 ? 'Agotado' : `Quedan ${p.stock}`, p.stock === 0 ? 'danger' : 'warn') : String(p.stock)),
          h('td', { onClick: (e) => e.stopPropagation() }, switchInput({ checked: Boolean(p.active), label: p.active ? 'Activo' : 'Inactivo', onChange: (on) => setActive(p, on) })),
          h('td', null, h('div', { class: 'row', style: { justifyContent: 'flex-end', gap: '2px' } }, button('Editar', { size: 'sm', variant: 'ghost', iconOnly: true, icon: 'pencil', onClick: (e) => { e.stopPropagation(); open(); } }), button('Eliminar', { size: 'sm', variant: 'ghost', iconOnly: true, icon: 'trash', onClick: (e) => { e.stopPropagation(); remove(p); } }))));
      })))));
  }

  function ordersTable() {
    const list = orders.filter((o) => !query || normalize(`${o.product_name || ''} ${fullName({ name: o.name, surname: o.surname, email: o.email })} ${o.email || ''}`).includes(query));
    if (!orders.length) return emptyState({ icon: 'receipt', title: 'Sin pedidos todavía', text: 'Cuando un alumno compre en la tienda, el pedido aparece acá con su estado de pago.' });
    if (!list.length) return h('div', { class: 'table-wrap' }, emptyState({ icon: 'search', title: 'Sin resultados', text: 'Ningún pedido coincide con la búsqueda.' }));
    const approvedTotal = orders.filter((o) => String(o.status).toLowerCase() === 'approved').reduce((s, o) => s + Number(o.amount || 0), 0);
    return h('div', { class: 'table-wrap' }, h('div', { class: 'table-scroll' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, h('th', null, 'Fecha'), h('th', null, 'Alumno'), h('th', null, 'Producto'), h('th', null, 'Cant.'), h('th', null, 'Monto'), h('th', null, 'Estado'))),
      h('tbody', null, list.map((o) => h('tr', null,
        h('td', null, h('div', { class: 'num' }, formatDateTime(o.created_at)), h('div', { class: 'cell-sub' }, timeAgo(o.created_at))),
        h('td', null, h('div', { class: 'cell-name' }, fullName({ name: o.name, surname: o.surname, email: o.email })), h('div', { class: 'cell-sub' }, o.email || '')),
        h('td', null, o.product_name || '—'),
        h('td', { class: 'num' }, o.quantity || 1),
        h('td', { class: 'num' }, formatMoney(o.amount)),
        h('td', null, orderStatusBadge(o.status))))))),
    h('div', { class: 'table-foot' }, h('span', null, `${plural(list.length, 'pedido', 'pedidos')}`), h('span', null, `Cobrado (aprobados): ${formatMoney(approvedTotal)}`)));
  }

  function paint() {
    if (destroyed) return;
    paintSwitch();
    paintTabs();
    searchInput.placeholder = tab === 'orders' ? 'Buscar por alumno o producto…' : 'Buscar producto…';
    mount(content, tab === 'orders' ? ordersTable() : productsTable());
  }

  function handleParams(p) {
    params = p;
    const id = p.id || null;
    if (id === lastParamId && (modal || !id)) return;
    lastParamId = id;
    if (modal) { modal.close(); modal = null; }
    if (!id) return;
    const done = () => { modal = null; lastParamId = null; if (!destroyed) app.navigate('store', { replace: true }); };
    if (id === 'new') { modal = openProductModal({ onSaved: () => { modal = null; lastParamId = null; app.navigate('store', { replace: true }); }, onClosed: done }); return; }
    const product = products.find((x) => String(x.id) === String(id));
    if (!product) { notify.warn('No encontramos ese producto. Puede que ya no exista.'); app.navigate('store', { replace: true }); return; }
    modal = openProductModal({ product, onSaved: () => { modal = null; lastParamId = null; app.navigate('store', { replace: true }); }, onClosed: done });
  }

  const stopListening = onInvalidate((keys) => {
    if (keys.includes('products') && !destroyed && products.length + 1) loadProducts().then((list) => { products = list; paint(); }).catch(() => {});
  });

  load();

  return {
    onParams: (p) => { if (products.length || p.id) handleParams(p); else params = p; },
    refresh: () => load({ force: true }),
    destroy() { destroyed = true; stopListening(); modal?.close(); app.setNewAction(null); },
  };
}
