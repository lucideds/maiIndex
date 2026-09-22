import assert from 'node:assert';
import { parseRange } from './httpRange';

// No / unsupported header -> full body.
assert.strictEqual(parseRange(undefined, 1000), null);
assert.strictEqual(parseRange('items=0-99', 1000), null);
assert.strictEqual(parseRange('bytes=', 1000), null);
assert.strictEqual(parseRange('bytes=0-1,4-5', 1000), null); // multi-range: ignore, full body

// Basic ranges + clamping of an over-long end.
assert.deepStrictEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 });
assert.deepStrictEqual(parseRange('bytes=500-', 1000), { start: 500, end: 999 });
assert.deepStrictEqual(parseRange('bytes=0-9999', 1000), { start: 0, end: 999 });
assert.deepStrictEqual(parseRange('bytes=0-0', 1000), { start: 0, end: 0 });

// Suffix range: last N bytes.
assert.deepStrictEqual(parseRange('bytes=-100', 1000), { start: 900, end: 999 });

// Unsatisfiable -> 416.
assert.strictEqual(parseRange('bytes=1000-1200', 1000), 'unsatisfiable');
assert.strictEqual(parseRange('bytes=900-800', 1000), 'unsatisfiable');
assert.strictEqual(parseRange('bytes=-0', 1000), 'unsatisfiable');

console.log('httpRange.test: all assertions passed');
