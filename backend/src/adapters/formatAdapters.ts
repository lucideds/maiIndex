import zlib from 'zlib';

export type ExportFormat = 'astrodx' | 'majdata' | 'raw' | 'sonolus';

export function transformMaidata(rawText: string, format: ExportFormat): string {
  if (format === 'raw') return rawText;

  const lines = rawText.split(/\r?\n/);
  const result: string[] = [];
  let hasBpm = false;
  let wholeBpmValue = '';
  let hasFirst = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('&bpm=')) {
      hasBpm = true;
      result.push(line);
    } else if (trimmed.startsWith('&wholebpm=')) {
      wholeBpmValue = trimmed.slice(10).trim();
      result.push(line);
    } else if (trimmed.startsWith('&first=')) {
      hasFirst = true;
      result.push(line);
    } else {
      result.push(line);
    }
  }

  if (format === 'astrodx') {
    if (!hasBpm && wholeBpmValue) {
      result.unshift(`&bpm=${wholeBpmValue}`);
    }
    if (!hasFirst) {
      result.unshift(`&first=0`);
    }
  }

  return result.join('\n');
}

export interface SonolusExportResult {
  levelItemJson: string;
  levelDataGzip: Buffer;
}

export function getSonolusPackageInfoJson(title?: string): string {
  return JSON.stringify(
    {
      version: '1.0.0',
      title: title || 'Maimai Songs Export',
      author: 'MaiIndex',
      description: 'Exported Maimai chart collection package for Sonolus'
    },
    null,
    2
  );
}

export function getSonolusDbJson(levelItems: any[]): string {
  return JSON.stringify(
    {
      version: 1,
      levels: levelItems
    },
    null,
    2
  );
}

export function transformToSonolusLevel(
  rawText: string,
  meta: { shortid?: string; title?: string; artist?: string; cover_file?: string; audio_file?: string; folder_path?: string }
): SonolusExportResult {
  const header = parseMaidataHeader(rawText);
  const title = header.title || meta.title || 'Maimai Chart';
  const artist = header.artist || meta.artist || 'Unknown Artist';
  const author = header.charter || 'Official';
  const firstOffset = header.first;
  const currentBpm = header.bpm;
  const inotes = header.inotes;

  // Select chart difficulty (prefer inote_5 / Master, fallback to highest available)
  const chartText = inotes['inote_5'] || inotes['inote_6'] || inotes['inote_4'] || inotes['inote_3'] || inotes['inote_2'] || inotes['inote_1'] || '';

  const entities: any[] = [];
  parseSimaiNotes(chartText, currentBpm, firstOffset, entities);

  const levelDataObj = {
    bgmOffset: firstOffset,
    entities
  };

  const levelDataGzip = zlib.gzipSync(Buffer.from(JSON.stringify(levelDataObj, null, 2)));

  const coverUrl = meta.cover_file || 'bg.png';
  const audioUrl = meta.audio_file || 'track.mp3';

  const levelItemObj = {
    name: meta.shortid || 'maimai_chart',
    version: 1,
    rating: 10,
    engine: 'maimai',
    useSkin: { useDefault: true },
    useBackground: { useDefault: true },
    useEffect: { useDefault: true },
    useParticle: { useDefault: true },
    title,
    artists: artist,
    author,
    tags: [],
    cover: { hash: '', url: coverUrl },
    bgm: { hash: '', url: audioUrl },
    preview: { hash: '', url: audioUrl },
    data: { hash: '', url: 'LevelData' }
  };

  return {
    levelItemJson: JSON.stringify(levelItemObj, null, 2),
    levelDataGzip
  };
}

export interface MaidataHeader {
  title: string;
  artist: string;
  charter: string;
  bpm: number;
  first: number;
  inotes: Record<string, string>;
}

/**
 * &key=value headers; a value continues across lines until the next &key.
 * Shared by the Sonolus transform and the /songs/:id/detail endpoint.
 */
export function parseMaidataHeader(rawText: string): MaidataHeader {
  const header: MaidataHeader = { title: '', artist: '', charter: '', bpm: 120, first: 0, inotes: {} };
  let currentKey = '';
  let currentValue = '';

  const flush = () => {
    if (!currentKey || !currentValue) return;
    const val = currentValue.trim();
    if (currentKey === 'title') header.title = val || header.title;
    if (currentKey === 'artist') header.artist = val || header.artist;
    if (currentKey === 'des') header.charter = val || header.charter;
    if (currentKey === 'first') header.first = parseFloat(val) || 0;
    if (currentKey === 'bpm' || currentKey === 'wholebpm') header.bpm = parseFloat(val) || header.bpm;
    if (currentKey.startsWith('inote_')) header.inotes[currentKey] = val;
  };

  for (const line of rawText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('&')) {
      flush();
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        currentKey = trimmed.slice(1, eqIdx).toLowerCase();
        currentValue = trimmed.slice(eqIdx + 1);
      }
    } else if (currentKey) {
      currentValue += '\n' + line;
    }
  }
  flush();
  return header;
}

/**
 * Note objects in one simai chart stream: tap=1, hold=1, slide=1, touch=1.
 * Lane digits inside [h:mm] brackets are timings, not notes; C is standalone
 * while A/B/D/E carry a lane digit. Self-check: formatAdapters.test.ts.
 */
