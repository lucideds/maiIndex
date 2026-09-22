import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import yauzl from 'yauzl';
import { db } from '../db';
import { parseRange } from '../httpRange';
import { streamBatchExport } from '../services/streamEngine';

export function createSongRouter(dataDir: string) {
  const router = Router();
  let activeExports = 0;
  const maxConcurrentExports = parseInt(process.env.MAX_CONCURRENT_EXPORTS || '5', 10);
  const maxBatchSongs = parseInt(process.env.MAX_BATCH_SONGS || '100', 10);
  const dataDirs = [
    dataDir,
    '/data/cache',
    '/data/cache_local',
    path.resolve(__dirname, '../..')
  ];

  function findZipPath(zipName: string): string | null {
    for (const d of dataDirs) {
      const p = path.join(d, zipName);
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  // Search & Filter Songs
  router.get('/songs', (req: Request, res: Response) => {
    try {
      const search = (req.query.search as string || '').trim();
      const version = (req.query.version as string || '').trim();
      const genre = (req.query.genre as string || '').trim();
      const cabinet = (req.query.cabinet as string || '').trim();
      const sort = (req.query.sort as string || 'id_asc').trim();
      const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
      // Pick mode loads the whole catalog (1804 songs) to draw from, so the clamp has
      // to admit more than a page of 24. Still bounded - this is not an open-ended query.
      const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit as string || '24', 10)));
      const offset = (page - 1) * limit;

      let whereClauses: string[] = [];
      let params: any[] = [];

      if (search) {
        whereClauses.push('(title LIKE ? OR artist LIKE ? OR shortid LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      if (version) {
        whereClauses.push('version = ?');
        params.push(version);
      }

      if (genre) {
        whereClauses.push('genre = ?');
        params.push(genre);
      }

      if (cabinet) {
        whereClauses.push('cabinet = ?');
        params.push(cabinet);
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      let orderBySql = 'id ASC';
      if (sort === 'id_desc') {
        orderBySql = 'id DESC';
      } else if (sort === 'title_asc') {
        orderBySql = 'title ASC';
      } else if (sort === 'title_desc') {
        orderBySql = 'title DESC';
      } else if (sort === 'diff_desc') {
        orderBySql = `CAST(REPLACE(COALESCE(NULLIF(lv_7, ''), NULLIF(lv_6, ''), NULLIF(lv_5, ''), NULLIF(lv_4, ''), NULLIF(lv_3, ''), NULLIF(lv_2, ''), NULLIF(lv_1, ''), '0'), '+', '.7') AS FLOAT) DESC, id ASC`;
      } else if (sort === 'diff_asc') {
        orderBySql = `CAST(REPLACE(COALESCE(NULLIF(lv_1, ''), NULLIF(lv_2, ''), NULLIF(lv_3, ''), NULLIF(lv_4, ''), NULLIF(lv_5, ''), NULLIF(lv_6, ''), NULLIF(lv_7, ''), '99'), '+', '.7') AS FLOAT) ASC, id ASC`;
      } else if (sort === 'bpm_desc') {
        orderBySql = `CAST(REPLACE(bpm, '~', '') AS FLOAT) DESC, id ASC`;
      } else if (sort === 'bpm_asc') {
        orderBySql = `CAST(REPLACE(bpm, '~', '') AS FLOAT) ASC, id ASC`;
      }

      const countRow = db.prepare(`SELECT COUNT(*) as count FROM songs ${whereSql}`).get(...params) as { count: number };
      const total = countRow ? countRow.count : 0;

      const songs = db.prepare(`
        SELECT id, shortid, title, artist, bpm, genre, version, cabinet,
               zip_file, cover_file, audio_file,
               lv_1, lv_2, lv_3, lv_4, lv_5, lv_6, lv_7
        FROM songs
        ${whereSql}
        ORDER BY ${orderBySql}
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset);

      res.json({
        songs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      });
    } catch (e) {
      console.error('Error fetching songs:', e);
      res.status(500).json({ error: 'Failed to fetch songs.' });
    }
  });

  // Get Version List
  router.get('/songs/versions', (req: Request, res: Response) => {
    try {
      const rows = db.prepare(`
        SELECT version, COUNT(*) as count
        FROM songs
        WHERE version IS NOT NULL AND version != ''
        GROUP BY version
        ORDER BY version ASC
      `).all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch versions.' });
    }
  });

  // Get Genre List
  router.get('/songs/genres', (req: Request, res: Response) => {
    try {
      const rows = db.prepare(`
        SELECT genre, COUNT(*) as count
        FROM songs
        WHERE genre IS NOT NULL AND genre != ''
        GROUP BY genre
        ORDER BY genre ASC
      `).all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch genres.' });
    }
  });

  // Get Single Song
  router.get('/songs/:id', (req: Request, res: Response) => {
    try {
      const song = db.prepare(`SELECT * FROM songs WHERE id = ? OR shortid = ?`).get(req.params.id, req.params.id);
      if (!song) {
        res.status(404).json({ error: 'Song not found.' });
        return;
      }
      res.json(song);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch song details.' });
    }
  });

  // Stream Cover Image
  router.get('/songs/:id/cover', (req: Request, res: Response) => {
    const song = db.prepare(`SELECT zip_file, folder_path, cover_file FROM songs WHERE id = ? OR shortid = ?`)
      .get(req.params.id, req.params.id) as any;

    if (!song || !song.cover_file) {
      res.status(404).end();
      return;
    }

    const zipPath = findZipPath(song.zip_file);
    if (!zipPath) {
      res.status(404).end();
      return;
    }

    const targetEntry = `${song.folder_path}/${song.cover_file}`;
    streamEntryFromZip(req, zipPath, targetEntry, res, song.cover_file.endsWith('.png') ? 'image/png' : 'image/jpeg');
  });

  // Stream Audio Preview
  router.get('/songs/:id/audio', (req: Request, res: Response) => {
    const song = db.prepare(`SELECT zip_file, folder_path, audio_file FROM songs WHERE id = ? OR shortid = ?`)
      .get(req.params.id, req.params.id) as any;

    if (!song || !song.audio_file) {
      res.status(404).end();
      return;
    }

    const zipPath = findZipPath(song.zip_file);
    if (!zipPath) {
      res.status(404).end();
      return;
    }

    const targetEntry = `${song.folder_path}/${song.audio_file}`;
    streamEntryFromZip(req, zipPath, targetEntry, res, song.audio_file.endsWith('.ogg') ? 'audio/ogg' : 'audio/mpeg');
  });

  // Batch Export Endpoint
  router.post('/export', async (req: Request, res: Response) => {
    const { songIds, format } = req.body;

    if (!Array.isArray(songIds) || songIds.length === 0) {
      res.status(400).json({ error: 'Please select at least one song to export.' });
      return;
    }

    if (songIds.length > maxBatchSongs) {
      res.status(400).json({
        error: `Batch limit exceeded. Maximum allowed songs per export is ${maxBatchSongs}.`
      });
      return;
    }

    if (activeExports >= maxConcurrentExports) {
      res.status(503).json({
        error: 'Server busy. Too many active export streams. Please try again shortly.'
      });
      return;
    }

    const validFormat = ['astrodx', 'majdata', 'raw', 'sonolus'].includes(format) ? format : 'astrodx';

    activeExports++;
    try {
      await streamBatchExport(songIds, validFormat as any, res, dataDir);
    } finally {
      activeExports--;
    }
  });

  return router;
}

// ponytail: zip entries are buffered whole so we can honour Range requests
// (mobile Safari refuses to seek media served without byte ranges). Preview
// audio and covers are a few MB; upgrade to on-the-fly entry slicing if entries ever get huge.
async function streamEntryFromZip(req: Request, zipPath: string, entryPath: string, res: Response, contentType: string) {
  const buf = await readZipEntry(zipPath, entryPath);
  if (!buf) {
    res.status(404).end();
    return;
  }

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Accept-Ranges', 'bytes');

  const range = parseRange(req.headers.range, buf.length);
  if (range === 'unsatisfiable') {
    res.setHeader('Content-Range', `bytes */${buf.length}`);
    res.status(416).end();
    return;
  }
  if (range) {
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${buf.length}`);
    res.setHeader('Content-Length', String(range.end - range.start + 1));
    res.status(206).end(buf.subarray(range.start, range.end + 1));
    return;
  }
  res.setHeader('Content-Length', String(buf.length));
  res.end(buf);
}

function readZipEntry(zipPath: string, entryPath: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        resolve(null);
        return;
      }

      let settled = false;
      const done = (value: Buffer | null) => {
        if (settled) return;
        settled = true;
        try { zipfile.close(); } catch {}
        resolve(value);
      };

      zipfile.on('entry', (entry) => {
        if (entry.fileName !== entryPath) {
          zipfile.readEntry();
          return;
        }
        zipfile.openReadStream(entry, (err, readStream) => {
          if (err || !readStream) {
            done(null);
            return;
          }
          const chunks: Buffer[] = [];
          readStream.on('data', (chunk) => chunks.push(chunk));
          readStream.on('end', () => done(Buffer.concat(chunks)));
          readStream.on('error', () => done(null));
        });
      });
      zipfile.on('end', () => done(null));
      zipfile.on('error', () => done(null));
      zipfile.readEntry();
    });
  });
}
