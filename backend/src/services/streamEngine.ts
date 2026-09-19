import archiver from 'archiver';
import path from 'path';
import fs from 'fs';
import yauzl from 'yauzl';
import { Response } from 'express';
import { db } from '../db';
import { ExportFormat, getSonolusDbJson, getSonolusPackageInfoJson, transformMaidata, transformToSonolusLevel } from '../adapters/formatAdapters';

interface SongRecord {
  id: number;
  shortid: string;
  title: string;
  artist?: string;
  zip_file: string;
  folder_path: string;
  cover_file?: string;
  audio_file?: string;
}

function findZipFile(zipName: string, primaryDataDir: string): string | null {
  const searchDirs = [
    primaryDataDir,
    '/data/cache',
    '/data/cache_local',
    path.resolve(__dirname, '../../..'),
    path.resolve(__dirname, '../..')
  ];

  for (const dir of searchDirs) {
    if (dir && fs.existsSync(dir)) {
      const fullPath = path.join(dir, zipName);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }
  return null;
}

export async function streamBatchExport(
  songIds: (string | number)[],
  format: ExportFormat,
  res: Response,
  dataDir: string
) {
  if (songIds.length === 0) {
    res.status(400).json({ error: 'No song IDs provided for export.' });
    return;
  }

  // Fetch song details from DB
  const placeholders = songIds.map(() => '?').join(',');
  const songs = db.prepare(`SELECT id, shortid, title, artist, zip_file, folder_path, cover_file, audio_file FROM songs WHERE shortid IN (${placeholders}) OR id IN (${placeholders})`)
    .all(...songIds, ...songIds) as SongRecord[];

  if (songs.length === 0) {
    res.status(404).json({ error: 'No matching songs found in database.' });
    return;
  }

  // Set response headers for download
  const isAstroDX = format === 'astrodx';
  const isSonolus = format === 'sonolus';
  const isSingleSong = songs.length === 1;

  let downloadFilename = `maimai_export_${format}.zip`;
  if (isAstroDX) {
    downloadFilename = isSingleSong ? `${sanitizeFilename(songs[0].title)}.adx` : `maimai_batch_export.adx`;
  } else if (isSonolus) {
    downloadFilename = isSingleSong ? `${sanitizeFilename(songs[0].title)}.scp` : `maimai_batch_export.scp`;
  } else if (isSingleSong) {
    downloadFilename = `${sanitizeFilename(songs[0].title)}.zip`;
  }

  res.setHeader('Content-Type', isSonolus ? 'application/octet-stream' : 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFilename)}"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (err) => {
    console.error('Archiver error:', err);
    if (!res.headersSent) res.status(500).end();
  });

  archive.pipe(res);

  const sonolusLevels: any[] = [];

  if (isSonolus) {
    archive.append(getSonolusPackageInfoJson(isSingleSong ? songs[0].title : undefined), { name: 'info.json' });
  }

  // Group songs by zip_file to minimize file opening overhead
  const songsByZip = new Map<string, SongRecord[]>();
  for (const song of songs) {
    if (!songsByZip.has(song.zip_file)) {
      songsByZip.set(song.zip_file, []);
    }
    songsByZip.get(song.zip_file)!.push(song);
  }

  for (const [zipName, zipSongs] of songsByZip.entries()) {
    const zipPath = findZipFile(zipName, dataDir);
    if (!zipPath) {
      console.warn(`Zip file not found in any directory: ${zipName}`);
      continue;
    }

    await processZipForSongs(zipPath, zipSongs, format, archive, isSingleSong, sonolusLevels);
  }

  if (isSonolus) {
    archive.append(getSonolusDbJson(sonolusLevels), { name: 'db.json' });
  }

  await archive.finalize();
}

