import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../mods/frame/settings/main.js', import.meta.url), 'utf8');
const toggle = new Function(source.slice(source.indexOf('function toggleSeamless'), source.indexOf('export default class Settings')) + '; return toggleSeamless;')();

test('seamless preserves the app background and hides panel layers and outlines', () => {
  const person = { theme: { dark: 'one', light: 'two' }, colors: { canvas: '#20242a', background: '#17191d', chrome: '#123456', border: '#445566', accent: '#abcdef' } };
  const saved = structuredClone(person);
  toggle(person);
  assert.equal(person.seamless, true);
  for (const key of ['chrome', 'surface', 'border']) assert.equal(person.colors[key], '#00000000');
  assert.deepEqual(person.theme, saved.theme);
  assert.equal(person.colors.canvas, saved.colors.canvas);
  assert.equal(person.colors.background, saved.colors.background);
  const persisted = JSON.parse(JSON.stringify(person));
  toggle(persisted);
  assert.deepEqual(persisted, saved);
});

test('seamless restores defaults and preserves independent color edits', () => {
  const person = {};
  toggle(person);
  toggle(person);
  assert.deepEqual(person, {});
  toggle(person);
  person.colors.chrome = '#654321';
  person.colors.accent = '#abcdef';
  toggle(person);
  assert.deepEqual(person, { colors: { chrome: '#654321', accent: '#abcdef' } });
});


test('disabling the earlier preset restores its canvas override', () => {
  for (const saved of [{}, { canvas: '#20242a' }]) {
    const person = {
      seamless: true,
      seamless_colors: saved,
      colors: { canvas: '#00000000', chrome: '#00000000', surface: '#00000000' },
    };
    toggle(person);
    assert.deepEqual(person, Object.keys(saved).length ? { colors: saved } : {});
  }
});
