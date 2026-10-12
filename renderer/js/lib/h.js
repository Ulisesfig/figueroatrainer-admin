// Constructor de DOM. Regla de oro: los datos SIEMPRE entran como texto
// (createTextNode / setAttribute), jamás como HTML. Por eso no existe una
// opción "html": si algún día hace falta, se agrega a propósito y a la vista.

const SVG_NS = 'http://www.w3.org/2000/svg';

function append(parent, child) {
  if (child === null || child === undefined || child === false || child === true) return;
  if (Array.isArray(child)) {
    child.forEach((c) => append(parent, c));
  } else if (child instanceof Node) {
    parent.appendChild(child);
  } else {
    parent.appendChild(document.createTextNode(String(child)));
  }
}

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class' || key === 'className') {
        el.className = Array.isArray(value) ? value.flat(Infinity).filter(Boolean).join(' ') : value;
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(el.style, value);
      } else if (key === 'dataset') {
        Object.entries(value).forEach(([k, v]) => { el.dataset[k] = v; });
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'value' || key === 'checked' || key === 'disabled' || key === 'selected' || key === 'indeterminate') {
        el[key] = value;
      } else if (value === true) {
        el.setAttribute(key, '');
      } else {
        el.setAttribute(key, String(value));
      }
    }
  }
  children.forEach((child) => append(el, child));
  return el;
}

// Contenedor sin etiqueta propia para devolver varios nodos.
export function frag(...children) {
  const fragment = document.createDocumentFragment();
  children.forEach((child) => append(fragment, child));
  return fragment;
}

export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  });
  children.forEach((child) => { if (child) el.appendChild(child); });
  return el;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

// Reemplaza el contenido de un contenedor.
export function mount(container, ...children) {
  clear(container);
  children.forEach((child) => append(container, child));
  return container;
}
