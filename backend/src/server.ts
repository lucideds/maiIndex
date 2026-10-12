import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import dotenv from 'dotenv';
import { db } from './db';
import { indexAllLocalZips } from './indexer';
import { initGithubSync } from './services/githubSync';
import { createSongRouter } from './routes/songs';
import { createDocsRouter } from './docs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8763;

const apiMaxRequests = parseInt(process.env.RATE_LIMIT_API_MAX || '200', 10);
const apiWindowMs = parseInt(process.env.RATE_LIMIT_API_WINDOW_MS || '60000', 10);

const apiLimiter = rateLimit({
  windowMs: apiWindowMs,
  max: apiMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many API requests. Please try again shortly.' }
});

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use('/api', apiLimiter);

// Locate chart data directories
const primaryDir = process.env.DATA_CACHE_DIR || path.resolve(__dirname, '../..');
const localMountDir = '/data/cache_local';
const searchDirs = [primaryDir, localMountDir, path.resolve(__dirname, '../..')].filter(Boolean);

console.log(`Using data directories for chart archives: ${searchDirs.join(', ')}`);

// Health check endpoint
app.get('/health', (req, res) => {
  const songCount = (db.prepare('SELECT COUNT(*) as count FROM songs').get() as any)?.count || 0;
  const lastSync = (db.prepare("SELECT value FROM sync_state WHERE key = 'last_github_sync'").get() as any)?.value || null;

  res.json({
    status: 'ok',
    uptime: process.uptime(),
    database: 'connected',
    indexedSongs: songCount,
    lastGithubSync: lastSync,
    memoryUsage: process.memoryUsage(),
  });
});

// API Routes
app.use('/api', createDocsRouter());
app.use('/api', createSongRouter(primaryDir));

// Serve Frontend static assets if available
const frontendDist = [
  path.resolve(__dirname, '../frontend/dist'),
  path.resolve(__dirname, '../../frontend/dist')
].find(p => require('fs').existsSync(path.join(p, 'index.html'))) || path.resolve(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
    return next();
  }
  const indexPath = path.join(frontendDist, 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send('Maimai Song Downloader Backend is running. Frontend build not found.');
  }
});

// Start Server & Run Initial Indexing
app.listen(PORT, async () => {
  console.log(`🚀 Maimai Song Downloader server running at http://localhost:${PORT}`);
  try {
    const songCount = (db.prepare('SELECT COUNT(*) as count FROM songs').get() as any)?.count || 0;
    if (songCount === 0) {
      console.log('No indexed songs found in DB. Starting initial local zip scan...');
      await indexAllLocalZips(searchDirs);
    } else {
      console.log(`Database loaded with ${songCount} indexed songs.`);
      // Run background scan in parallel to pick up any new files
      indexAllLocalZips(searchDirs).catch(console.error);
    }
  } catch (e) {
    console.error('Error during initial indexing:', e);
  }

  // Initialize GitHub Sync Cron
  initGithubSync(primaryDir);
});