function processZipForSongs(
  zipPath: string,
  songs: SongRecord[],
  format: ExportFormat,
  archive: archiver.Archiver,
  isSingleSong: boolean,
  sonolusLevels: any[]
): Promise<void> {
  return new Promise((resolve) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        console.error(`Failed to open zip file ${zipPath}:`, err);
        return resolve();
      }

      // Map folder_path -> { targetFolderName, songRecord }
      const folderMap = new Map<string, { targetFolderName: string; song: SongRecord }>();
      for (const song of songs) {
        const cleanTitle = sanitizeFilename(song.title) || song.shortid;
        const targetFolderName = `${song.shortid}_${cleanTitle}`;
        folderMap.set(song.folder_path, { targetFolderName, song });
      }

      zipfile.readEntry();

      zipfile.on('entry', (entry: yauzl.Entry) => {
        const entryPath = entry.fileName;
        if (/\/$/.test(entryPath)) {
          zipfile.readEntry();
          return;
        }

        // Match entry path to any song's folder_path
        let matchedSongFolder: string | null = null;
        let relativePathInSongFolder = '';

        for (const folderPath of folderMap.keys()) {
          if (entryPath === folderPath || entryPath.startsWith(folderPath + '/')) {
            matchedSongFolder = folderPath;
            relativePathInSongFolder = entryPath === folderPath ? '' : entryPath.slice(folderPath.length + 1);
            break;
          }
        }

        if (!matchedSongFolder || !relativePathInSongFolder) {
          zipfile.readEntry();
          return;
        }

        const { targetFolderName, song } = folderMap.get(matchedSongFolder)!;

        // Determine destination path inside output archive:
        let destEntryPath: string;
        if (format === 'sonolus') {
          destEntryPath = `levels/${targetFolderName}/${relativePathInSongFolder}`;
        } else if (format === 'majdata' && isSingleSong) {
          destEntryPath = relativePathInSongFolder;
        } else {
          destEntryPath = `${targetFolderName}/${relativePathInSongFolder}`;
        }

        zipfile.openReadStream(entry, (err, readStream) => {
          if (err || !readStream) {
            zipfile.readEntry();
            return;
          }

          if (relativePathInSongFolder === 'maidata.txt') {
            const chunks: Buffer[] = [];
            readStream.on('data', (chunk) => chunks.push(chunk));
            readStream.on('end', () => {
              const rawText = Buffer.concat(chunks).toString('utf-8');

              if (format === 'sonolus') {
                const sonolusRes = transformToSonolusLevel(rawText, song);
                const sonolusFolder = `levels/${targetFolderName}`;
                archive.append(sonolusRes.levelItemJson, { name: `${sonolusFolder}/item.json` });
                archive.append(sonolusRes.levelItemJson, { name: `${sonolusFolder}/LevelItem.json` });
                archive.append(sonolusRes.levelDataGzip, { name: `${sonolusFolder}/LevelData` });
                archive.append(rawText, { name: destEntryPath });

                const itemObj = JSON.parse(sonolusRes.levelItemJson);
                itemObj.cover = { hash: '', url: `${sonolusFolder}/${song.cover_file || 'bg.png'}` };
                itemObj.bgm = { hash: '', url: `${sonolusFolder}/${song.audio_file || 'track.mp3'}` };
                itemObj.preview = { hash: '', url: `${sonolusFolder}/${song.audio_file || 'track.mp3'}` };
                itemObj.data = { hash: '', url: `${sonolusFolder}/LevelData` };
                sonolusLevels.push(itemObj);
              } else {
                const transformed = transformMaidata(rawText, format);
                archive.append(transformed, { name: destEntryPath });
              }
              zipfile.readEntry();
            });
            readStream.on('error', () => zipfile.readEntry());
          } else {
            archive.append(readStream, { name: destEntryPath });
            readStream.on('end', () => zipfile.readEntry());
            readStream.on('error', () => zipfile.readEntry());
          }
        });
      });

      zipfile.on('end', () => {
        try { zipfile.close(); } catch {}
        resolve();
      });
      zipfile.on('error', (e) => {
        console.error('Error during zip stream processing:', e);
        try { zipfile.close(); } catch {}
        resolve();
      });
    });
  });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}
