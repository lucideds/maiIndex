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
- **Design System**: Custom "Cabinet Dark" CSS System (`index.css`) featuring custom CSS variables, a warm near-black palette sourced from the project mascot art (`public/pom.png`), `M PLUS` typography, custom select dropdowns, floating audio & batch export docks.

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
│   │   ├── docs.ts             # Serves /api/openapi.json and the Scalar page at /api/docs
│   │   ├── openapi.ts          # Hand-written OpenAPI 3.1 spec (API source of truth)
│   │   ├── indexer.ts          # Archive scanner & database populator
│   │   └── server.ts           # Express server entrypoint & route registration
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx             # Main React application & custom UI components
│   │   ├── index.css           # "Cabinet Dark" theme CSS design system
│   │   └── main.tsx            # React DOM root entrypoint
│   ├── index.html              # HTML shell & Google Fonts (M PLUS 1, M PLUS 1 Code, M PLUS Rounded 1c)
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
- **Theme — "Cabinet Dark"**: Warm near-black surfaces with a single warm-cream accent. Palette is sampled from the project's own mascot art (`frontend/public/pom.png`: butter `#f0f0a8`, oxblood `#781818`, plum `#481830`, warm grey `#483030`), so it is a sourced identity rather than a framework default.
  - Surfaces: `--bg-body: #0e0b0d`, `--bg-card: #171316`, `--border-color: #2b2326`.
  - Accent: `--accent-primary: #e7dcc4` (warm cream - actions, selection, focus) with `--accent-ink: #1c1512` for text on accent fills. The accent is kept hue-free on purpose: saturated warm hues belong to the difficulty tiers, so a yellow accent reads as another badge.
  - Alert: `--alert: #e08272` (clear filters, destructive actions).
  - UI chrome stays desaturated **on purpose**: the difficulty tiers own every saturated hue, and the accent is reserved for interactive state.
- **Anti-slop rules (MUST)**:
  - **No gradients** on any surface, button, badge, or progress bar — solid fills only.
  - **No glow** (`box-shadow: 0 0 <N>px <color>`); depth comes from contrast, borders, and offset shadows only.
  - **No hover transforms** (lift/scale); hover communicates state via background/border color. All motion MUST respect the `prefers-reduced-motion` block at the end of `index.css`.
  - **Radius by role**, never one value everywhere: `--radius-xs: 2px` (badges, tags, chips), `--radius-sm: 5px` (buttons, inputs), `--radius-md: 9px` (cards, panels, tables), `--radius-lg: 14px` (floating docks, modals). Circles (play buttons, slider thumbs) stay deliberately round.
  - **New colors MUST come from the token block** in `:root`; no hardcoded hex/rgba in rules or in JSX (`color="var(--text-muted)"`, not `color="#6b7280"`).
- **Typography — one JP-first superfamily** (the catalog is mixed Japanese/English):
  - `--font-display: 'M PLUS Rounded 1c'` — brand wordmark and headings; echoes the cabinet marquee's rounded register.
  - `--font-ui: 'M PLUS 1'` — all UI copy, card titles, table cells, docks.
  - `--font-mono: 'M PLUS 1 Code'` — song IDs, difficulty badges, BPM, seeker timestamps, code previews; tabular by construction.
  - Fonts load from Google Fonts in `index.html`; do not reintroduce `Inter`/`Outfit` or any single face used everywhere.
- **Custom Dropdowns (`CustomDropdown`)**:
  - Replaces native browser `<select>` controls across Version, Genre, Cabinet, Sort, and Export Format filters with custom popover menus, active state checkmarks, and click-outside dismissal.
  - **Viewport Bounds & Direction Detection**: Calculates available screen space on open to auto-position popover menus upwards (`dropUp` / `.drop-up`) when near the bottom viewport edge, or align right (`alignRight` / `.align-right`) when near the right screen edge.
  - Export format dropdown in `.export-dock` explicitly opens upwards above the floating cart.
- **Audio Preview Dock & Seeker**:
  - Floating bottom audio dock (`.audio-dock`) with backdrop blur.
  - Interactive scrubbable song seeker slider (`.seeker-slider`) with real-time timestamp display (`currentTime` / `duration`).
  - Smooth, non-snapping volume control (`step="0.001"`) with active percentage tooltip badge (automatically hidden on mobile <640px to prioritize the seeker bar).
- **Mobile & Tablet Responsiveness**:
  - Fluid 2-column song card grid on mobile viewports (`minmax(150px, 1fr)`).
  - `.export-dock.has-audio-dock` always stacks the cart above the centered audio dock (`.audio-dock` is centered at 760px wide, the cart is right-anchored, so they collide from ~900px up — not only on mobile).
  - Below 640px the cart wraps to two rows (`flex-wrap`): selection count + close on row one, format picker + export button on row two, so the format label is never truncated.
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
- Cabinet format (`SD` vs `DX`) is displayed via `.cabinet-pill` tags (solid `--dx-accent` teal for `DX`, translucent slate for `SD`) mounted on song card cover art and inline in Table View.

---

## 📡 API Endpoints Reference

Interactive docs (Scalar) are public at **`/api/docs`**; the raw spec is at `/api/openapi.json`. The spec lives in `backend/src/openapi.ts` and is **hand-written, so it MUST be updated whenever a route, query param, request body, or response shape is added or changed** (and this section with it). Nothing checks it for drift. Scalar loads from a version-pinned jsDelivr URL in `docs.ts`.

### Songs API (`/api/songs`)
- `GET /api/songs`: Query song catalog with query parameters:
  - `search`: Filter title, artist, or short ID.
  - `version`: Filter by version string.
  - `genre`: Filter by genre string.
  - `cabinet`: Filter by cabinet (`SD` or `DX`).
  - `min` / `max`: Level bracket. A song matches when **any** of its seven slots falls inside it — the same predicate `picker.ts` uses. Each is independently optional; a missing bound is an open end. `+` levels normalise to `.7` (`13+` = 13.7) and empty slots to `-1` so they can never match.
  - `sort`: `id_asc`, `id_desc`, `title_asc`, `title_desc`, `diff_desc`, `diff_asc`, `bpm_desc`, `bpm_asc`.
  - `page`: Page index (default `1`).
  - `limit`: Items per page (default `24`).
- `GET /api/songs/versions`: Returns list of available version strings and song counts.
- `GET /api/songs/genres`: Returns list of available genres and song counts.
- `GET /api/songs/levels`: Distinct level strings across all seven slots, numerically ordered. Feeds the browse-view slider bounds — derive them from the whole catalog here, never from the visible page. Uses `UNION ALL` over the columns, not `json_each`: the table-valued JSON functions are not compiled into every SQLite build.
- `GET /api/songs/:id`: One song by numeric `id` or `shortid`.
- `GET /api/songs/:id/detail`: Charter plus per-slot note counts and NPS, parsed from `maidata.txt` (cached per shortid).
- `GET /api/songs/:id/cover`: Streams cover image from the associated zip archive.
- `GET /api/songs/:id/audio`: Streams preview audio file from the associated zip archive.

### Export & Conversion API (`/api/export`)
- `POST /api/export`: Streams zip archive of selected songs converted on-the-fly.
  - Request Body: `{ songIds: string[], format: 'astrodx' | 'majdata' | 'sonolus' | 'raw' }`
  - Response: Streams `.adx`, `.sonolus.zip`, or `.zip` file on-the-fly without temporary disk storage.

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
- Web Application WebUI: **`http://localhost:8763`**
- Healthcheck Endpoint: **`http://localhost:8763/health`**
