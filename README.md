# MaiIndex (Maimai DX Chart Hub & Format Converter)

**MaiIndex** is a high-performance web application, SQLite indexing engine, and zero-disk stream-converting exporter for Maimai DX chart archives.

It indexes local `.zip` chart archives across 1,800+ songs, provides fast title/artist/id search, multi-faceted filtering, difficulty sorting, and live audio previews. It streams batch-exported charts on-the-fly in **AstroDX (`.adx`)**, **Majdata Play (`.zip`)**, or **Raw Passthrough** formats without consuming temporary disk space.

---

## Technology Stack

- **Backend**: Node.js (v22), Express.js, TypeScript (`tsx`), SQLite3 (`better-sqlite3`), `archiver`, `yauzl`.
- **Frontend**: React 19, Vite (v6), TypeScript (v5), `lucide-react`, Custom CSS Design System (`Inter` typography).
- **Deployment**: Docker, Docker Compose, prebuilt images published to the GitHub Container Registry (`ghcr.io/lucideds/maiindex`).

---

## Quick Start & Setup Instructions

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+ or v22 LTS recommended) & `npm`
- [Docker & Docker Compose](https://www.docker.com/) _(Optional, for containerized deployment)_

---

### Option A: Docker Deployment (Recommended)

Prebuilt images are published to the GitHub Container Registry on every push to `main` and on `v*` tags. Pick either variant below — both expose the same application.

#### A1. Pull the published image

The package is private (the repository is), so authenticate first — once the package is switched to public in its GitHub package settings, the login step can be skipped. Create a classic PAT with the `read:packages` scope and log in:

```bash
echo "$GHCR_PAT" | docker login ghcr.io -u <github-username> --password-stdin
```

Then pull:

```bash
docker pull ghcr.io/lucideds/maiindex:latest
```

Then run it with your chart archives and SQLite data mounted:

```bash
docker run -d \
  --name maiindex \
  --restart unless-stopped \
  -p 8763:8763 \
  -e ENABLE_GITHUB_SYNC=false \
  -e MAX_BATCH_SONGS=100 \
  -e MAX_CONCURRENT_EXPORTS=5 \
  -v "$PWD/archives:/data/cache_local:ro" \
  -v "$PWD/data/cache:/data/cache" \
  -v "$PWD/data/db:/data/db" \
  ghcr.io/lucideds/maiindex:latest
```

Volume roles (same paths the container expects when built from source):

| Container path       | Purpose                                                                        |
| :------------------- | :----------------------------------------------------------------------------- |
| `/data/cache_local`  | Read-only mount of your chart `.zip` archives (`mdbp.zip`, `mf.zip`, …).        |
| `/data/cache`        | Writable cache for assets downloaded by the optional GitHub sync.               |
| `/data/db`           | Writable directory holding the generated `maimai.db` SQLite index.              |

Because the image ships a `HEALTHCHECK` on `/health`, `docker ps` reports the container's real readiness — wait for `healthy` before loading the UI.

The same image works from Compose without building anything — save this as `docker-compose.yml` and run `docker compose up -d`:

```yaml
services:
  maiindex:
    image: ghcr.io/lucideds/maiindex:latest
    container_name: maiindex
    restart: unless-stopped
    ports:
      - "8763:8763"
    environment:
      - PORT=8763
      - DATA_CACHE_DIR=/data/cache
      - DATA_DB_DIR=/data/db
      - ENABLE_GITHUB_SYNC=false
      - MAX_BATCH_SONGS=100
      - MAX_CONCURRENT_EXPORTS=5
    volumes:
      - ./data/cache:/data/cache
      - ./data/db:/data/db
      - ./:/data/cache_local:ro
```

Use `docker compose pull && docker compose up -d` to upgrade an existing deployment to the newest `latest`.

Available tags: `latest` (default branch), `main`, release tags from `v*` git tags with the `v` stripped (e.g. `1.4.0` and `1.4`), and `sha-<short-commit>` for pinning an exact commit.

#### A2. Build from source

1. **Clone Repository**:

   ```bash
   git clone https://github.com/lucideds/maiIndex.git
   cd maiIndex
   ```

2. **Mount Chart Archives**:
   Place your chart `.zip` files (e.g. `mdbp.zip`, `mf.zip`, `kop6.zip`) into `./data/cache` or leave them in the project root directory.

3. **Build & Launch Container**:

   ```bash
   docker compose up --build -d
   ```

#### A3. Access Application

- Web App UI: **`http://localhost:8763`**
- Healthcheck: **`http://localhost:8763/health`**

---

### Option B: Local Development Setup

#### 1. Backend Setup

```bash
cd backend
npm install

# Start development server with hot-reload (runs on port 8763)
npm run dev
```

#### 2. Frontend Setup (in a separate terminal)

```bash
cd frontend
npm install

# Start Vite dev server (runs on port 3000 with API proxy to 8763)
npm run dev
```

Visit **`http://localhost:3000`** in your browser.

---

## Environment Variables

The backend can be configured using environment variables in a `.env` file or within `docker-compose.yml`:

| Environment Variable     | Default Value  | Description                                                                      |
| :----------------------- | :------------- | :------------------------------------------------------------------------------- |
| `PORT`                   | `8763`         | Express backend server port.                                                     |
| `DATA_CACHE_DIR`         | `./data/cache` | Directory containing source chart `.zip` archives.                               |
| `DATA_DB_DIR`            | `./data/db`    | Directory where `maimai.db` SQLite database is saved.                            |
| `MAX_BATCH_SONGS`        | `100`          | Maximum number of songs allowed per batch export.                                |
| `MAX_CONCURRENT_EXPORTS` | `5`            | Maximum active concurrent zip export streams.                                    |
| `ENABLE_GITHUB_SYNC`     | `false`        | Set to `true` to auto-check and download releases from remote GitHub repository. |
| `GITHUB_PAT`             | `""`           | Personal Access Token for GitHub API requests (increases rate limits).           |
| `SYNC_CRON`              | `0 */6 * * *`  | Cron schedule for background sync checks.                                        |

---

## Project Structure

```
mai-songs/
├── backend/
│   ├── src/
│   │   ├── adapters/      # AstroDX / Majdata chart format transformers
│   │   ├── routes/        # Songs query & streaming export API endpoints
│   │   ├── services/      # GitHub release sync & zero-disk zip stream engine
│   │   ├── db.ts          # SQLite database connection & schema initialization
│   │   ├── indexer.ts     # Archive scanner & database populator
│   │   └── server.ts      # Express server entrypoint
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx        # Main React UI component & custom controls
│   │   ├── index.css      # Minimalist dark theme design system
│   │   └── main.tsx       # React DOM root entrypoint
│   └── package.json
├── data/
│   ├── cache/             # Downloaded / local asset cache
│   └── db/                # maimai.db SQLite database
├── .github/
│   └── workflows/
│       └── docker-publish.yml  # Builds and publishes the GHCR image (main, v* tags)
├── Dockerfile             # Multi-stage production container build
├── docker-compose.yml     # Docker Compose orchestration (local build variant)
└── README.md
```

---

## License

[MIT](LICENSE)
