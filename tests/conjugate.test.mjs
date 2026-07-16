import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conjugate, verbClass, dictForm, formsForLevel, isConjugatable, FORMS } from '../web/js/conjugate.js';

test('godan conjugations across every ending', () => {
  assert.equal(conjugate('かく', 'godan', 'masu'), 'かきます');
  assert.equal(conjugate('かく', 'godan', 'te'), 'かいて');
  assert.equal(conjugate('およぐ', 'godan', 'te'), 'およいで');
  assert.equal(conjugate('はなす', 'godan', 'te'), 'はなして');
  assert.equal(conjugate('かう', 'godan', 'te'), 'かって');
  assert.equal(conjugate('まつ', 'godan', 'te'), 'まって');
  assert.equal(conjugate('かえる', 'godan', 'te'), 'かえって');   // 帰る is 動I
  assert.equal(conjugate('しぬ', 'godan', 'te'), 'しんで');
  assert.equal(conjugate('あそぶ', 'godan', 'ta'), 'あそんだ');
  assert.equal(conjugate('よむ', 'godan', 'ta'), 'よんだ');
  assert.equal(conjugate('かう', 'godan', 'nai'), 'かわない');
  assert.equal(conjugate('かく', 'godan', 'potential'), 'かける');
  assert.equal(conjugate('いく', 'godan', 'volitional'), 'いこう');
  assert.equal(conjugate('のむ', 'godan', 'ba'), 'のめば');
  assert.equal(conjugate('よむ', 'godan', 'passive'), 'よまれる');
  assert.equal(conjugate('かく', 'godan', 'causative'), 'かかせる');
});

test('godan irregulars: 行く and ある', () => {
  assert.equal(conjugate('いく', 'godan', 'te'), 'いって');
  assert.equal(conjugate('いく', 'godan', 'ta'), 'いった');
  assert.equal(conjugate('ある', 'godan', 'nai'), 'ない');
});

test('ichidan conjugations', () => {
  assert.equal(conjugate('たべる', 'ichidan', 'masu'), 'たべます');
  assert.equal(conjugate('たべる', 'ichidan', 'te'), 'たべて');
  assert.equal(conjugate('みる', 'ichidan', 'nai'), 'みない');
  assert.equal(conjugate('たべる', 'ichidan', 'potential'), 'たべられる');
  assert.equal(conjugate('たべる', 'ichidan', 'volitional'), 'たべよう');
  assert.equal(conjugate('たべる', 'ichidan', 'ba'), 'たべれば');
  assert.equal(conjugate('たべる', 'ichidan', 'causative'), 'たべさせる');
});

test('する・くる and compounds', () => {
  assert.equal(conjugate('する', 'suru', 'masu'), 'します');
  assert.equal(conjugate('べんきょうする', 'suru', 'te'), 'べんきょうして');
  assert.equal(conjugate('べんきょうする', 'suru', 'potential'), 'べんきょうできる');
  assert.equal(conjugate('くる', 'suru', 'nai'), 'こない');
  assert.equal(conjugate('くる', 'suru', 'volitional'), 'こよう');
  assert.equal(conjugate('くる', 'suru', 'ba'), 'くれば');
});

test('verbClass + dictForm read the deck pos tags', () => {
  assert.equal(verbClass({ pos: '動I' }), 'godan');
  assert.equal(verbClass({ pos: '動II' }), 'ichidan');
  assert.equal(verbClass({ pos: '動III' }), 'suru');
  assert.equal(verbClass({ pos: '名／動III' }), 'suru');
  assert.equal(verbClass({ pos: '名' }), null);
  assert.equal(dictForm({ pos: '名／動III', kana: 'けいかく' }), 'けいかくする');
  assert.equal(dictForm({ pos: '動III', kana: 'べんきょうする' }), 'べんきょうする');
  assert.equal(dictForm({ pos: '動III', kana: 'くる' }), 'くる');
});

test('formsForLevel gates advanced forms', () => {
  assert.deepEqual(formsForLevel('N5').map(f => f.id), ['masu', 'te', 'ta', 'nai']);
  assert.equal(formsForLevel('N4').length, 7);
  assert.equal(formsForLevel('N3').length, FORMS.length);
  assert.equal(formsForLevel('N1').length, FORMS.length);
});

test('every deck verb is conjugatable in all its level forms', async () => {
  const fs = await import('node:fs');
  for (const lv of ['n5', 'n4', 'n3', 'n2', 'n1']) {
    const deck = JSON.parse(fs.readFileSync(new URL(`../web/data/${lv}.json`, import.meta.url)));
    for (const card of deck.filter(isConjugatable)) {
      const kana = dictForm(card);
      for (const f of formsForLevel(card.level)) {
        const out = conjugate(kana, verbClass(card), f.id);
        assert.ok(out && out.length > 0, `${card.word} ${f.id}`);
      }
    }
  }
});
