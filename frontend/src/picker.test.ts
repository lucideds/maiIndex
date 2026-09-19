/**
 * Pick-mode self-check. Run with:  node --test src/picker.test.ts
 * (node 22 needs --experimental-strip-types; node 23+ strips types by default.)
 * Excluded from the app build via tsconfig "exclude" - it is a check, not app code.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableLevels,
  buildPool,
  chartFor,
  chartsFor,
  drawSong,
  formatLevel,
  isUtage,
  levelNum,
  poolOptions,
  defaultState,
  type PickSong,
} from './picker.ts';

const song = (over: Partial<PickSong> = {}): PickSong => ({
  id: 1,
  shortid: '1',
  title: 'Song',
  artist: 'Artist',
  bpm: '180',
  genre: 'maimai',
  version: 'maimai DX BUDDiES',
  cabinet: 'DX',
  ...over,
});

test('levels: displayed "+" reads as .7, fractions pass through, junk never matches', () => {
  assert.equal(levelNum('13+'), 13.7);
  assert.equal(levelNum('10.2'), 10.2);
  assert.equal(levelNum(' 11 '), 11);
  assert.ok(Number.isNaN(levelNum('')));
  assert.ok(Number.isNaN(levelNum(undefined)));
  assert.ok(Number.isNaN(levelNum('lv')));
  assert.equal(formatLevel(13.7), '13+');
  assert.equal(formatLevel(10.2), '10.2');
  assert.equal(formatLevel(12), '12');
});

test('chartFor: picks the in-range chart closest to the top of the range', () => {
  const s = song({ lv_3: '9', lv_4: '11', lv_5: '12' });
  assert.equal(chartFor(s, [11, 12])?.slot.label, 'MAS');
  assert.equal(chartFor(s, [11, 12])?.display, '12');
  assert.equal(chartFor(s, [11, 11])?.slot.label, 'EXP');
  assert.equal(chartFor(s, [13, 14]), null);
  assert.equal(chartFor(song({ lv_5: '13+' }), [13, 14])?.display, '13+');
});

test('2P: same song must satisfy both ranges, on separate charts', () => {
  const mixed = song({ lv_4: '12', lv_5: '13+' });
  const charts = chartsFor(mixed, [[11, 12], [13, 14]]);
  assert.deepEqual(charts?.map(c => `${c.slot.label} ${c.display}`), ['EXP 12', 'MAS 13+']);
  assert.equal(chartsFor(song({ lv_4: '11', lv_5: '12' }), [[11, 12], [13, 14]]), null);
});

test('pool: honours the ranges, the Utage toggle and this session history', () => {
  const catalog = [
    song({ shortid: 'a', lv_4: '12', lv_5: '13+' }),
    song({ shortid: 'b', lv_4: '11', lv_5: '12' }),
    song({ shortid: 'c', lv_7: '13', genre: '宴会場' }),
    song({ shortid: 'd', lv_5: '10' }),
  ];
  const opts = { ...poolOptions({ ...defaultState(), twoPlayer: true }), ranges: [[11, 12], [13, 14]] as const };
  assert.deepEqual(buildPool(catalog, { ...opts, ranges: [[11, 12], [13, 14]] }).map(s => s.shortid), ['a']);
  // 1P only needs one range satisfied -> b qualifies, d (10) still does not
  assert.deepEqual(buildPool(catalog, { ...opts, ranges: [[11, 12]] }).map(s => s.shortid), ['a', 'b']);
  assert.deepEqual(
    buildPool(catalog, { ...opts, ranges: [[11, 12], [13, 14]], sessionPlayed: { a: true } }),
    []
  );
  assert.deepEqual(
    buildPool(catalog, { ...opts, ranges: [[13, 13]], excludeUtage: false }).map(s => s.shortid),
    ['c']
  );
  assert.equal(isUtage(catalog[2]!), true);
  assert.equal(isUtage(song({ title: '[協]Love You[宴]' })), true);
});

test('drawSong: deterministic under an injected rng, never repeats, degrades cleanly', () => {
  const catalog = [
    song({ shortid: 'a', artist: 'X', lv_4: '12' }),
    song({ shortid: 'b', artist: 'X', lv_4: '12' }),
    song({ shortid: 'c', artist: 'Y', lv_4: '12' }),
  ];
  const base = { ...poolOptions({ ...defaultState() }), ranges: [[11, 12]] as const };
  const opts = { ...base, ranges: [[11, 12]] as [number, number][] };
  assert.equal(drawSong(catalog, opts, () => 0)?.shortid, 'a');
  assert.equal(drawSong(catalog, opts, () => 0.99)?.shortid, 'c');
  // a different artist is preferred when the pool allows it
  assert.equal(drawSong(catalog, { ...opts, avoidArtist: 'X' }, () => 0)?.shortid, 'c');
  // ...and the previous artist is allowed again when every alternative is gone
  assert.equal(drawSong(catalog.slice(0, 2), { ...opts, avoidArtist: 'X' }, () => 0)?.shortid, 'a');
  // the card on screen is never redrawn
  assert.equal(drawSong(catalog, { ...opts, avoidId: 'a' }, () => 0)?.shortid, 'b');
  assert.equal(drawSong([], opts, () => 0), null);
  assert.equal(drawSong(catalog, { ...opts, sessionPlayed: { a: true, b: true, c: true } }), null);
});

test('defaults: both ranges start at 11-12, so a mixed pair is one edit away', () => {
  assert.deepEqual(defaultState().ranges, [[11, 12], [11, 12]]);
  assert.equal(defaultState().excludeUtage, true);
});

test('availableLevels lists every real level, ascending and unique', () => {
  const levels = availableLevels([
    song({ lv_1: '1.0', lv_4: '12', lv_5: '13+' }),
    song({ lv_3: '10.2', lv_5: '12' }),
    song({ lv_5: '' }),
  ]);
  assert.deepEqual(levels, [1, 10.2, 12, 13.7]);
});
