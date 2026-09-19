import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { indexZipFile } from '../indexer';
import { db } from '../db';

const REPO_OWNER = 'I21b';
const REPO_NAME = 'Maicharts-in-Zip';

// Only the newest release is synced. Older releases re-ship archives a newer release
// supersedes, and also ship retired archives under different filenames, so walking the
// whole history downloads ~8GB of dead charts and lets a 2024 archive index over the
// current one (the insert is last-write-wins on shortid).
const RELEASES_TO_SYNC = 1;

export function initGithubSync(primaryDataDir: string) {
  // Disable automatic background download unless explicitly enabled via ENABLE_GITHUB_SYNC=true
  if (process.env.ENABLE_GITHUB_SYNC !== 'true') {
    console.log('[GitHub Sync] Disabled. (Set ENABLE_GITHUB_SYNC=true in env to enable auto-download of new GitHub releases).');
    return;
  }

  const cronExpr = process.env.SYNC_CRON || '0 */6 * * *';
  console.log(`[GitHub Sync] Initializing cron with schedule: "${cronExpr}"`);

  cron.schedule(cronExpr, async () => {
    console.log('[GitHub Sync] Running scheduled check for new releases...');
    try {
      await checkAndDownloadReleases(primaryDataDir);
    } catch (err) {
      console.error('[GitHub Sync] Scheduled sync failed:', err);
    }
  });
}

// A cron tick that fires while a sync is still downloading would list the same release
// and try to fetch the same archives; both streams would write the same path.
let syncInFlight = false;

export async function checkAndDownloadReleases(dataDir: string): Promise<number> {
  if (syncInFlight) {
    console.log('[GitHub Sync] Previous sync still running, skipping this tick.');
    return 0;
  }
  syncInFlight = true;
  try {
    return await runSync(dataDir);
  } finally {
    syncInFlight = false;
  }
}

async function runSync(dataDir: string): Promise<number> {
  const token = process.env.GITHUB_PAT;
  const headers: Record<string, string> = {
    'User-Agent': 'Maimai-Song-Downloader-App',
    Accept: 'application/vnd.github.v3+json',
  };
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  const checkDirs = [dataDir, '/data/cache_local', path.resolve(__dirname, '../../..')];

  // Skip only when a *complete* copy is present. Existence alone is not enough: an
  // interrupted download or a container restart mid-transfer leaves a short file that
  // would be skipped forever, and a truncated zip indexes as 0 songs with no error.
  function hasCompleteCopy(filename: string, size: number): boolean {
    return checkDirs.some(dir => {
      if (!dir) return false;
      try {
        return fs.statSync(path.join(dir, filename)).size === size;
      } catch {
        return false;
      }
    });
  }

  return new Promise((resolve) => {
    const req = https.get(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases`,
      { headers },
      (res) => {
        if (res.statusCode !== 200) {
          console.warn(`[GitHub Sync] API returned HTTP ${res.statusCode}`);
          return resolve(0);
        }

        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', async () => {
          try {
            const releases = JSON.parse(body);
            let downloadedCount = 0;

            const latest = releases
              .filter((r: any) => !r.draft && !r.prerelease)
              .slice(0, RELEASES_TO_SYNC);

            for (const release of latest) {
              if (!release.assets || !Array.isArray(release.assets)) continue;

              for (const asset of release.assets) {
                if (!asset.name.endsWith('.zip') || asset.name === 'log.zip') continue;
                if (hasCompleteCopy(asset.name, asset.size)) continue;

                const targetPath = path.join(dataDir, asset.name);
                // One dead asset (network blip, 5xx) must not abandon the rest of the
                // release: log it and let the next tick pick it up.
                try {
                  console.log(`[GitHub Sync] Downloading asset: ${asset.name} (${Math.round(asset.size / 1048576)}MB)...`);
                  await downloadFile(asset.browser_download_url, targetPath, asset.size);
                  console.log(`[GitHub Sync] Downloaded ${asset.name}. Indexing...`);
                  const indexed = await indexZipFile(targetPath);
                  if (indexed === 0) {
                    console.warn(`[GitHub Sync] ${asset.name} indexed 0 songs; discarding so the next run retries it.`);
                    fs.unlink(targetPath, () => {});
                    continue;
                  }
                  downloadedCount++;
                } catch (e) {
                  console.error(`[GitHub Sync] ${asset.name} failed, will retry next run:`, e);
                }
              }
            }

            db.prepare(
              `INSERT OR REPLACE INTO sync_state (key, value, updated_at) VALUES ('last_github_sync', ?, CURRENT_TIMESTAMP)`
            ).run(new Date().toISOString());

            console.log(`[GitHub Sync] Complete. Downloaded ${downloadedCount} new zip packages.`);
            resolve(downloadedCount);
          } catch (e) {
            console.error('[GitHub Sync] Error parsing release response:', e);
            resolve(0);
          }
        });
      }
    );

    req.on('error', (err) => {
      console.error('[GitHub Sync] Request error:', err);
      resolve(0);
    });
  });
}

function downloadFile(url: string, destPath: string, expectedSize: number): Promise<void> {
  const partPath = `${destPath}.part`;

  return new Promise((resolve, reject) => {
    const fail = (err: Error) => {
      fs.unlink(partPath, () => {});
      reject(err);
    };

    const request = https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        response.resume();
        if (response.headers.location) {
          return downloadFile(response.headers.location, destPath, expectedSize).then(resolve).catch(reject);
        }
      }

      if (response.statusCode !== 200) {
        response.resume();
        return fail(new Error(`Download failed with status ${response.statusCode}`));
      }

      // Stream to .part and rename only once the byte count matches, so the destination
      // path is never a half-written zip (and a killed container leaves no archive that
      // looks complete).
      const file = fs.createWriteStream(partPath);
      response.pipe(file);
      file.on('error', fail);
      file.on('finish', () => {
        file.close(() => {
          let actual: number;
          try {
            actual = fs.statSync(partPath).size;
          } catch (e) {
            return fail(e as Error);
          }
          if (actual !== expectedSize) {
            return fail(new Error(`Incomplete download: got ${actual} bytes, expected ${expectedSize}`));
          }
          fs.rename(partPath, destPath, (e) => (e ? fail(e) : resolve()));
        });
      });
    });

    request.on('error', fail);
  });
}