export function countChartNotes(chartText: string): number {
  if (!chartText) return 0;
  let notes = 0;
  for (const block of chartText.split(',')) {
    let pos = 0;
    while (pos < block.length) {
      const ch = block[pos];
      if (ch === '(') { const e = block.indexOf(')', pos); pos = e === -1 ? block.length : e + 1; continue; }
      if (ch === '{') { const e = block.indexOf('}', pos); pos = e === -1 ? block.length : e + 1; continue; }
      if (ch === '[') { const e = block.indexOf(']', pos); pos = e === -1 ? block.length : e + 1; continue; }
      if (ch >= '1' && ch <= '8') {
        if (block[pos + 1] === 'h') { notes++; pos += 2; continue; }          // hold
        if (block[pos + 1] === '-') {                                          // slide: 1-4[..], 1-(4)[..]
          notes++; pos += 2;
          if (block[pos] >= '1' && block[pos] <= '8') pos++;
          else if (block[pos] === '(') { const e = block.indexOf(')', pos); pos = e === -1 ? block.length : e + 1; }
          if (block[pos] === 'h') pos++;
          continue;
        }
        notes++; pos++; continue;                                              // tap
      }
      if (/[A-Ea-e]/.test(ch)) {                                               // touch
        notes++;
        const laneLetter = ch.toLowerCase() !== 'c';
        pos += laneLetter && /[1-8]/.test(block[pos + 1] ?? '') ? 2 : 1;
        continue;
      }
      pos++;
    }
  }
  return notes;
}

/**
 * Chart length in seconds: one comma-separated block is one subdivision step, so
 * the total is the sum of (60/bpm) * (4/subdivision) over every block. BPM and
 * subdivision can change mid-chart via ({bpm}) and {n}. Self-check: formatAdapters.test.ts.
 */
export function chartDurationSeconds(chartText: string, initialBpm: number): number {
  if (!chartText) return 0;
  let bpm = initialBpm > 0 ? initialBpm : 120;
  let subdivision = 4;
  let seconds = 0;

  for (const block of chartText.split(',')) {
    for (let i = 0; i < block.length; i++) {
      const ch = block[i];
      if (ch === '(') {
        const end = block.indexOf(')', i);
        if (end !== -1) {
          // ({240}) wraps the value in braces - parseFloat("{240") is NaN.
          const v = parseFloat(block.slice(i + 1, end).replace(/[{}]/g, ''));
          if (v > 0) bpm = v;
          i = end;
        }
      } else if (ch === '{') {
        const end = block.indexOf('}', i);
        if (end !== -1) {
          const v = parseInt(block.slice(i + 1, end), 10);
          if (v > 0) subdivision = v;
          i = end;
        }
      }
    }
    seconds += (60 / bpm) * (4 / subdivision);
  }
  return seconds;
}

function parseSimaiNotes(chartText: string, initialBpm: number, firstOffset: number, entities: any[]) {
  if (!chartText) return;

  let bpm = initialBpm > 0 ? initialBpm : 120;
  let currentSubdivision = 4;
  let currentTime = firstOffset;

  // Split into timing blocks ending with comma
  const blocks = chartText.split(',');

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    let pos = 0;
    while (pos < trimmed.length) {
      // Check for BPM change: ({120})
      if (trimmed[pos] === '(') {
        const endParen = trimmed.indexOf(')', pos);
        if (endParen !== -1) {
          const bpmVal = parseFloat(trimmed.slice(pos + 1, endParen));
          if (!isNaN(bpmVal) && bpmVal > 0) bpm = bpmVal;
          pos = endParen + 1;
          continue;
        }
      }

      // Check for subdivision change: {4}, {8}, {16}
      if (trimmed[pos] === '{') {
        const endBrace = trimmed.indexOf('}', pos);
        if (endBrace !== -1) {
          const subVal = parseInt(trimmed.slice(pos + 1, endBrace), 10);
          if (!isNaN(subVal) && subVal > 0) currentSubdivision = subVal;
          pos = endBrace + 1;
          continue;
        }
      }

      // Read note tokens (1-8, touch buttons C, A1-A8, B1-B8, E1-E8)
      const ch = trimmed[pos];
      if (/[1-8]/.test(ch)) {
        const lane = parseInt(ch, 10);
        let noteType = 'TapNote';

        // Check if hold note: e.g., 1h[4:1]
        if (pos + 1 < trimmed.length && trimmed[pos + 1] === 'h') {
          noteType = 'HoldNote';
        }

        entities.push({
          archetype: noteType,
          data: [
            { name: 'time', value: currentTime },
            { name: 'lane', value: lane }
          ]
        });
        pos++;
      } else if (/[A-Ea-e]/.test(ch)) {
        // Touch note: C, A1, B2, etc.
        entities.push({
          archetype: 'TouchNote',
          data: [
            { name: 'time', value: currentTime },
            { name: 'lane', value: 1 }
          ]
        });
        pos++;
      } else {
        pos++;
      }
    }

    // Advance time after comma block
    const beatDuration = (60 / bpm) * (4 / currentSubdivision);
    currentTime += beatDuration;
  }
}

