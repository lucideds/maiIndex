/**
 * Pick mode - choose one song whose charts satisfy every active difficulty range.
 *
 * Solo ("1P") is one range, two-player ("2P") is two ranges on the same song: maimai
 * cabinets let each player pick their own chart, so a pair of different slots is the
 * normal outcome, not an edge case. Everything here is pure so it can be tested
 * without React.
 */

export interface PickSong {
  id: number;
  shortid: string;
  title: string;
  artist: string;
  bpm: string;
  genre: string;
  version: string;
  cabinet: string;
  cover_file?: string;
  audio_file?: string;
  lv_1?: string;
  lv_2?: string;
  lv_3?: string;
  lv_4?: string;
  lv_5?: string;
  lv_6?: string;
  lv_7?: string;
}

export type SlotKey = 'lv_1' | 'lv_2' | 'lv_3' | 'lv_4' | 'lv_5' | 'lv_6' | 'lv_7';

export interface Slot {
  key: SlotKey;
  label: string;
  badge: string;
}

/** Slot bindings mirror AGENTS.md - do not collapse them into an array index. */
export const SLOTS: Slot[] = [
  { key: 'lv_1', label: 'EASY', badge: 'badge-basic' },
  { key: 'lv_2', label: 'BAS', badge: 'badge-basic' },
  { key: 'lv_3', label: 'ADV', badge: 'badge-advanced' },
  { key: 'lv_4', label: 'EXP', badge: 'badge-expert' },
  { key: 'lv_5', label: 'MAS', badge: 'badge-master' },
  { key: 'lv_6', label: 'Re:MAS', badge: 'badge-remaster' },
  { key: 'lv_7', label: '[宴] Utage', badge: 'badge-utage' },
];

export type Range = [number, number];

export interface Chart {
  slot: Slot;
  level: number;
  display: string;
}

/**
 * "13+" reads 13.7 - the same mapping the backend uses to sort by difficulty
 * (`REPLACE(level, '+', '.7')` in routes/songs.ts). Fractional levels such as 10.2
 * parse as-is. Anything unparseable is NaN and never matches a range.
 */
export const levelNum = (raw?: string): number => {
  const text = (raw ?? '').trim();
  if (!text) return NaN;
  const value = parseFloat(text.replace(/\+$/, '.7'));
  return Number.isFinite(value) ? value : NaN;
};

export const formatLevel = (value: number): string => {
  if (Number.isInteger(value)) return String(value);
  if (Math.abs((value % 1) - 0.7) < 1e-9) return `${Math.floor(value)}+`;
  return value.toFixed(1);
};

export const isUtage = (song: PickSong): boolean =>
  song.genre === '宴会場' || /\[宴\]/.test(song.title ?? '');

/**
 * The in-range chart closest to the top of the range - ask for 11-12 and you get the
 * 12s. That is what makes a mixed pair feel like a fair trade rather than one player
 * slumming it. Ties resolve to the higher slot.
 */
export const chartFor = (song: PickSong, [lo, hi]: Range): Chart | null => {
  let best: Chart | null = null;
  for (const slot of SLOTS) {
    const level = levelNum(song[slot.key]);
    if (!Number.isFinite(level) || level < lo || level > hi) continue;
    if (!best || level >= best.level) best = { slot, level, display: formatLevel(level) };
  }
  return best;
};

/** One chart per range, or null when the song cannot satisfy them all. */
export const chartsFor = (song: PickSong, ranges: Range[]): Chart[] | null => {
  const charts: Chart[] = [];
  for (const range of ranges) {
    const chart = chartFor(song, range);
    if (!chart) return null;
    charts.push(chart);
  }
  return charts;
};

export interface PoolOptions {
  ranges: Range[];
  excludeUtage: boolean;
  /** Persistent play counts - display only, "played 3x". */
  played: Record<string, number>;
  /** Shortids played during the current session. */
  sessionPlayed: Record<string, boolean>;
  /** Shortids skipped during the current session. */
  skipped: Record<string, boolean>;
  avoidId?: string;
  avoidArtist?: string;
}

export const buildPool = (songs: PickSong[], options: PoolOptions): PickSong[] =>
  songs.filter(song => {
    if (options.excludeUtage && isUtage(song)) return false;
    if (song.shortid === options.avoidId) return false;
    if (options.sessionPlayed[song.shortid] || options.skipped[song.shortid]) return false;
    return chartsFor(song, options.ranges) !== null;
  });

export const drawSong = (
  songs: PickSong[],
  options: PoolOptions,
  rng: () => number = Math.random
): PickSong | null => {
  const pool = buildPool(songs, options);
  if (pool.length === 0) return null;
  // Random and annoying is worse than random: avoid two cards by the same artist
  // in a row when the pool is deep enough to allow it.
  const fresh = pool.filter(song => song.artist !== options.avoidArtist);
  const candidates = fresh.length > 0 ? fresh : pool;
  return candidates[Math.floor(rng() * candidates.length)] ?? null;
};

/** Every level present in the catalog, for the range pickers - no hardcoded list. */
export const availableLevels = (songs: PickSong[]): number[] => {
  const levels = new Set<number>();
  for (const song of songs) {
    for (const slot of SLOTS) {
      const level = levelNum(song[slot.key]);
      if (Number.isFinite(level)) levels.add(level);
    }
  }
  return [...levels].sort((a, b) => a - b);
};

export interface PickState {
  ranges: [Range, Range];
  twoPlayer: boolean;
  excludeUtage: boolean;
  played: Record<string, number>;
  sessionPlayed: Record<string, boolean>;
  skipped: Record<string, boolean>;
  lastArtist?: string;
}

export const defaultState = (): PickState => ({
  // Both players default to the same bracket - widen the second range for a mixed pair.
  ranges: [[11, 12], [11, 12]],
  twoPlayer: false,
  excludeUtage: true,
  played: {},
  sessionPlayed: {},
  skipped: {},
});

// v2: the second range default changed, so stored v1 state would hide it.
const STORAGE_KEY = 'maiindex.pick.v2';

export const loadState = (): PickState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...(JSON.parse(raw) as Partial<PickState>) };
  } catch {
    return defaultState();
  }
};

export const saveState = (state: PickState): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode / storage disabled: pick mode still works, it just forgets.
  }
};

export const activeRanges = (state: PickState): Range[] =>
  state.twoPlayer ? [state.ranges[0], state.ranges[1]] : [state.ranges[0]];

export const poolOptions = (state: PickState, avoidId?: string): PoolOptions => ({
  ranges: activeRanges(state),
  excludeUtage: state.excludeUtage,
  played: state.played,
  sessionPlayed: state.sessionPlayed,
  skipped: state.skipped,
  avoidId,
  avoidArtist: state.lastArtist,
});
