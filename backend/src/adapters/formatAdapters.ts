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
  const lines = rawText.split(/\r?\n/);
  let title = meta.title || 'Maimai Chart';
  let artist = meta.artist || 'Unknown Artist';
  let author = 'Official';
  let firstOffset = 0;
  let currentBpm = 120;
  const inotes: Record<string, string> = {};

  let currentKey = '';
  let currentValue = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('&')) {
      if (currentKey && currentValue) {
        processHeader(currentKey, currentValue.trim());
      }
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        currentKey = trimmed.slice(1, eqIdx).toLowerCase();
        currentValue = trimmed.slice(eqIdx + 1);
      }
    } else if (currentKey) {
      currentValue += '\n' + line;
    }
  }
  if (currentKey && currentValue) {
    processHeader(currentKey, currentValue.trim());
  }

  function processHeader(key: string, val: string) {
    if (key === 'title') title = val || title;
    if (key === 'artist') artist = val || artist;
    if (key === 'des') author = val || author;
    if (key === 'first') firstOffset = parseFloat(val) || 0;
    if (key === 'bpm' || key === 'wholebpm') currentBpm = parseFloat(val) || currentBpm;
    if (key.startsWith('inote_')) inotes[key] = val;
  }

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

