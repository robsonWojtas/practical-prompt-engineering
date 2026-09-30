const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers.cjs');
const t = setup().run('PromptTransfer');
const prompt = (id = 'a', rating = 0, model = 'Model A') => ({
  id, title: 'Title', content: 'Full prompt content', isCode: false, rating,
  notes: [{ id: 'note-a', content: 'Useful note' }],
  metadata: { model, createdAt: '2026-09-29T10:00:00.000Z', updatedAt: '2026-09-29T10:00:00.000Z', tokenEstimate: { min: 2, max: 5, confidence: 'high' } },
});
const plain = value => JSON.parse(JSON.stringify(value));
function storage(initial) {
  const values = new Map(initial === null ? [] : [['prompts', initial]]);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
test('complete export round trip preserves nested and extension data', () => {
  const prompts = [prompt()]; prompts[0].custom = { tags: ['test'] };
  const data = t.createExport(prompts);
  assert.equal(data.version, 1);
  assert.deepEqual(plain(t.parse(JSON.stringify(data)).prompts), prompts);
});
test('statistics exclude unrated prompts and resolve model ties alphabetically', () => {
  assert.deepEqual(plain(t.statistics([])), { totalPrompts: 0, averageRating: null, mostUsedModel: null });
  assert.deepEqual(plain(t.statistics([prompt('a', 5, 'Z'), prompt('b', 2, 'A'), prompt('c', 0, 'A')])), { totalPrompts: 3, averageRating: 3.5, mostUsedModel: 'A' });
  assert.equal(t.statistics([prompt('a', 1, 'Z'), prompt('b', 2, 'A')]).mostUsedModel, 'A');
});
test('reject malformed JSON, versions, dates, statistics, and nonobjects', () => {
  for (const text of ['{', 'null', '[]']) assert.throws(() => t.parse(text));
  for (const patch of [{ version: 2 }, { exportedAt: '2026-02-30T10:00:00.000Z' }, { statistics: {} }, { prompts: null }]) {
    assert.throws(() => t.parse(JSON.stringify({ ...t.createExport([]), ...patch })));
  }
});
test('reject bad fields, nested notes, metadata, and duplicate IDs', () => {
  for (const patch of [{ id: '' }, { content: 1 }, { title: ' ' }, { rating: 6 }, { rating: 1.5 }, { notes: null }, { notes: [{ id: 'n', content: '' }] }, { isCode: 'false' }, { metadata: {} }]) {
    assert.throws(() => t.validatePrompts([{ ...prompt(), ...patch }]), /prompts\[0\]/);
  }
  assert.throws(() => t.validatePrompts([prompt(), prompt()]), /Duplicate prompt ID/);
  const p = prompt(); p.notes.push(p.notes[0]);
  assert.throws(() => t.validatePrompts([p]), /Duplicate note ID/);
});
test('merge supports keep, overwrite, both, and new IDs without mutating inputs', () => {
  const original = prompt(); const incoming = { ...prompt(), title: 'Changed' };
  assert.equal(t.merge([original], [incoming], new Map([['a', 'existing']]))[0].title, 'Title');
  assert.equal(t.merge([original], [incoming], new Map([['a', 'incoming']]))[0].title, 'Changed');
  let calls = 0;
  const result = t.merge([original], [incoming, prompt('b')], new Map([['a', 'both']]), () => ++calls === 1 ? 'b' : 'c');
  assert.deepEqual(plain(result.map(p => p.id)), ['a', 'c', 'b']);
  assert.equal(original.title, 'Title'); assert.equal(incoming.id, 'a');
  assert.throws(() => t.merge([original], [incoming], new Map()), /Choose a resolution/);
});
test('backup records exact original data before replacement, including empty imports', () => {
  const raw = JSON.stringify([prompt()]); const store = storage(raw);
  let applied;
  t.commit(store, 'prompts', [], raw, value => { applied = value; });
  assert.equal(store.getItem('prompts'), '[]'); assert.equal(applied.length, 0);
  assert.equal(JSON.parse(store.getItem(t.BACKUP_KEY)).raw, raw);
});
test('failed backup aborts before writing library', () => {
  const store = storage('[]'); store.setItem = () => { throw new Error('quota'); };
  assert.throws(() => t.commit(store, 'prompts', [prompt()], '[]', () => {}), /Could not create a backup/);
  assert.equal(store.getItem('prompts'), '[]');
});
test('storage write and rendering failures preserve original data', () => {
  for (const raw of [null, '[]', 'corrupt original']) {
    const store = storage(raw);
    assert.throws(() => t.commit(store, 'prompts', [prompt()], raw, () => { throw new Error('render failed'); }), /original stored data restored/);
    assert.equal(store.getItem('prompts'), raw);
  }
  const store = storage('[]'); const set = store.setItem;
  store.setItem = (key, value) => { if (key === 'prompts') throw new Error('quota'); set(key, value); };
  assert.throws(() => t.commit(store, 'prompts', [prompt()], '[]', () => {}), /original stored data restored/);
});
test('rollback failure reports recovery backup and preserves it', () => {
  const store = storage('[]'); const set = store.setItem;
  store.setItem = (key, value) => { if (key === 'prompts' && value === '[]') throw new Error('storage unavailable'); set(key, value); };
  assert.throws(() => t.commit(store, 'prompts', [prompt()], '[]', () => { throw new Error('render'); }), /Rollback also failed.*Download the backup/);
  assert.equal(JSON.parse(store.getItem(t.BACKUP_KEY)).raw, '[]');
});
test('stale imports never overwrite concurrent edits or previous backup', () => {
  const store = storage('changed');
  assert.throws(() => t.commit(store, 'prompts', [], '[]', () => {}), /changed while import was open/);
  assert.equal(store.getItem('prompts'), 'changed'); assert.equal(store.getItem(t.BACKUP_KEY), null);
});
