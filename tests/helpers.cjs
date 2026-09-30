const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

class Element {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.events = {}; this.dataset = {}; this.value = ''; this.hidden = false; this.classList = { toggle() {} }; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, callback) { this.events[name] = callback; }
  setAttribute() {}
  focus() {}
  remove() {}
  click() { return this.events.click?.(); }
  showModal() { this.open = true; }
  close() { this.open = false; this.events.close?.(); }
  querySelector() { return this.option ||= new Element('option'); }
  querySelectorAll(tag) { return this.children.flatMap(child => typeof child === 'object' ? [...(child.tag === tag ? [child] : []), ...child.querySelectorAll(tag)] : []); }
}
function setup(raw = '[]') {
  const elements = new Map(); const saved = new Map([['prompt-library-prompts', raw]]); const downloads = [];
  const document = { querySelector: id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); }, createElement: tag => { const el = new Element(tag); if (tag === 'a') el.click = () => downloads.push(el.download); return el; }, body: new Element() };
  const context = vm.createContext({ document, localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) }, crypto: { randomUUID: () => 'new-id' }, URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }, Blob, setTimeout: callback => callback() });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8'), context, { filename: 'script.js' });
  const run = code => vm.runInContext(code, context);
  const data = run('JSON.stringify(PromptTransfer.createExport([{id:"a",title:"Imported",content:"Full content",rating:5,notes:[],isCode:false,metadata:trackModel("Test model","Full content")}]))');
  return { elements, saved, downloads, run, data, el: id => document.querySelector(id) };
}

module.exports = { setup };
