// Values remain in memory only; neither client text nor filenames go into browser storage.
const edited = new WeakSet();
export function trackFormEdits(document) {
  for (const event of ['input', 'change']) document.addEventListener(event, e => {
    if (e.target.form && e.target.form.id !== 'login-form') edited.add(e.target.form);
  });
}
export function captureForms(document) {
  return [...document.forms].filter(f => edited.has(f) && !f.closest('dialog')).map(form => ({
    id: form.id, dataset: JSON.stringify(form.dataset),
    controls: [...form.querySelectorAll('input,textarea,select')].map(node => ({ node, id: node.id, name: node.name,
      value: node.value, checked: node.checked, type: node.type, start: node.selectionStart, end: node.selectionEnd,
      focused: document.activeElement === node }))
  }));
}
export function restoreForms(document, forms) {
  let restored = 0;
  for (const saved of forms) {
    const form = document.getElementById(saved.id);
    if (!form || JSON.stringify(form.dataset) !== saved.dataset) continue;
    for (const control of saved.controls) {
      let node = [...form.querySelectorAll('input,textarea,select')].find(n => control.id ? n.id === control.id :
        n.name === control.name && n.type === control.type && (n.type !== 'checkbox' && n.type !== 'radio' || n.value === control.value));
      if (!node || node.type !== control.type) continue;
      if (node.type === 'file') { node.replaceWith(control.node); node = control.node; }
      else if (node.tagName !== 'SELECT' || [...node.options].some(o => o.value === control.value)) node.value = control.value;
      if (['checkbox', 'radio'].includes(node.type)) node.checked = control.checked;
      if (control.focused) { node.focus({ preventScroll: true }); if (typeof control.start === 'number') node.setSelectionRange(control.start, control.end); }
    }
    edited.add(form); restored++;
  }
  return restored;
}
