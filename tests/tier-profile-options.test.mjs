import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function page() {
  const html = readFileSync(new URL('../assets/tier-profile.html', import.meta.url), 'utf8');
  const script = html.match(/<script>\s*\(\(\) => \{([\s\S]*)\}\)\(\);\s*<\/script>/)[1];
  const prefix = script.slice(0, script.indexOf('  document.getElementById("tierList").addEventListener'));
  const context = vm.createContext({ window: {}, localStorage: { getItem() {}, setItem() {}, removeItem() {} }, document: { querySelector: () => ({}) } });
  vm.runInContext(`(() => {${prefix}
    renderCards = renderYaml = renderIssues = renderCapsBadge = renderPresets = () => {};
    globalThis.page = { state, render, tierToYaml };
  })()`, context);
  return context.page;
}

test('restored known model drops stale effort keys and invalid values before output', () => {
  const { state, render, tierToYaml } = page();
  state.tiers.ui.options = { reasoningEffort: 'medium', effort: 'low' };
  render();
  assert.equal(tierToYaml('ui', state.tiers.ui), '  ui: sol6.1 @ medium');
  state.tiers.ui.options.reasoningEffort = 'unsupported';
  render();
  assert.deepEqual(Object.keys(state.tiers.ui.options), []);
});

test('same model on a different provider and dependent reuse tiers lose old provider options', () => {
  const { state, render, tierToYaml } = page();
  state.caps = { providers: [
    { id: 'a', models: [{ id: 'shared', options: [{ id: 'effort', values: ['low'] }] }] },
    { id: 'b', models: [{ id: 'shared', options: [{ id: 'reasoningEffort', values: ['medium'] }, { id: 'serviceTier', values: ['priority'] }] }] }
  ] };
  state.tiers.code = { mode: 'target', provider: 'b', model: 'shared', options: { effort: 'low', reasoningEffort: 'medium', serviceTier: 'priority' } };
  state.tiers.fast.options = { effort: 'low' };
  render();
  assert.deepEqual(Object.keys(state.tiers.code.options).sort(), ['reasoningEffort', 'serviceTier']);
  assert.equal(tierToYaml('fast', state.tiers.fast), '  fast: code');
});

test('unknown custom model options remain intact', () => {
  const { state, render } = page();
  state.tiers.ui.model = 'custom-model';
  state.tiers.ui.options = { custom: 'value' };
  render();
  assert.equal(state.tiers.ui.options.custom, 'value');
});
