import { test } from 'node:test';
import assert from 'node:assert/strict';
import { furiganaToRuby } from '../web/js/furigana.js';

test('furiganaToRuby converts single kanji+reading', () => {
  assert.equal(furiganaToRuby('住（す）む'), '<ruby>住<rt>す</rt></ruby>む');
});
test('furiganaToRuby converts a jukugo run', () => {
  assert.equal(furiganaToRuby('三年（さんねん）'), '<ruby>三年<rt>さんねん</rt></ruby>');
});
test('furiganaToRuby leaves plain text and kana untouched', () => {
  assert.equal(furiganaToRuby('わけだ。'), 'わけだ。');
});
test('furiganaToRuby leaves an unbalanced paren as-is', () => {
  assert.equal(furiganaToRuby('住（す'), '住（す');
});
test('furiganaToRuby handles a full mixed sentence', () => {
  assert.equal(
    furiganaToRuby('日本語（にほんご）が上手（じょうず）な'),
    '<ruby>日本語<rt>にほんご</rt></ruby>が<ruby>上手<rt>じょうず</rt></ruby>な'
  );
});
