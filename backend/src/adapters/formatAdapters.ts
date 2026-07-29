export function transformMaidata(rawText: string, format: 'astrodx' | 'majdata' | 'raw'): string {
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

  if (format === 'majdata') {
    return result.join('\n');
  }

  return result.join('\n');
}
