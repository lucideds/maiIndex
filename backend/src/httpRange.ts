// Single-range parsing for media seeking (RFC 7233).
// Multi-range or unsupported units answer with the full body, which RFC 7233 permits.
export type ByteRange = { start: number; end: number } | 'unsatisfiable' | null;

export function parseRange(header: string | undefined, size: number): ByteRange {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;

  let start: number;
  let end: number;
  if (m[1] === '') {
    // Suffix form: last N bytes.
    const suffix = Number(m[2]);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Number(m[2]);
  }

  if (start >= size || end < start) return 'unsatisfiable';
  return { start, end: Math.min(end, size - 1) };
}
