/**
 * Note-count / maidata-header self-check. Run with:
 *   npx -y tsx backend/src/adapters/formatAdapters.test.ts
 */
import assert from 'node:assert';
import { chartDurationSeconds, countChartNotes, parseMaidataHeader } from './formatAdapters';

// One note object per tap/hold/slide/touch; bracket contents are timings.
assert.strictEqual(countChartNotes('1,2,3,4'), 4);
assert.strictEqual(countChartNotes('1h[4:1],2h[8:1]'), 2);
assert.strictEqual(countChartNotes('1-4[4:0]'), 1);
assert.strictEqual(countChartNotes('1-(4)[b],5-6[16:0]'), 2);
assert.strictEqual(countChartNotes('C,A1,B8,1C2'), 6);
assert.strictEqual(countChartNotes('({120}){4}1,2'), 2);
assert.strictEqual(countChartNotes(''), 0);

// Multi-line inote values, header fields, per-difficulty streams.
const header = parseMaidataHeader(
  [
    '&title=Foo', '&artist=Bar', '&des=Charter', '&bpm=180', '&first=0.5',
    '&lv_5=13', '&inote_5=', '1h[4:1],2-3[4:0],4', '&inote_4=', 'C,1',
  ].join('\n')
);
assert.strictEqual(header.title, 'Foo');
assert.strictEqual(header.artist, 'Bar');
assert.strictEqual(header.charter, 'Charter');
assert.strictEqual(header.bpm, 180);
assert.strictEqual(header.first, 0.5);
assert.strictEqual(countChartNotes(header.inotes['inote_5']), 3);
assert.strictEqual(countChartNotes(header.inotes['inote_4']), 2);

// Chart length: one block per subdivision step at the running bpm/subdivision.
const near = (actual: number, expected: number, msg: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${msg}: got ${actual}, want ${expected}`);

near(chartDurationSeconds('', 120), 0, 'empty chart');
near(chartDurationSeconds('1,2,3,4', 120), 2, '4 quarter notes at 120bpm = 2s');
near(chartDurationSeconds('{8}1,2', 120), 0.5, '2 eighth notes at 120bpm = 0.5s');
near(chartDurationSeconds('({240})1,2', 120), 0.5, 'mid-chart bpm change applies from that block');
near(chartDurationSeconds('{16}1,2,3,4', 120), 0.5, 'sixteenths');
// Empty blocks still consume time - that is what makes the measure a measure.
near(chartDurationSeconds('1,,3', 120), 1.5, 'rests advance the clock');
near(chartDurationSeconds('1,2', 0), 1, 'zero bpm falls back to 120');

console.log('formatAdapters self-check: all assertions passed');
