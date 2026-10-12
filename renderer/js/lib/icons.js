// Set de íconos de línea (rejilla de 24px). Cada entrada es una lista de formas:
//   'M…'                  → trazo (path)
//   ['c', cx, cy, r]      → círculo de trazo
//   ['fc', cx, cy, r]     → círculo relleno
//   ['r', x, y, w, h, rx] → rectángulo de trazo
//   ['f', 'M…']           → path relleno
import { svg } from './h.js';

const ICONS = {
  sun: [['c', 12, 12, 4], 'M12 2.5v2', 'M12 19.5v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2.5 12h2', 'M19.5 12h2', 'M6.3 17.7l-1.4 1.4', 'M19.1 4.9l-1.4 1.4'],
  users: [['c', 9, 8, 3.5], 'M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6', ['c', 17.5, 9, 2.5], 'M17 14.2c2.6.3 4.5 2.2 4.5 5.3'],
  user: [['c', 12, 8, 4], 'M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7'],
  clipboard: [['r', 5, 4, 14, 17, 2], 'M9 4V3h6v1', 'M9 10h6', 'M9 14h6', 'M9 18h3'],
  dumbbell: ['M6.5 6.5v11', 'M17.5 6.5v11', 'M3.5 9v6', 'M20.5 9v6', 'M6.5 12h11'],
  bag: ['M5 8h14l-1 12H6L5 8z', 'M9 8V6a3 3 0 0 1 6 0v2'],
  card: [['r', 2, 5, 20, 14, 2], 'M2 10h20', 'M6 15h4'],
  sliders: ['M4 6h9', 'M17 6h3', 'M4 12h3', 'M11 12h9', 'M4 18h11', 'M19 18h1', ['c', 15, 6, 2], ['c', 9, 12, 2], ['c', 17, 18, 2]],
  search: [['c', 11, 11, 6.5], 'm20 20-4-4'],
  plus: ['M12 5v14', 'M5 12h14'],
  x: ['M6 6l12 12', 'M18 6 6 18'],
  check: ['m5 12.5 4.5 4.5L19 7.5'],
  'chevron-right': ['m9 6 6 6-6 6'],
  'chevron-left': ['m15 6-6 6 6 6'],
  'chevron-down': ['m6 9 6 6 6-6'],
  'chevron-up': ['m6 15 6-6 6 6'],
  trash: ['M4 7h16', 'M10 3h4', 'M6 7l1 13h10l1-13', 'M10 11v6', 'M14 11v6'],
  pencil: ['M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z', 'M14.5 6.5l3 3'],
  copy: [['r', 9, 9, 11, 11, 2], 'M5 15V6a2 2 0 0 1 2-2h9'],
  download: ['M12 4v11', 'm7 11 5 5 5-5', 'M5 20h14'],
  external: ['M14 4h6v6', 'M20 4 10 14', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
  chat: ['M4 20l1.3-4A8 8 0 1 1 8.2 18.8L4 20z'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z', ['c', 12, 12, 3]],
  'arrow-up': ['M12 19V5', 'm6 11 6-6 6 6'],
  'arrow-down': ['M12 5v14', 'm6 13 6 6 6-6'],
  grip: [['fc', 9, 6, 1.3], ['fc', 15, 6, 1.3], ['fc', 9, 12, 1.3], ['fc', 15, 12, 1.3], ['fc', 9, 18, 1.3], ['fc', 15, 18, 1.3]],
  refresh: ['M20 11a8 8 0 0 0-14-4L4 9', 'M4 4v5h5', 'M4 13a8 8 0 0 0 14 4l2-2', 'M20 20v-5h-5'],
  calendar: [['r', 3, 5, 18, 16, 2], 'M3 10h18', 'M8 3v4', 'M16 3v4'],
  alert: ['M12 3 2 20h20L12 3z', 'M12 10v4', 'M12 17h.01'],
  info: [['c', 12, 12, 9], 'M12 11v5', 'M12 8h.01'],
  logout: ['M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4', 'M16 8l4 4-4 4', 'M20 12H9'],
  phone: ['M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z'],
  mail: [['r', 3, 5, 18, 14, 2], 'm3 7 9 6 9-6'],
  play: [['f', 'M7 5v14l12-7z']],
  image: [['r', 3, 4, 18, 16, 2], ['c', 9, 10, 1.5], 'm21 16-5-5-8 8'],
  filter: ['M3 5h18l-7 8v6l-4-2v-4L3 5z'],
  lock: [['r', 5, 11, 14, 9, 2], 'M8 11V8a4 4 0 0 1 8 0v3'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z'],
  panel: [['r', 3, 4, 18, 16, 2], 'M9 4v16'],
  receipt: ['M6 3h12v18l-3-2-3 2-3-2-3 2V3z', 'M9 8h6', 'M9 12h6'],
  undo: ['M4 9h10a5 5 0 0 1 0 10H8', 'm8 5-4 4 4 4'],
  save: ['M5 4h11l3 3v13H5V4z', 'M8 4v5h7V4', 'M8 20v-6h8v6'],
  list: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  clock: [['c', 12, 12, 9], 'M12 7v5l3 2'],
  more: [['fc', 5, 12, 1.4], ['fc', 12, 12, 1.4], ['fc', 19, 12, 1.4]],
  layers: ['M12 3 3 8l9 5 9-5-9-5z', 'm3 13 9 5 9-5'],
  flame: ['M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z'],
  wifi: ['M2.5 9a15 15 0 0 1 19 0', 'M5.5 12.5a10 10 0 0 1 13 0', 'M8.5 16a5 5 0 0 1 7 0', ['fc', 12, 19.5, 1]],
  barbell: ['M2 12h20', 'M5 8v8', 'M8 6v12', 'M16 6v12', 'M19 8v8'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
};

export function icon(name, size = 18, attrs = {}) {
  const shapes = ICONS[name] || ICONS.info;
  const root = svg('svg', {
    class: `icon${attrs.class ? ' ' + attrs.class : ''}`,
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': attrs.stroke || 1.75,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  shapes.forEach((shape) => {
    if (typeof shape === 'string') {
      root.appendChild(svg('path', { d: shape }));
    } else if (shape[0] === 'c') {
      root.appendChild(svg('circle', { cx: shape[1], cy: shape[2], r: shape[3] }));
    } else if (shape[0] === 'fc') {
      root.appendChild(svg('circle', { cx: shape[1], cy: shape[2], r: shape[3], fill: 'currentColor', stroke: 'none' }));
    } else if (shape[0] === 'r') {
      root.appendChild(svg('rect', { x: shape[1], y: shape[2], width: shape[3], height: shape[4], rx: shape[5] || 0 }));
    } else if (shape[0] === 'f') {
      root.appendChild(svg('path', { d: shape[1], fill: 'currentColor', stroke: 'none' }));
    }
  });
  return root;
}
