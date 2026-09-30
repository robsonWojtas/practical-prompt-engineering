const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers.cjs');

test('file import previews before commit, saves and renders, then exports and restores backup', async () => {
  const app = setup();
  app.el('#import-file').files = [{ text: async () => app.data }];
  await app.el('#import-file').events.change();
  assert.equal(app.el('#import-dialog').open, true);
  assert.equal(app.saved.get('prompt-library-prompts'), '[]');
  app.el('#confirm-import').click();
  assert.equal(app.el('#import-dialog').open, false);
  assert.equal(app.el('#prompt-list').children.length, 1);
  assert.equal(JSON.parse(app.saved.get('prompt-library-prompts'))[0].title, 'Imported');
  app.el('#export-prompts').click();
  assert.match(app.downloads[0], /^prompt-library-.*\.json$/);
  app.el('#download-backup').click();
  assert.match(app.downloads[1], /^prompt-library-backup-/);
  const backup = JSON.parse(app.saved.get('prompt-library-import-backup'));
  app.run(`this.backupFile = {text: async () => JSON.stringify(PromptTransfer.createExport(JSON.parse(${JSON.stringify(backup.raw)})))}`);
  await app.run('importPrompts(backupFile)');
  app.el('#import-mode').value = 'replace';
  app.el('#import-mode').events.change();
  app.el('#confirm-import').click();
  assert.equal(app.saved.get('prompt-library-prompts'), '[]');
});
test('conflict resolution renders versions and keeps both when selected', async () => {
  const app = setup();
  await app.run(`importPrompts({text: async () => ${JSON.stringify(app.data)}})`);
  app.el('#confirm-import').click();
  await app.run(`importPrompts({text: async () => ${JSON.stringify(app.data)}})`);
  const selectors = app.el('#import-conflicts').querySelectorAll('select');
  assert.equal(selectors.length, 1);
  selectors[0].value = 'both';
  app.el('#confirm-import').click();
  assert.equal(JSON.parse(app.saved.get('prompt-library-prompts')).length, 2);
});
test('cancel and malformed files never change data', async () => {
  const app = setup();
  await app.run(`importPrompts({text: async () => ${JSON.stringify(app.data)}})`);
  app.el('#cancel-import').click();
  app.el('#confirm-import').click();
  assert.equal(app.saved.get('prompt-library-prompts'), '[]');
  await app.run('importPrompts({text: async () => "broken"})');
  assert.match(app.el('#app-error').textContent, /Invalid JSON/);
  assert.equal(app.saved.get('prompt-library-prompts'), '[]');
});
test('corrupt existing data allows replacement and keeps raw recovery backup', async () => {
  const app = setup('broken');
  await app.run(`importPrompts({text: async () => ${JSON.stringify(app.data)}})`);
  assert.equal(app.el('#import-mode').value, 'replace');
  assert.equal(app.el('#import-mode').option.disabled, true);
  app.el('#confirm-import').click();
  assert.equal(app.run('loadFailed'), false);
  assert.equal(JSON.parse(app.saved.get('prompt-library-import-backup')).raw, 'broken');
  app.el('#download-backup').click();
  assert.match(app.downloads[0], /raw-backup/);
});
