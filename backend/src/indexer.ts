import fs from 'fs';
import path from 'path';
import yauzl from 'yauzl';
import { db } from './db';

interface SongMeta {
  shortid: string;
  title: string;
  artist: string;
  bpm: string;
  genre: string;
  version: string;
  cabinet: string;
  zip_file: string;
  folder_path: string;
  cover_file?: string;
  audio_file?: string;
  lv_1?: string;
  lv_2?: string;
  lv_3?: string;
  lv_4?: string;
  lv_5?: string;
  lv_6?: string;
  lv_7?: string;
}

export function indexZipFile(zipPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const zipName = path.basename(zipPath);
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        console.error(`Failed to open zip file ${zipName}:`, err);
        return resolve(0);
      }

      const folderEntries: Map<string, {
        maidataText?: string;
        coverFile?: string;
        audioFile?: string;
      }> = new Map();

      zipfile.readEntry();

      zipfile.on('entry', (entry: yauzl.Entry) => {
        const entryPath = entry.fileName;
        // Ignore directory entries
        if (/\/$/.test(entryPath)) {
          zipfile.readEntry();
          return;
        }

        const lastSlash = entryPath.lastIndexOf('/');
        const folderPath = lastSlash !== -1 ? entryPath.substring(0, lastSlash) : '';
        const fileName = lastSlash !== -1 ? entryPath.substring(lastSlash + 1) : entryPath;

        if (!folderEntries.has(folderPath)) {
          folderEntries.set(folderPath, {});
        }
        const current = folderEntries.get(folderPath)!;

        if (fileName === 'maidata.txt') {
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err || !readStream) {
              zipfile.readEntry();
              return;
            }
            const chunks: Buffer[] = [];
            readStream.on('data', (chunk) => chunks.push(chunk));
            readStream.on('end', () => {
              current.maidataText = Buffer.concat(chunks).toString('utf-8');
              zipfile.readEntry();
            });
            readStream.on('error', () => zipfile.readEntry());
          });
        } else {
          const lower = fileName.toLowerCase();
          if (lower === 'bg.png' || lower === 'bg.jpg' || lower === 'bg.jpeg') {
            current.coverFile = fileName;
          } else if (lower === 'track.mp3' || lower === 'track.ogg') {
            current.audioFile = fileName;
          }
          zipfile.readEntry();
        }
      });

      zipfile.on('end', () => {
        const songsToInsert: SongMeta[] = [];

        for (const [folderPath, data] of folderEntries.entries()) {
          if (!data.maidataText) continue;

          const meta: Partial<SongMeta> = {
            zip_file: zipName,
            folder_path: folderPath,
            cover_file: data.coverFile,
            audio_file: data.audioFile,
          };

          for (const line of data.maidataText.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (trimmed.startsWith('&title=')) meta.title = trimmed.slice(7).trim();
            else if (trimmed.startsWith('&artist=')) meta.artist = trimmed.slice(8).trim();
            else if (trimmed.startsWith('&wholebpm=')) meta.bpm = trimmed.slice(10).trim();
            else if (trimmed.startsWith('&bpm=')) meta.bpm = trimmed.slice(5).trim();
            else if (trimmed.startsWith('&genre=')) meta.genre = trimmed.slice(7).trim();
            else if (trimmed.startsWith('&version=')) meta.version = trimmed.slice(9).trim();
            else if (trimmed.startsWith('&shortid=')) meta.shortid = trimmed.slice(9).trim();
            else if (trimmed.startsWith('&cabinet=')) meta.cabinet = trimmed.slice(9).trim();
            else if (trimmed.startsWith('&lv_1=')) meta.lv_1 = trimmed.slice(6).trim();
            else if (trimmed.startsWith('&lv_2=')) meta.lv_2 = trimmed.slice(6).trim();
            else if (trimmed.startsWith('&lv_3=')) meta.lv_3 = trimmed.slice(6).trim();
            else if (trimmed.startsWith('&lv_4=')) meta.lv_4 = trimmed.slice(6).trim();
            else if (trimmed.startsWith('&lv_5=')) meta.lv_5 = trimmed.slice(6).trim();
            else if (trimmed.startsWith('&lv_6=')) meta.lv_6 = trimmed.slice(6).trim();
            else if (trimmed.startsWith('&lv_7=')) meta.lv_7 = trimmed.slice(6).trim();
          }

          if (!meta.title) continue;

          // If shortid missing, fallback to folder name or hash
          if (!meta.shortid) {
            const parts = folderPath.split('/');
            meta.shortid = parts[parts.length - 1] || meta.title;
          }

          songsToInsert.push(meta as SongMeta);
        }

        const insertStmt = db.prepare(`
          INSERT INTO songs (
            shortid, title, artist, bpm, genre, version, cabinet,
            zip_file, folder_path, cover_file, audio_file,
            lv_1, lv_2, lv_3, lv_4, lv_5, lv_6, lv_7
          ) VALUES (
            @shortid, @title, @artist, @bpm, @genre, @version, @cabinet,
            @zip_file, @folder_path, @cover_file, @audio_file,
            @lv_1, @lv_2, @lv_3, @lv_4, @lv_5, @lv_6, @lv_7
          )
          ON CONFLICT(shortid) DO UPDATE SET
            title=excluded.title,
            artist=excluded.artist,
            bpm=excluded.bpm,
            genre=excluded.genre,
            version=excluded.version,
            cabinet=excluded.cabinet,
            zip_file=excluded.zip_file,
            folder_path=excluded.folder_path,
            cover_file=excluded.cover_file,
            audio_file=excluded.audio_file,
            lv_1=excluded.lv_1, lv_2=excluded.lv_2, lv_3=excluded.lv_3,
            lv_4=excluded.lv_4, lv_5=excluded.lv_5, lv_6=excluded.lv_6, lv_7=excluded.lv_7
        `);

        const insertMany = db.transaction((songs: SongMeta[]) => {
          for (const s of songs) {
            insertStmt.run({
              shortid: s.shortid,
              title: s.title,
              artist: s.artist || 'Unknown',
              bpm: s.bpm || '',
              genre: s.genre || 'maimai',
              version: s.version || '',
              cabinet: s.cabinet || 'SD',
              zip_file: s.zip_file,
              folder_path: s.folder_path,
              cover_file: s.cover_file || null,
              audio_file: s.audio_file || null,
              lv_1: s.lv_1 || '', lv_2: s.lv_2 || '', lv_3: s.lv_3 || '',
              lv_4: s.lv_4 || '', lv_5: s.lv_5 || '', lv_6: s.lv_6 || '', lv_7: s.lv_7 || ''
            });
          }
        });

        try {
          insertMany(songsToInsert);
          try { zipfile.close(); } catch {}
          resolve(songsToInsert.length);
        } catch (e) {
          console.error(`Error writing DB records for ${zipName}:`, e);
          try { zipfile.close(); } catch {}
          resolve(0);
        }
      });

      zipfile.on('error', (err) => {
        console.error(`Zipfile read error in ${zipName}:`, err);
        try { zipfile.close(); } catch {}
        resolve(0);
      });
    });
  });
}

export async function indexAllLocalZips(searchDirs: string | string[]): Promise<number> {
  const dirs = Array.isArray(searchDirs) ? searchDirs : [searchDirs];
  let totalSongs = 0;

  for (const searchDir of dirs) {
    console.log(`Scanning directory for chart zip archives: ${searchDir}`);
    if (!fs.existsSync(searchDir)) continue;

    const files = fs.readdirSync(searchDir);
    const zipFiles = files.filter(f => f.endsWith('.zip') && f !== 'log.zip');

    for (const zipName of zipFiles) {
      const fullPath = path.join(searchDir, zipName);
      const count = await indexZipFile(fullPath);
      console.log(`Indexed ${count} songs from ${zipName}`);
      totalSongs += count;
    }
  }

  db.prepare(`INSERT OR REPLACE INTO sync_state (key, value, updated_at) VALUES ('last_index', ?, CURRENT_TIMESTAMP)`)
    .run(new Date().toISOString());

  console.log(`Indexing complete! Total songs indexed: ${totalSongs}`);
  return totalSongs;
}
