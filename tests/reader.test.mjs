import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMatcher, annotate, mergeWordbook } from '../web/js/reader.js';

const cards = [
  { id: '1', word: '学校', kana: 'がっこう', pos: '名', zh: '學校', level: 'N5' },
  { id: '2', word: '学校生活', kana: 'がっこうせいかつ', pos: '名', zh: '學校生活', level: 'N3' },
  { id: '3', word: '帰る', kana: 'かえる', pos: '動I', zh: '回去', level: 'N5' },
  { id: '4', word: 'きっと', kana: 'きっと', pos: '副', zh: '一定', level: 'N4' },   // hiragana-only → not indexed
  { id: '5', word: 'ニュース', kana: 'ニュース', pos: '名', zh: '新聞', level: 'N4' },
];

test('annotate: exact word match, longest wins', () => {
  const m = buildMatcher(cards);
  const tokens = annotate('学校生活は楽しい。', m);
  assert.equal(tokens[0].t, '学校生活');
  assert.equal(tokens[0].card.id, '2');     // 学校生活 beats 学校
  assert.equal(tokens[1].t, 'は楽しい。');
  assert.equal(tokens[1].card, undefined);
});

test('annotate: verb stem matches conjugated forms, only before hiragana', () => {
  const m = buildMatcher(cards);
  const tokens = annotate('家に帰った。帰国した。', m);
  const hit = tokens.find(t => t.card && t.card.id === '3');
  assert.equal(hit.t, '帰');                 // 帰った via stem
  // 帰国 (kanji follows the stem) must NOT match 帰る
  const after = tokens.slice(tokens.indexOf(hit) + 1);
  assert.ok(!after.some(t => t.card && t.card.id === '3'));
});

test('annotate: hiragana-only words are not indexed; katakana words are', () => {
  const m = buildMatcher(cards);
  assert.ok(!annotate('きっと行く。', m).some(t => t.card));
  assert.ok(annotate('ニュースを見る。', m).some(t => t.card && t.card.id === '5'));
});

test('annotate: tokens rejoin to the original text', () => {
  const m = buildMatcher(cards);
  const text = '今日、学校でニュースを見て家に帰った。\n楽しかった。';
  assert.equal(annotate(text, m).map(t => t.t).join(''), text);
});

test('mergeWordbook unions by id, keeps order, caps', () => {
  const a = [{ id: '1', lv: 'n5', at: 1 }, { id: '2', lv: 'n3', at: 2 }];
  const b = [{ id: '2', lv: 'n3', at: 3 }, { id: '9', lv: 'n1', at: 4 }];
  const m = mergeWordbook(a, b);
  assert.deepEqual(m.map(w => w.id), ['1', '2', '9']);
  assert.equal(m[1].at, 2);                 // first occurrence wins
  const many = Array.from({ length: 600 }, (_, i) => ({ id: String(i), lv: 'n1', at: i }));
  assert.equal(mergeWordbook(many, []).length, 500);
  assert.deepEqual(mergeWordbook(undefined, undefined), []);
});
