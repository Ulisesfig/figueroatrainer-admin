// Reordenamiento por arrastre para listas de filas (HTML5 drag & drop).
// Solo se arrastra desde el "grip" de cada fila, así seleccionar texto o
// hacer clic en los campos nunca inicia un arrastre sin querer.
export function makeSortable(listEl, { rowSelector = '.ex-row', handleSelector = '.ex-grip', onReorder }) {
  let dragging = null;

  const rows = () => [...listEl.querySelectorAll(`:scope > ${rowSelector}`)];
  const clearMarks = () => rows().forEach((r) => r.classList.remove('drop-before', 'drop-after'));

  listEl.addEventListener('mousedown', (e) => {
    const handle = e.target.closest(handleSelector);
    const row = handle && handle.closest(rowSelector);
    if (row && row.parentElement === listEl) row.draggable = true;
  });
  listEl.addEventListener('mouseup', () => rows().forEach((r) => { r.draggable = false; }));

  listEl.addEventListener('dragstart', (e) => {
    const row = e.target.closest(rowSelector);
    if (!row || row.parentElement !== listEl || !row.draggable) { e.preventDefault(); return; }
    dragging = row;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', row.dataset.key || '');
    setTimeout(() => row.classList.add('is-dragging'), 0);
  });

  listEl.addEventListener('dragover', (e) => {
    if (!dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearMarks();
    const target = rows().filter((r) => r !== dragging).find((r) => e.clientY < r.getBoundingClientRect().top + r.getBoundingClientRect().height / 2);
    if (target) target.classList.add('drop-before');
    else { const last = rows().filter((r) => r !== dragging).pop(); if (last) last.classList.add('drop-after'); }
  });

  listEl.addEventListener('drop', (e) => {
    if (!dragging) return;
    e.preventDefault();
    const all = rows();
    const from = all.indexOf(dragging);
    const others = all.filter((r) => r !== dragging);
    const before = others.find((r) => r.classList.contains('drop-before'));
    let to = before ? others.indexOf(before) : others.length;
    clearMarks();
    dragging.classList.remove('is-dragging');
    dragging.draggable = false;
    dragging = null;
    if (to !== from) onReorder(from, to);
  });

  listEl.addEventListener('dragend', () => {
    clearMarks();
    if (dragging) { dragging.classList.remove('is-dragging'); dragging.draggable = false; }
    dragging = null;
  });
}
