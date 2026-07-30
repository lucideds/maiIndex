# AGENTS.md - Developer & Agent Guide for MaiIndex

## Project Overview
**MaiIndex** (formerly Maimai DX Song Hub) is a high-performance web application, SQLite database engine, and zero-disk stream-converting exporter for Maimai DX chart archives. It indexes local `.zip` chart archives across 1,800+ songs, provides fast title/artist/id search, multi-faceted filtering, difficulty sorting, and live audio previews, and streams batch exported charts on-the-fly in **AstroDX (`.adx`)**, **Majdata Play (`.zip`)**, or **Raw Passthrough** formats without consuming temporary disk space.

---

## 🛠️ Technology Stack

### Backend
- **Runtime**: Node.js (v22), TypeScript (`tsx`)
- **Server Framework**: Express.js
- **Database**: SQLite3 (`better-sqlite3`) located at `data/db/maimai.db`
- **Archiving & Streaming Engine**: `archiver`, `yauzl`

### Frontend
- **Framework & Bundler**: React 19, Vite (v6), TypeScript (v5)
- **UI Icons**: `lucide-react`
- **Design System**: Custom Minimalist Dark CSS System (`index.css`) featuring custom CSS variables, slate color palette (`#0b0f17`), `Inter` typography, custom select dropdowns, floating audio & batch export docks.

### Containerization & Deployment
- Docker & Docker Compose (`docker-compose.yml`, multi-stage `Dockerfile`)

---

## 📁 Repository Structure
```
mai-songs/
├── backend/
│   ├── src/
│   │   ├── adapters/
│   │   │   └── formatAdapters.ts # AstroDX / Majdata chart format transformers
│   │   ├── routes/
│   │   │   └── songs.ts        # Song query API (search, filter, sort, covers, audio)
│   │   ├── services/
│   │   │   ├── githubSync.ts   # Optional remote asset indexer
│   │   │   └── streamEngine.ts # Zero-disk multi-zip streaming engine
│   │   ├── db.ts               # SQLite connection & query initializer
│   │   ├── indexer.ts          # Archive scanner & database populator
│   │   └── server.ts           # Express server entrypoint & route registration
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx             # Main React application & custom UI components
│   │   ├── index.css           # Minimalist dark theme CSS design system
│   │   └── main.tsx            # React DOM root entrypoint
│   ├── index.html              # HTML shell & Google Fonts (Inter, Outfit)
│   ├── vite.config.ts          # Vite build & proxy settings
│   └── package.json
├── data/
│   ├── cache/                  # Downloaded GitHub assets directory
│   └── db/                     # maimai.db SQLite database location
├── docker-compose.yml          # Production container setup & volume mounts
├── Dockerfile                  # Multi-stage Docker build definition
└── AGENTS.md                   # Developer & AI Agent specification guide
```

---

## 🔑 Key Architectural & Design Conventions

### 1. Zip Resolution Strategy
- Local song archives (e.g. `mdbp.zip`, `mf.zip`, `kop6.zip`) are mounted into the container at `/data/cache_local:ro`.
- Any service searching for source zip archives (`streamEngine.ts`, `songs.ts`, `githubSync.ts`) **MUST** check candidate directories in order:
  1. `/data/cache` (Downloaded asset cache)
  2. `/data/cache_local` (Mounted root archives)
  3. Workspace root fallback (`process.cwd()`)

### 2. Frontend Design System (`index.css` & `App.tsx`)
- **Theme**: Minimalist Dark Mode (`--bg-body: #0b0f17`, `--bg-card: #131b2e`, `--border-color: #1f2937`, `--accent-primary: #3b82f6`).
- **Typography**: Google Font `Inter` for clean, highly readable UI text across grid cards, table rows, and floating control docks.
- **Custom Dropdowns (`CustomDropdown`)**:
  - Replaces native browser `<select>` controls across Version, Genre, Cabinet, Sort, and Export Format filters with custom dark slate popover menus, active state checkmarks, and click-outside dismissal.
  - **Viewport Bounds & Direction Detection**: Calculates available screen space on open to auto-position popover menus upwards (`dropUp` / `.drop-up`) when near the bottom viewport edge, or align right (`alignRight` / `.align-right`) when near the right screen edge.
  - Export format dropdown in `.export-dock` explicitly opens upwards above the floating cart.
- **Audio Preview Dock & Seeker**:
  - Floating bottom audio dock (`.audio-dock`) with backdrop blur.
  - Interactive scrubbable song seeker slider (`.seeker-slider`) with real-time timestamp display (`currentTime` / `duration`).
  - Smooth, non-snapping volume control (`step="0.001"`) with active percentage tooltip badge (automatically hidden on mobile <640px to prioritize the seeker bar).
