import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { indexZipFile } from '../indexer';
import { db } from '../db';

const REPO_OWNER = 'I21b';
const REPO_NAME = 'Maicharts-in-Zip';

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

export async function checkAndDownloadReleases(dataDir: string): Promise<number> {
  const token = process.env.GITHUB_PAT;
  const headers: Record<string, string> = {
    'User-Agent': 'Maimai-Song-Downloader-App',
    Accept: 'application/vnd.github.v3+json',
  };
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  const checkDirs = [dataDir, '/data/cache_local', path.resolve(__dirname, '../../..')];

  function fileExistsAnywhere(filename: string): boolean {
    return checkDirs.some(dir => dir && fs.existsSync(path.join(dir, filename)));
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

            for (const release of releases) {
              if (!release.assets || !Array.isArray(release.assets)) continue;

              for (const asset of release.assets) {
                if (asset.name.endsWith('.zip') && asset.name !== 'log.zip') {
                  if (!fileExistsAnywhere(asset.name)) {
                    const targetPath = path.join(dataDir, asset.name);
                    console.log(`[GitHub Sync] Downloading new asset: ${asset.name}...`);
                    await downloadFile(asset.browser_download_url, targetPath);
                    console.log(`[GitHub Sync] Downloaded ${asset.name}. Indexing...`);
                    await indexZipFile(targetPath);
                    downloadedCount++;
                  }
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

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const request = https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        if (response.headers.location) {
          return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        }
      }

      if (response.statusCode !== 200) {
        fs.unlink(destPath, () => {});
        return reject(new Error(`Download failed with status ${response.statusCode}`));
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    });

    request.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}
