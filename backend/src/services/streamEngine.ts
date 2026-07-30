import archiver from 'archiver';
import path from 'path';
import fs from 'fs';
import yauzl from 'yauzl';
import { Response } from 'express';
import { db } from '../db';
import { transformMaidata } from '../adapters/formatAdapters';

interface SongRecord {
  id: number;
  shortid: string;
  title: string;
  zip_file: string;
  folder_path: string;
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
  format: 'astrodx' | 'majdata' | 'raw',
  res: Response,
  dataDir: string,
  onProgress?: (currentSongTitle: string, processedCount: number, totalSongs: number) => void
) {
  if (songIds.length === 0) {
    res.status(400).json({ error: 'No song IDs provided for export.' });
    return;
  }

  // Fetch song details from DB
  const placeholders = songIds.map(() => '?').join(',');
  const songs = db.prepare(`SELECT id, shortid, title, zip_file, folder_path FROM songs WHERE shortid IN (${placeholders}) OR id IN (${placeholders})`)
    .all(...songIds, ...songIds) as SongRecord[];

  if (songs.length === 0) {
    res.status(404).json({ error: 'No matching songs found in database.' });
    return;
  }

  const totalSongs = songs.length;
  if (onProgress) {
    onProgress(songs[0].title, 0, totalSongs);
  }

  // Set response headers for download
  const isAstroDX = format === 'astrodx';
  const isSingleSong = songs.length === 1;

  let downloadFilename = `maimai_export_${format}.zip`;
  if (isAstroDX) {
    downloadFilename = isSingleSong ? `${sanitizeFilename(songs[0].title)}.adx` : `maimai_batch_export.adx`;
  } else if (isSingleSong) {
    downloadFilename = `${sanitizeFilename(songs[0].title)}.zip`;
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFilename)}"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (err) => {
    console.error('Archiver error:', err);
    if (!res.headersSent) res.status(500).end();
  });

  archive.pipe(res);

  // Group songs by zip_file to minimize file opening overhead
  const songsByZip = new Map<string, SongRecord[]>();
  for (const song of songs) {
    if (!songsByZip.has(song.zip_file)) {
      songsByZip.set(song.zip_file, []);
    }
    songsByZip.get(song.zip_file)!.push(song);
  }

  const processedFolderSet = new Set<string>();

  for (const [zipName, zipSongs] of songsByZip.entries()) {
    const zipPath = findZipFile(zipName, dataDir);
    if (!zipPath) {
      console.warn(`Zip file not found in any directory: ${zipName}`);
      continue;
    }

    await processZipForSongs(
      zipPath,
      zipSongs,
      format,
      archive,
      isSingleSong,
      totalSongs,
      processedFolderSet,
      onProgress
    );
  }

  if (onProgress) {
    onProgress('Finalizing archive package...', totalSongs, totalSongs);
  }

  await archive.finalize();
}

function processZipForSongs(
  zipPath: string,
  songs: SongRecord[],
  format: 'astrodx' | 'majdata' | 'raw',
  archive: archiver.Archiver,
  isSingleSong: boolean,
  totalSongs: number,
  processedFolderSet: Set<string>,
  onProgress?: (currentSongTitle: string, processedCount: number, totalSongs: number) => void
): Promise<void> {
  return new Promise((resolve) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        console.error(`Failed to open zip file ${zipPath}:`, err);
        return resolve();
      }

      // Map folder_path -> { targetFolderName, title }
      const folderMap = new Map<string, { targetFolderName: string; title: string }>();
      for (const song of songs) {
        const cleanTitle = sanitizeFilename(song.title) || song.shortid;
        const targetFolderName = `${song.shortid}_${cleanTitle}`;
        folderMap.set(song.folder_path, { targetFolderName, title: song.title });
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

        const songMeta = folderMap.get(matchedSongFolder)!;

        if (!processedFolderSet.has(matchedSongFolder)) {
          processedFolderSet.add(matchedSongFolder);
          if (onProgress) {
            onProgress(songMeta.title, processedFolderSet.size, totalSongs);
          }
        }

        const targetFolderName = songMeta.targetFolderName;

        // Determine destination path inside output archive:
        let destEntryPath: string;
        if (format === 'majdata' && isSingleSong) {
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
              const transformed = transformMaidata(rawText, format);
              archive.append(transformed, { name: destEntryPath });
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
