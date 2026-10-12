// Campo de texto con sugerencias del catálogo de ejercicios. Se puede escribir
// cualquier nombre (el catálogo es una ayuda, no una restricción).
import { h } from './h.js';
import { normalize } from './format.js';

export function catalogCombobox({ getItems, value = '', placeholder = 'Nombre del ejercicio', ariaLabel, className, onInput, onPick, onEnter }) {
  const input = h('input', { type: 'text', class: ['input', className], value, placeholder, 'aria-label': ariaLabel || placeholder, autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-expanded': 'false' });
  let list = null;
  let matches = [];
  let active = -1;

  function close() {
    if (list) { list.remove(); list = null; }
    input.setAttribute('aria-expanded', 'false');
    active = -1;
  }

  function compute() {
    const q = normalize(input.value.trim());
    if (q.length < 1) return [];
    const scored = [];
    getItems().forEach((item) => {
      const name = normalize(item.name);
      let score = 0;
      if (name === q) score = 100;
      else if (name.startsWith(q)) score = 80;
      else if (name.split(/\s+/).some((w) => w.startsWith(q))) score = 60;
      else if (name.includes(q)) score = 40;
      else if (normalize(item.category || '').includes(q)) score = 15;
      if (score) scored.push({ item, score });
    });
    return scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'es')).slice(0, 8).map((s) => s.item);
  }

  function paint() {
    matches = compute();
    if (!matches.length || document.activeElement !== input) { close(); return; }
    if (!list) {
      list = h('div', { class: 'combo', role: 'listbox' });
      document.body.appendChild(list);
      input.setAttribute('aria-expanded', 'true');
    }
    const rect = input.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    Object.assign(list.style, { left: `${rect.left}px`, width: `${Math.max(rect.width, 280)}px`, top: spaceBelow > 260 ? `${rect.bottom + 4}px` : 'auto', bottom: spaceBelow > 260 ? 'auto' : `${window.innerHeight - rect.top + 4}px` });
    list.replaceChildren(...matches.map((item, i) => h(
      'button',
      { type: 'button', class: ['combo__item', i === active && 'is-active'], role: 'option', onMousedown: (e) => { e.preventDefault(); choose(item); } },
      h('span', { class: 'combo__name' }, item.name),
      h('span', { class: 'combo__meta' }, [item.category, item.sets && item.reps ? `${item.sets}×${item.reps}` : null].filter(Boolean).join(' · '))
    )));
  }

  function choose(item) {
    input.value = item.name;
    close();
    if (onPick) onPick(item);
  }

  input.addEventListener('input', () => { active = -1; if (onInput) onInput(input.value); paint(); });
  input.addEventListener('focus', paint);
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && matches.length) { e.preventDefault(); active = (active + 1) % matches.length; paint(); }
    else if (e.key === 'ArrowUp' && matches.length) { e.preventDefault(); active = (active - 1 + matches.length) % matches.length; paint(); }
    else if (e.key === 'Enter') {
      if (list && active >= 0) { e.preventDefault(); choose(matches[active]); }
      else if (list && matches.length === 1 && normalize(matches[0].name) === normalize(input.value.trim())) { e.preventDefault(); choose(matches[0]); }
      else if (onEnter) { e.preventDefault(); close(); onEnter(input.value); }
    } else if (e.key === 'Escape' && list) { e.stopPropagation(); close(); }
  });
  input.addEventListener('detach', close);
  input.closeCombo = close;
  return input;
}
