# MaiIndex (Maimai DX Chart Hub & Format Converter)

**MaiIndex** is a high-performance web application, SQLite indexing engine, and zero-disk stream-converting exporter for Maimai DX chart archives.

It indexes local `.zip` chart archives across 1,800+ songs, provides fast title/artist/id search, multi-faceted filtering, difficulty sorting, and live audio previews. It streams batch-exported charts on-the-fly in **AstroDX (`.adx`)**, **Majdata Play (`.zip`)**, or **Raw Passthrough** formats without consuming temporary disk space.

---

## Technology Stack

- **Backend**: Node.js (v22), Express.js, TypeScript (`tsx`), SQLite3 (`better-sqlite3`), `archiver`, `yauzl`.
- **Frontend**: React 19, Vite (v6), TypeScript (v5), `lucide-react`, Custom CSS Design System (`Inter` typography).
- **Deployment**: Docker, Docker Compose.

---

## Quick Start & Setup Instructions

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+ or v22 LTS recommended) & `npm`
- [Docker & Docker Compose](https://www.docker.com/) _(Optional, for containerized deployment)_

---

### Option A: Docker Deployment (Recommended)

1. **Clone Repository**:

   ```bash
   git clone https://github.com/your-username/mai-songs.git
   cd mai-songs
   ```

2. **Mount Chart Archives**:
   Place your chart `.zip` files (e.g. `mdbp.zip`, `mf.zip`, `kop6.zip`) into `./data/cache` or leave them in the project root directory.

3. **Build & Launch Container**:

   ```bash
   docker compose up --build -d
   ```

4. **Access Application**:
   - Web App UI: **`http://localhost:3001`**
   - Healthcheck: **`http://localhost:3001/health`**

---

### Option B: Local Development Setup

#### 1. Backend Setup

```bash
cd backend
npm install

# Start development server with hot-reload (runs on port 3001)
npm run dev
```

#### 2. Frontend Setup (in a separate terminal)

```bash
cd frontend
npm install

# Start Vite dev server (runs on port 3000 with API proxy to 3001)
npm run dev
```

Visit **`http://localhost:3000`** in your browser.

---

## Environment Variables

The backend can be configured using environment variables in a `.env` file or within `docker-compose.yml`:

| Environment Variable     | Default Value  | Description                                                                      |
| :----------------------- | :------------- | :------------------------------------------------------------------------------- |
| `PORT`                   | `3001`         | Express backend server port.                                                     |
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
├── Dockerfile             # Multi-stage production container build
├── docker-compose.yml     # Docker Compose orchestration
└── README.md
```

---

## License

[MIT](LICENSE)