- **Floating Export Dock & Real-time Progress Bar (`.export-dock`, `.export-progress-panel`)**:
  - Floating bottom-right cart dock for format selection and batch download execution.
  - Transforms into an interactive real-time progress panel during active exports, driven by Server-Sent Events (SSE) and `ReadableStream` chunk byte tracking.
  - Displays glowing percentage fill, song count (`14 / 50 songs packaged`), active song title, and streamed volume (`15.4 MB streamed`).
  - Displays a green completion badge (`Export Complete!`) for 2.5 seconds upon completion before clearing selection.
- **Mobile & Tablet Responsiveness**:
  - Fluid 2-column song card grid on mobile viewports (`minmax(150px, 1fr)`).
  - Floating docks stack vertically on mobile (<768px): `.export-dock.has-audio-dock` stacks at `bottom: 78px` above `.audio-dock` to prevent control overlap.
- **Dual Pagination & Layout Clearance**:
  - Dedicated top pagination bar above the song grid/table alongside standard bottom pagination.
  - `.app-main` features `120px`-`160px` bottom padding to ensure floating audio/export docks never obscure bottom pagination buttons or song cards.

### 3. Difficulty Level Mapping
- Maimai `maidata.txt` files use dedicated slots (`lv_1` to `lv_7`). Difficulty mapping preserves exact slot bindings (non-empty slots only) rather than collapsing array indices:
  - `lv_1` → `EASY` (Legacy slot)
  - `lv_2` → `BAS` (Basic) → Green (`.badge-basic`)
  - `lv_3` → `ADV` (Advanced) → Yellow (`.badge-advanced`)
  - `lv_4` → `EXP` (Expert) → Red (`.badge-expert`)
  - `lv_5` → `MAS` (Master) → Purple (`.badge-master`)
  - `lv_6` → `Re:MAS` (Re:Master) → Magenta (`.badge-remaster`)
  - `lv_7` (or Utage genre `宴会場`) → `[宴] Utage` → Rose/Magenta (`.badge-utage`)

### 4. Version Name Formatting
- Database version strings contain raw `maimai` prefixes (e.g., `maimai DX BUDDiES`).
- Frontend display utility `formatVersionName()` strips `maimai ` so dropdowns and card badges render cleanly as `DX BUDDiES`, `DX PRiSM`, `FiNALE`, etc.

### 5. Song Title & Cabinet Formatting (`formatSongTitle`, `getCabinetType`)
- Trailing `[SD]` and `[DX]` chart indicators in raw titles are stripped for display via `formatSongTitle()` to maintain clean title presentation matching official arcade jukebox UIs.
- Cabinet format (`SD` vs `DX`) is displayed via glowing `.cabinet-pill` tags (`DX` in cyan gradient, `SD` in translucent slate) mounted on song card cover art and inline in Table View.

---

## 📡 API Endpoints Reference

### Songs API (`/api/songs`)
- `GET /api/songs`: Query song catalog with query parameters:
  - `search`: Filter title, artist, or short ID.
  - `version`: Filter by version string.
  - `genre`: Filter by genre string.
  - `cabinet`: Filter by cabinet (`SD` or `DX`).
  - `sort`: `id_asc`, `id_desc`, `title_asc`, `title_desc`, `diff_desc`, `diff_asc`, `bpm_desc`, `bpm_asc`.
  - `page`: Page index (default `1`).
  - `limit`: Items per page (default `24`).
- `GET /api/songs/versions`: Returns list of available version strings and song counts.
- `GET /api/songs/genres`: Returns list of available genres and song counts.
- `GET /api/songs/:id/cover`: Streams cover image from the associated zip archive.
- `GET /api/songs/:id/audio`: Streams preview audio file from the associated zip archive.

### Export & Conversion API (`/api/export`)
- `POST /api/export`: Streams zip archive of selected songs converted on-the-fly.
  - Request Body: `{ songIds: string[], format: 'astrodx' | 'majdata' | 'raw', exportId?: string }`
  - Response: Streams `.adx` or `.zip` file on-the-fly without temporary disk storage.
- `GET /api/export/progress/:exportId`: Real-time Server-Sent Events (SSE) or JSON progress stream for active exports.
  - Response: `{ exportId, total, processed, currentSong, percent, status: 'processing' | 'completed' | 'error' }`

---

## 🚀 Build & Deployment Commands

### Local Development & Build Commands
```bash
# Backend Build
cd backend && npm run build

# Frontend Build (Vite & TypeScript compilation)
cd frontend && npm run build

# Run Frontend Dev Server
cd frontend && npm run dev
```

### Docker Container Deployment
```bash
# Build and start container in detached mode
docker compose up --build -d

# View container logs
docker compose logs -f
```
- Web Application WebUI: **`http://localhost:3001`**
- Healthcheck Endpoint: **`http://localhost:3001/health`**
