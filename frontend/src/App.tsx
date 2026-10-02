import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, Music, Download, LayoutGrid, List, Play, Pause, 
  CheckSquare, Square, Filter, RefreshCw, X, ListChecks,
  Volume2, VolumeX, ArrowUpDown, ChevronDown, Check,
  Shuffle, SkipForward, RotateCcw, Trash2, Info, Share2
} from 'lucide-react';
import {
  activeRanges, availableLevels, buildPool, chartsFor, drawSong,
  formatLevel, levelNum, levelStops, loadState, poolOptions, saveState, SLOTS,
  type PickSong, type PickState, type Range,
} from './picker';

interface Song {
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

interface SongDetail {
  shortid: string;
  title: string;
  artist: string;
  bpm: string;
  genre: string;
  version: string;
  cabinet: string;
  charter: string | null;
  charts: { slot: number; level: string; notes: number | null; nps: number | null }[];
}

/**
 * Counts up or down to a new number. Short and eased out on purpose - the point
 * is that the number moved, not to watch it roll. Jumps straight to the value
 * under prefers-reduced-motion, like every other animation in the app.
 */
function Odometer({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const lastRef = useRef(value);
  const frameRef = useRef(0);

  useEffect(() => {
    if (lastRef.current === value) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      lastRef.current = value;
      setShown(value);
      return;
    }
    const from = lastRef.current;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 260);
      const current = Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3)));
      // Track the last rendered value so an interrupted roll resumes from where it
      // actually is, not from where it started.
      lastRef.current = current;
      setShown(current);
      if (p < 1) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value]);

  return <>{shown.toLocaleString()}</>;
}

interface CustomDropdownOption {
  value: string;
  label: string;
}

interface CustomDropdownProps {
  options: CustomDropdownOption[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  minWidth?: string;
  dropUp?: boolean;
  alignRight?: boolean;
}

function CustomDropdown({ 
  options, 
  value, 
  onChange, 
  placeholder = 'Select...', 
  minWidth = '140px',
  dropUp,
  alignRight
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [autoDropUp, setAutoDropUp] = useState(false);
  const [autoAlignRight, setAutoAlignRight] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  const handleToggle = () => {
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceRight = window.innerWidth - rect.left;
      
      setAutoDropUp(spaceBelow < 260);
      setAutoAlignRight(spaceRight < 260);
    }
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isUp = dropUp !== undefined ? dropUp : autoDropUp;
  const isRight = alignRight !== undefined ? alignRight : autoAlignRight;

  return (
    <div className="custom-select-container" ref={containerRef} style={{ minWidth }}>
      <div 
        className={`custom-select-trigger ${isOpen ? 'open' : ''}`}
        onClick={handleToggle}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={15} className="custom-select-chevron" />
      </div>

      {isOpen && (
        <div className={`custom-select-menu ${isUp ? 'drop-up' : ''} ${isRight ? 'align-right' : ''}`}>
          {options.map((opt) => (
            <div
              key={opt.value}
              className={`custom-select-option ${opt.value === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
            >
              <span>{opt.label}</span>
              {opt.value === value && <Check size={14} color="var(--accent-primary)" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface RangeSliderProps {
  /** Ordered stops the thumbs snap to - levelStops(), never a raw min/max grid. */
  stops: number[];
  value: [number, number];
  onChange: (value: [number, number]) => void;
  onCommit?: (value: [number, number]) => void;
}

/**
 * Level range as a dual-thumb slider over real level stops. The native inputs
 * carry stop *indices* (a range input needs a uniform step, and "+" levels sit at
 * X.7, not X.5), while every value crossing this boundary is a real level number.
 */
function RangeSlider({ stops, value, onChange, onCommit }: RangeSliderProps) {
  const last = stops.length - 1;
  // A stored range can hold a level that is not a stop (state from before the
  // stops existed) - snap to the nearest rather than render an off-track thumb.
  const indexOf = (level: number) => {
    const exact = stops.indexOf(level);
    if (exact !== -1) return exact;
    let best = 0;
    for (let i = 1; i <= last; i++) {
      if (Math.abs(stops[i] - level) < Math.abs(stops[best] - level)) best = i;
    }
    return best;
  };
  if (last < 0) return null;

  const [low, high] = value.map(indexOf) as [number, number];
  const pct = (i: number) => (last > 0 ? (i / last) * 100 : 0);

  return (
    <div className="dual-range-container">
      <div className="dual-range-rail">
        <div
          className="dual-range-fill"
          style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }}
        />
        {/* A range input positions its own thumb straight from the value, and there is
            no CSS property in between to transition, so the thumb you actually see is
            an element easing to the stop the input snapped to. The real inputs stay on
            top, transparent, and keep owning the hit testing and the keyboard. */}
        <span className="dual-range-thumb" style={{ left: `${pct(low)}%` }} aria-hidden="true" />
        <span className="dual-range-thumb" style={{ left: `${pct(high)}%` }} aria-hidden="true" />
      </div>
      <input
        type="range"
        className="dual-range-input"
        min={0}
        max={last}
        step={1}
        value={low}
        aria-label="Lowest level"
        onChange={(e) => onChange([stops[Math.min(Number(e.target.value), high)], stops[high]])}
        onPointerUp={() => onCommit?.(value)}
        onKeyUp={() => onCommit?.(value)}
      />
      <input
        type="range"
        className="dual-range-input"
        min={0}
        max={last}
        step={1}
        value={high}
        aria-label="Highest level"
        onChange={(e) => onChange([stops[low], stops[Math.max(Number(e.target.value), low)]])}
        onPointerUp={() => onCommit?.(value)}
        onKeyUp={() => onCommit?.(value)}
      />
    </div>
  );
}

export default function App() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [totalSongs, setTotalSongs] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  // Separate from `loading`: the busy dim only appears if a request is genuinely
  // slow. A local response lands in ~10ms, and a dim that lights up and straight
  // back off is the jarring part, not the loading.
  const [busy, setBusy] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  // The input is uncontrolled-by-typing and the query is debounced, so a paste or a
  // fast typist is one request instead of one per keystroke.
  const [searchInput, setSearchInput] = useState('');
  const [version, setVersion] = useState('');
  const [genre, setGenre] = useState('');
  const [cabinet, setCabinet] = useState('');
  const [sort, setSort] = useState('id_asc');
  // Browse-view level bracket. levelRange is the live thumb position; levelQuery is
  // what has actually been committed (thumb released, or an arrow key) and is the only
  // one that fires a request. Same split as the pick-mode sliders, so dragging across
  // the track is not one request per stop. null = no filter; the server matches.
  const [levelRange, setLevelRange] = useState<Range | null>(null);
  const [levelQuery, setLevelQuery] = useState<Range | null>(null);
  const [levels, setLevels] = useState<string[]>([]);
  
  // Available filter options
  const [versions, setVersions] = useState<{ version: string; count: number }[]>([]);
  const [genres, setGenres] = useState<{ genre: string; count: number }[]>([]);

  // UI state
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportFormat, setExportFormat] = useState<'astrodx' | 'majdata' | 'raw' | 'sonolus'>('astrodx');
  const [exporting, setExporting] = useState(false);

  // Active preview player state
  const [activeAudioSong, setActiveAudioSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [volume, setVolume] = useState<number>(0.3); // 30% default volume
  const [isAdjustingVolume, setIsAdjustingVolume] = useState(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  // Pick mode - one card at a time, drawn from the whole catalog
  const [pickMode, setPickMode] = useState(false);
  const [pick, setPick] = useState<PickState>(loadState);
  const [catalog, setCatalog] = useState<PickSong[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [card, setCard] = useState<PickSong | null>(null);

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Load songs on filter/page/sort change
  useEffect(() => {
    fetchSongs();
  }, [page, search, version, genre, cabinet, sort, levelQuery]);

  // Debounce the search box into the actual query (250ms) and reset to page one.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Load filter options on mount
  useEffect(() => {
    fetchFilterOptions();
  }, []);

  // Cleanup audio element on track change or component unmount
  useEffect(() => {
    return () => {
      if (audioElement) {
        audioElement.pause();
        audioElement.ontimeupdate = null;
        audioElement.onloadedmetadata = null;
        audioElement.onended = null;
        audioElement.src = '';
      }
    };
  }, [audioElement]);

  // Pick state is local-only, but play counts are meant to outlive the tab
  useEffect(() => {
    saveState(pick);
  }, [pick]);

  // Pick mode draws from whatever the filters select, so changing a filter refetches
  useEffect(() => {
    if (pickMode) fetchCatalog();
  }, [pickMode, search, version, genre, cabinet]);

  // A new catalog - first load or a filter change - gets a fresh card
  useEffect(() => {
    if (!pickMode || catalog.length === 0) return;
    const next = drawSong(catalog, poolOptions(pick));
    setPick(prev => (next ? { ...prev, lastArtist: next.artist } : prev));
    setCard(next);
  }, [catalog]);

  const fetchSongs = async () => {
    setLoading(true);
    const slow = setTimeout(() => setBusy(true), 180);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '24',
        search,
        version,
        genre,
        cabinet,
        sort,
      });
      if (levelQuery) {
        params.set('min', String(levelQuery[0]));
        params.set('max', String(levelQuery[1]));
      }
      const res = await fetch(`/api/songs?${params.toString()}`);
      const data = await res.json();
      setSongs(data.songs || []);
      setTotalSongs(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (e) {
      console.error('Failed to fetch songs:', e);
    } finally {
      clearTimeout(slow);
      setBusy(false);
      setLoading(false);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      const [vRes, gRes, lRes] = await Promise.all([
        fetch('/api/songs/versions'),
        fetch('/api/songs/genres'),
        fetch('/api/songs/levels'),
      ]);
      const vData = await vRes.json();
      const gData = await gRes.json();
      const lData = await lRes.json();
      setVersions(vData);
      setGenres(gData);
      setLevels(Array.isArray(lData) ? lData : []);
    } catch (e) {
      console.error('Failed to load filter metadata:', e);
    }
  };

  const fetchCatalog = async () => {
    setCatalogLoading(true);
    try {
      // Same query the browse view uses: the picker draws from whatever the filters select.
      const query = (page: number) =>
        new URLSearchParams({ page: String(page), limit: '1000', search, version, genre, cabinet, sort: 'id_asc' }).toString();
      const first = await (await fetch(`/api/songs?${query(1)}`)).json();
      const extra = Math.ceil((first.total || 0) / 1000);
      const rest = extra > 1
        ? await Promise.all(
            Array.from({ length: extra - 1 }, (_, i) =>
              fetch(`/api/songs?${query(i + 2)}`).then(r => r.json())
            )
          )
        : [];
      setCatalog([...(first.songs || []), ...rest.flatMap(d => d.songs || [])]);
    } catch (e) {
      console.error('Failed to fetch catalog for pick mode:', e);
    } finally {
      setCatalogLoading(false);
    }
  };

  // Every mutation of the pick state redraws: the new state decides the pool, and the
  // card on screen is excluded so a reroll is never a no-op.
  const applyPick = (state: PickState, exclude?: string) => {
    const next = drawSong(catalog, poolOptions(state, exclude));
    setPick(next ? { ...state, lastArtist: next.artist } : state);
    setCard(next);
  };

  const handleReroll = () => applyPick(pick, card?.shortid);

  const handleSkip = () => {
    if (card) applyPick({ ...pick, skipped: { ...pick.skipped, [card.shortid]: true } });
  };

  const handlePlayed = () => {
    if (!card) return;
    applyPick({
      ...pick,
      played: { ...pick.played, [card.shortid]: (pick.played[card.shortid] || 0) + 1 },
      sessionPlayed: { ...pick.sessionPlayed, [card.shortid]: true },
    });
  };

  const handleResetSession = () => applyPick({ ...pick, sessionPlayed: {}, skipped: {} });

  const handleClearPlayed = () => applyPick({ ...pick, played: {} });

  const withRange = (ranges: [Range, Range], index: 0 | 1, value: Range): [Range, Range] => {
    const next = ranges.map(r => [...r]) as [Range, Range];
    next[index] = value;
    return next;
  };

  // Dragging updates the pool count live; the card only redraws when the thumb is
  // released, so a drag doesn't shuffle the song under your finger.
  const previewRange = (index: 0 | 1, value: Range) =>
    setPick({ ...pick, ranges: withRange(pick.ranges, index, value) });

  const commitRange = (index: 0 | 1, value: Range) =>
    applyPick({ ...pick, ranges: withRange(pick.ranges, index, value) });

  const toggleSelectSong = (shortid: string) => {
    const next = new Set(selectedIds);
    if (next.has(shortid)) next.delete(shortid);
    else next.add(shortid);
    setSelectedIds(next);
  };

  const selectAllCurrentPage = () => {
    const next = new Set(selectedIds);
    songs.forEach(s => next.add(s.shortid));
    setSelectedIds(next);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const formatVersionName = (ver: string) => {
    if (!ver) return 'maimai';
    const cleaned = ver.replace(/^maimai\s*/i, '').trim();
    return cleaned ? cleaned : 'Base (maimai)';
  };

  const formatSongTitle = (title: string) => {
    if (!title) return '';
    return title.replace(/\[(SD|DX)\]$/i, '').trim();
  };

  const getCabinetType = (song: Song) => {
    if (song.cabinet && song.cabinet.trim()) {
      return song.cabinet.toUpperCase();
    }
    if (/\[DX\]$/i.test(song.title)) return 'DX';
    if (/\[SD\]$/i.test(song.title)) return 'SD';
    return null;
  };

  const getSongDifficulties = (song: Song) => {
    const isUtage = song.genre === '宴会場' || /\[宴\]/.test(song.title);
    if (isUtage) {
      const val = (song.lv_7 || song.lv_6 || song.lv_5 || song.lv_4 || song.lv_3 || song.lv_2 || song.lv_1 || '').trim();
      return [{ label: '[宴] Utage', className: 'badge-utage', value: val }];
    }

    const rawLevels = [
      { val: song.lv_1, label: 'EASY', className: 'badge-basic' },
      { val: song.lv_2, label: 'BAS', className: 'badge-basic' },
      { val: song.lv_3, label: 'ADV', className: 'badge-advanced' },
      { val: song.lv_4, label: 'EXP', className: 'badge-expert' },
      { val: song.lv_5, label: 'MAS', className: 'badge-master' },
      { val: song.lv_6, label: 'Re:MAS', className: 'badge-remaster' },
      { val: song.lv_7, label: '[宴] Utage', className: 'badge-utage' },
    ];

    return rawLevels
      .filter(item => item.val && item.val.trim() !== '')
      .map(item => ({
        label: item.label,
        className: item.className,
        value: item.val!.trim(),
      }));
  };

  const handleAudioPlay = (song: Song) => {
    if (activeAudioSong?.id === song.id) {
      if (isPlaying) {
        audioElement?.pause();
        setIsPlaying(false);
      } else {
        audioElement?.play();
        setIsPlaying(true);
      }
      return;
    }

    if (audioElement) {
      audioElement.pause();
    }

    const newAudio = new Audio(`/api/songs/${song.id}/audio`);
    newAudio.volume = volume;

    newAudio.ontimeupdate = () => {
      setCurrentTime(newAudio.currentTime);
      setDuration(newAudio.duration || 0);
    };

    newAudio.onloadedmetadata = () => {
      setDuration(newAudio.duration || 0);
    };

    newAudio.play();
    setAudioElement(newAudio);
    setActiveAudioSong(song);
    setIsPlaying(true);
    setCurrentTime(0);

    newAudio.onended = () => setIsPlaying(false);
  };

  const exportSongs = async (ids: string[]) => {
    if (ids.length === 0) return;
    setExporting(true);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songIds: ids,
          format: exportFormat,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`Export Error: ${err.error}`);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      let ext = 'zip';
      if (exportFormat === 'astrodx') ext = 'adx';
      
      const contentDisp = res.headers.get('Content-Disposition');
      let fileName = `maimai_export_${exportFormat}.${ext}`;
      if (contentDisp && contentDisp.includes('filename=')) {
        const match = contentDisp.match(/filename="?([^"]+)"?/);
        if (match && match[1]) fileName = decodeURIComponent(match[1]);
      }

      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed:', e);
      alert('Failed to process download.');
    } finally {
      setExporting(false);
    }
  };

  const handleExport = () => {
    if (selectedIds.size === 0) return;
    exportSongs(Array.from(selectedIds));
  };

  // Song detail modal: stats parsed from the zip's maidata.txt on demand
  const [detailSong, setDetailSong] = useState<Song | null>(null);
  const [detailData, setDetailData] = useState<SongDetail | null>(null);
  const openDetail = (song: Song) => {
    setDetailSong(song);
    setDetailData(null);
    fetch(`/api/songs/${song.id}/detail`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('detail fetch failed'))))
      .then(setDetailData)
      .catch(() => {
        alert('Failed to load chart info.');
        setDetailSong(null);
      });
  };

  // Closing a deep-linked song drops the param, so the browser URL matches the screen.
  const closeDetail = () => {
    setDetailSong(null);
    if (new URLSearchParams(location.search).has('song')) {
      history.replaceState(null, '', location.pathname);
    }
  };

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef(0);
  const flash = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2000);
  };

  // Share a deep link, not just text: the native sheet where it exists, clipboard elsewhere.
  const shareSong = async (song: Song) => {
    const url = `${location.origin}${location.pathname}?song=${encodeURIComponent(song.shortid)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: song.title, text: `${formatSongTitle(song.title)} — ${song.artist}`, url });
      } catch { /* user dismissed the sheet */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      flash('Link copied');
    } catch {
      flash('Copy failed');
    }
  };

  // The audio dock sits under the modal overlay, so a preview started from the modal
  // hands playback to the dock by closing the modal. Pausing it stays in the modal.
  const previewFromModal = (song: Song) => {
    const starting = activeAudioSong?.id !== song.id || !isPlaying;
    handleAudioPlay(song);
    if (starting) closeDetail();
  };

  // Deep link: /?song=<shortid> opens that song's modal, so shared links land on the track.
  useEffect(() => {
    const shortid = new URLSearchParams(location.search).get('song');
    if (!shortid) return;
    fetch(`/api/songs/${encodeURIComponent(shortid)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
      .then((song: Song) => openDetail(song))
      .catch(() => flash('Song not found'));
  }, []);

  const isFilterActive = version || genre || cabinet || search || sort !== 'id_asc' || levelQuery !== null;

  // Browse-view slider bounds come from the whole catalog, not the visible page.
  // `?`-suffixed levels ("12.0?") are chart-uncertainty markers, not a level - levelNum
  // already parses them as their number, and the stops are a fixed grid anyway.
  const browseStops = useMemo(() => levelStops(levels.map((s) => levelNum(s)).filter(Number.isFinite)), [levels]);
  const browseRange: Range = levelRange ?? [browseStops[0] ?? 1, browseStops[browseStops.length - 1] ?? 15];

  // Pick-mode derived values
  const pickCharts = card ? chartsFor(card, activeRanges(pick)) : null;
  const pickPoolSize = catalog.length > 0 ? buildPool(catalog, poolOptions(pick, card?.shortid)).length : 0;
  const pickStops = levelStops(availableLevels(catalog));
  const playedThisSession = Object.keys(pick.sessionPlayed).length;

  // Format dropdown options
  const versionOptions = [
    { value: '', label: 'All Versions' },
    ...versions.map(v => ({ value: v.version, label: `${formatVersionName(v.version)} (${v.count})` }))
  ];

  const genreOptions = [
    { value: '', label: 'All Genres' },
    ...genres.map(g => ({ value: g.genre, label: `${g.genre} (${g.count})` }))
  ];

  const cabinetOptions = [
    { value: '', label: 'All Cabinets' },
    { value: 'SD', label: 'Standard (SD)' },
    { value: 'DX', label: 'DX Cabinet' },
  ];

  const sortOptions = [
    { value: 'id_asc', label: 'Default (Release ID)' },
    { value: 'diff_desc', label: 'Difficulty: High → Low' },
    { value: 'diff_asc', label: 'Difficulty: Low → High' },
    { value: 'title_asc', label: 'Title: A → Z' },
    { value: 'title_desc', label: 'Title: Z → A' },
    { value: 'bpm_desc', label: 'BPM: Fast → Slow' },
    { value: 'bpm_asc', label: 'BPM: Slow → Fast' },
  ];

  const exportFormatOptions = [
    { value: 'astrodx', label: 'AstroDX (.adx)' },
    { value: 'majdata', label: 'Majdata Play (.zip)' },
    { value: 'sonolus', label: 'Sonolus (.scp) — Experimental' },
    { value: 'raw', label: 'Raw Passthrough' },
  ];

  return (
    <div className="app-container">
      {/* Top Navigation Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-icon">
            <img src="/pwa-192.png" alt="maiIndex Icon" className="brand-pom-icon" />
          </div>
          <div>
            <h1 className="brand-title">
              <span className="brand-mai">mai</span>
              <span className="brand-accent-i">I</span>
              <span className="brand-ndex">ndex</span>
            </h1>
            <p className="brand-subtitle">
              maimai DX chart list (<Odometer value={totalSongs} /> Charts)
            </p>
          </div>
        </div>

        {/* Search Bar & View Mode Switcher */}
        <div className="header-controls">
          <div className="search-bar">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="title, artist, or song ID..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <div className="view-toggle">
            <button 
              className={`view-btn ${viewMode === 'grid' && !pickMode ? 'active' : ''}`}
              onClick={() => { setViewMode('grid'); setPickMode(false); }}
            >
              <LayoutGrid size={15} /> Grid
            </button>
            <button 
              className={`view-btn ${viewMode === 'table' && !pickMode ? 'active' : ''}`}
              onClick={() => { setViewMode('table'); setPickMode(false); }}
            >
              <List size={15} /> Table
            </button>
            <button
              className={`view-btn ${pickMode ? 'active' : ''}`}
              onClick={() => setPickMode(m => !m)}
              title="Pick one chart at a time instead of browsing"
            >
              <Shuffle size={15} /> Pick
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="app-main">
        {/* Filter Controls Panel */}
        <div className="filter-panel">
          <div className="filter-label">
            <Filter size={16} /> Filters:
          </div>

          {/* Version Custom Dropdown */}
          <CustomDropdown 
            options={versionOptions}
            value={version}
            onChange={(val) => { setVersion(val); setPage(1); }}
            placeholder="All Versions"
            minWidth="160px"
          />

          {/* Genre Custom Dropdown */}
          <CustomDropdown 
            options={genreOptions}
            value={genre}
            onChange={(val) => { setGenre(val); setPage(1); }}
            placeholder="All Genres"
            minWidth="150px"
          />

          {/* Cabinet Custom Dropdown */}
          <CustomDropdown 
            options={cabinetOptions}
            value={cabinet}
            onChange={(val) => { setCabinet(val); setPage(1); }}
            placeholder="All Cabinets"
            minWidth="140px"
          />

          {/* Sorting Custom Dropdown - browsing only, pick draws randomly */}
          {!pickMode && (
          <>
          <div className="filter-label" style={{ marginLeft: '4px' }}>
            <ArrowUpDown size={14} /> Sort:
          </div>
          <CustomDropdown 
            options={sortOptions}
            value={sort}
            onChange={(val) => { setSort(val); setPage(1); }}
            placeholder="Sort by..."
            minWidth="180px"
          />
          </>
          )}

          {/* Level bracket - browsing only. One full-width row, same shape as the
              pick-mode sliders, so the thumbs get room to be dragged. */}
          {!pickMode && (
            <div className="filter-range">
              <span className="pick-range-label">Level</span>
              <RangeSlider
                stops={browseStops}
                value={browseRange}
                onChange={(value) => setLevelRange(value)}
                onCommit={(value) => {
                  // Compare by value, not reference: a fresh [11, 12] array is never
                  // reference-equal, so re-releasing an unchanged range would refetch
                  // and flash the grid for a result set that is already on screen.
                  setLevelQuery(prev =>
                    prev && prev[0] === value[0] && prev[1] === value[1] ? prev : [value[0], value[1]]);
                  setPage(1);
                }}
              />
              <span className="pick-range-value">
                {levelRange
                  ? `${formatLevel(levelRange[0])}–${formatLevel(levelRange[1])}`
                  : 'All'}
              </span>
              {levelRange && (
                <button className="btn-reset" onClick={() => { setLevelRange(null); setLevelQuery(null); setPage(1); }}>
                  <X size={14} /> Any
                </button>
              )}
            </div>
          )}

          {/* Clear Filters Button */}
          {isFilterActive && (
            <button
              className="btn-reset"
              onClick={() => {
                setVersion(''); setGenre(''); setCabinet('');
                setSearch(''); setSearchInput(''); setSort('id_asc');
                setLevelRange(null); setLevelQuery(null); setPage(1);
              }}
            >
              <X size={14} /> Clear
            </button>
          )}

          {/* Select Page Actions — browsing only; pick mode has no checkboxes */}
          {!pickMode && (
          <div className="filter-right-actions">
            <button 
              className="btn-secondary"
              onClick={selectAllCurrentPage}
            >
              <CheckSquare size={14} /> Select Page ({songs.length})
            </button>
          </div>
          )}
        </div>

        {/* Pick Card, or the Songs Layout (Grid or Table View) */}
        {pickMode ? (
          <div className="pick-panel">
            <div className="pick-controls">
              <div className="pick-ranges">
                <div className="pick-range">
                  <span className="pick-range-label">You</span>
                  <RangeSlider
                    stops={pickStops}
                    value={pick.ranges[0]}
                    onChange={(value) => previewRange(0, value)}
                    onCommit={(value) => commitRange(0, value)}
                  />
                  <span className="pick-range-value">
                    {formatLevel(pick.ranges[0][0])}–{formatLevel(pick.ranges[0][1])}
                  </span>
                </div>

                {pick.twoPlayer && (
                  <div className="pick-range">
                    <span className="pick-range-label">Them</span>
                    <RangeSlider
                      stops={pickStops}
                      value={pick.ranges[1]}
                      onChange={(value) => previewRange(1, value)}
                      onCommit={(value) => commitRange(1, value)}
                    />
                    <span className="pick-range-value">
                      {formatLevel(pick.ranges[1][0])}–{formatLevel(pick.ranges[1][1])}
                    </span>
                  </div>
                )}
              </div>

              <div className="pick-toggles">
                <button
                  className={`btn-secondary ${pick.twoPlayer ? 'active' : ''}`}
                  onClick={() => applyPick({ ...pick, twoPlayer: !pick.twoPlayer })}
                  title="Pair up with a second player - the song has to work for both ranges"
                >
                  <Shuffle size={14} /> 2P
                </button>

                <label className="pick-checkbox">
                  <input
                    type="checkbox"
                    checked={pick.excludeUtage}
                    onChange={(e) => applyPick({ ...pick, excludeUtage: e.target.checked })}
                  />
                  Exclude [宴] Utage
                </label>

                <span className="pick-pool">
                  {catalogLoading
                    ? 'Loading catalog...'
                    : `${pickPoolSize.toLocaleString()} in pool · ${playedThisSession} played this session`}
                </span>
              </div>
            </div>

            {catalogLoading ? (
              <div className="loading-state">
                <RefreshCw size={36} className="spinner" style={{ margin: '0 auto 16px', display: 'block', color: 'var(--accent-primary)' }} />
                Loading the catalog...
              </div>
            ) : card && pickCharts ? (
              <div className="pick-card" key={card.shortid}>
                <div className="pick-cover">
                  {getCabinetType(card) && (
                    <span className={`cabinet-pill ${getCabinetType(card)!.toLowerCase()}`}>
                      {getCabinetType(card)}
                    </span>
                  )}
                  {card.cover_file ? (
                    <img
                      src={`/api/songs/${card.id}/cover`}
                      alt={card.title}
                      className="cover-image"
                      title="Chart info"
                      onClick={() => openDetail(card)}
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                  ) : (
                    <Music size={42} className="cover-placeholder" />
                  )}
                </div>

                <div className="pick-body">
                  <div className="card-meta">
                    {formatVersionName(card.version)} • {card.genre || 'maimai'}
                    {pick.played[card.shortid] ? ` • played ${pick.played[card.shortid]}×` : ''}
                  </div>
                  <h2 className="pick-title" title={card.title}>{formatSongTitle(card.title)}</h2>
                  <p className="card-artist">{card.artist}</p>

                  {/* One chart per active range - this is the line you read out at the cabinet */}
                  <div className="pick-charts">
                    {pickCharts.map((chart, idx) => (
                      <div key={idx} className="pick-chart">
                        <span className="pick-who">{idx === 0 ? 'You' : 'Them'}</span>
                        <span className={`badge ${chart.slot.badge}`}>{chart.slot.label} {chart.display}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pick-actions">
                    <button className="btn-export" onClick={handleReroll}>
                      <RefreshCw size={16} /> Reroll
                    </button>
                    <button className="btn-secondary" onClick={handleSkip}>
                      <SkipForward size={14} /> Skip
                    </button>
                    <button className="btn-secondary" onClick={() => openDetail(card)}>
                      <Info size={14} /> Chart info
                    </button>
                    <button className="btn-secondary" onClick={handlePlayed}>
                      <Check size={14} /> Played
                    </button>
                    {card.audio_file && (
                      <button className="btn-icon" onClick={() => handleAudioPlay(card)} title="Preview audio">
                        {activeAudioSong?.id === card.id && isPlaying
                          ? <Pause size={16} color="var(--accent-primary)" />
                          : <Play size={16} />}
                      </button>
                    )}
                  </div>

                  <div className="pick-footer">
                    <button className="btn-reset" onClick={handleResetSession}>
                      <RotateCcw size={13} /> Reset session
                    </button>
                    <button className="btn-reset" onClick={handleClearPlayed}>
                      <Trash2 size={13} /> Clear played history
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                Nothing left in that range — widen it, clear a filter, reset the session, or clear played history.
                <div className="pick-actions" style={{ justifyContent: 'center', marginTop: 14 }}>
                  <button className="btn-export" onClick={handleResetSession}>
                    <RotateCcw size={15} /> Reset session
                  </button>
                  <button className="btn-secondary" onClick={handleClearPlayed}>
                    <Trash2 size={14} /> Clear played history
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : songs.length === 0 ? (
          // Nothing to keep on screen yet, so a full-height placeholder is honest.
          loading ? (
            <div className="loading-state">
              <RefreshCw size={36} className="spinner" style={{ margin: '0 auto 16px', display: 'block', color: 'var(--accent-primary)' }} />
              Loading chart collection...
            </div>
          ) : (
            <div className="empty-state">
              No songs found matching your search criteria.
            </div>
          )
        ) : (
          // Results stay mounted while a new page loads - replacing them with a
          // spinner is what made the whole screen jump on every filter change.
          <div className={`results ${busy ? 'is-loading' : ''}`} aria-busy={busy}>
            {/* Top Pagination Bar */}
            <div className="pagination top-pagination">
              <span className="pagination-text">
                Showing <strong><Odometer value={songs.length} /></strong> charts (Page <strong><Odometer value={page} /></strong> of <strong><Odometer value={totalPages} /></strong>)
              </span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button 
                  className="btn-pagination"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  Previous
                </button>
                <button 
                  className="btn-pagination"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>

            {viewMode === 'grid' ? (
              /* Grid View */
          <div className="songs-grid">
            {songs.map(song => {
              const isSelected = selectedIds.has(song.shortid);
              const isAudioActive = activeAudioSong?.id === song.id && isPlaying;

              return (
                <div 
                  key={song.id}
                  className={`song-card ${isSelected ? 'selected' : ''}`}
                >
                  {/* Select Checkbox Top Left */}
                  <div 
                    className="card-checkbox"
                    onClick={() => toggleSelectSong(song.shortid)}
                    title={isSelected ? "Deselect song" : "Select song"}
                  >
                    {isSelected ? (
                      <CheckSquare size={18} color="var(--accent-primary)" />
                    ) : (
                      <Square size={18} color="var(--text-muted)" />
                    )}
                  </div>

                  {/* Artwork Cover */}
                  <div className="cover-wrapper">
                    {getCabinetType(song) && (
                      <span className={`cabinet-pill ${getCabinetType(song)!.toLowerCase()}`}>
                        {getCabinetType(song)}
                      </span>
                    )}

                    {song.cover_file ? (
                      <img
                        src={`/api/songs/${song.id}/cover`}
                        alt={song.title}
                        className="cover-image"
                        title="Chart info"
                        loading="lazy"
                        decoding="async"
                        onClick={() => openDetail(song)}
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      />
                    ) : (
                      <Music size={42} className="cover-placeholder" />
                    )}

                    {/* Quick Audio Play Button Overlay */}
                    {song.audio_file && (
                      <button
                        className={`play-btn-overlay ${isAudioActive ? 'active' : ''}`}
                        onClick={() => handleAudioPlay(song)}
                        title={isAudioActive ? "Pause Audio Preview" : "Play Audio Preview"}
                      >
                        {isAudioActive ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: '2px' }} />}
                      </button>
                    )}
                  </div>

                  {/* Content Info */}
                  <div className="card-body">
                    <div className="card-meta">
                      {formatVersionName(song.version)} • {song.genre || 'maimai'}
                    </div>
                    <h3 className="card-title" title={song.title}>
                      {formatSongTitle(song.title)}
                    </h3>
                    <p className="card-artist" title={song.artist}>
                      {song.artist}
                    </p>

                    {/* Difficulty Badges */}
                    <div className="difficulty-list">
                      {getSongDifficulties(song).map((diff, idx) => (
                        <span key={idx} className={`badge ${diff.className}`}>
                          {diff.label} {diff.value}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table View */
          <div className="table-container">
            <table className="song-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>Select</th>
                  <th style={{ width: '60px' }}>Cover</th>
                  <th>Title / Artist</th>
                  <th>Version</th>
                  <th>Genre</th>
                  <th>BPM</th>
                  <th>Difficulties</th>
                  <th style={{ textAlign: 'right' }}>Audio</th>
                </tr>
              </thead>
              <tbody>
                {songs.map(song => {
                  const isSelected = selectedIds.has(song.shortid);
                  const isAudioActive = activeAudioSong?.id === song.id && isPlaying;
                  const cabinet = getCabinetType(song);
                  return (
                    <tr key={song.id} className={isSelected ? 'selected' : ''}>
                      <td>
                        <div 
                          className="card-checkbox" 
                          style={{ position: 'static', background: 'transparent' }}
                          onClick={() => toggleSelectSong(song.shortid)}
                        >
                          {isSelected ? (
                            <CheckSquare size={18} color="var(--accent-primary)" />
                          ) : (
                            <Square size={18} color="var(--text-muted)" />
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="table-cover">
                          {song.cover_file && (
                            <img
                              src={`/api/songs/${song.id}/cover`}
                              alt={song.title}
                              loading="lazy"
                              decoding="async"
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                            />
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="table-title" onClick={() => openDetail(song)} title="Chart info">
                          {formatSongTitle(song.title)}
                          {cabinet && (
                            <span 
                              className={`cabinet-pill ${cabinet.toLowerCase()}`} 
                              style={{ position: 'static', display: 'inline-block', marginLeft: '6px', fontSize: '9px', padding: '1px 5px', verticalAlign: 'middle' }}
                            >
                              {cabinet}
                            </span>
                          )}
                        </div>
                        <div className="table-artist">{song.artist}</div>
                      </td>
                      <td>
                        <span className="table-version">{formatVersionName(song.version)}</span>
                      </td>
                      <td>{song.genre}</td>
                      <td>{song.bpm || '-'}</td>
                      <td>
                        <div className="difficulty-list">
                          {getSongDifficulties(song).map((diff, idx) => (
                            <span key={idx} className={`badge ${diff.className}`}>
                              {diff.label} {diff.value}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {song.audio_file && (
                          <button 
                            className="btn-icon"
                            onClick={() => handleAudioPlay(song)}
                            title={isAudioActive ? "Pause Audio Preview" : "Play Audio Preview"}
                          >
                            {isAudioActive ? <Pause size={16} color="var(--accent-primary)" /> : <Play size={16} />}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )}

        {/* Pagination Bar - browsing only */}
        {!pickMode && (
        <div className="pagination">
          <button 
            className="btn-pagination"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
          >
            Previous
          </button>
          <span className="pagination-text">
            Page <strong><Odometer value={page} /></strong> of <strong><Odometer value={totalPages} /></strong>
          </span>
          <button 
            className="btn-pagination"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </button>
        </div>
        )}
      </main>

      <footer className="app-footer">
        <span className="footer-name">maiIndex</span>
        <span className="footer-sep" aria-hidden="true">·</span>
        <span>charts indexed from the maimai archive set</span>
        <span className="footer-sep" aria-hidden="true">·</span>
        <span><Odometer value={totalSongs} /> charts</span>
      </footer>

      {/* Floating Audio Dock */}
      {activeAudioSong && (
        <div className="audio-dock">
          <button 
            className="dock-play-btn"
            onClick={() => handleAudioPlay(activeAudioSong)}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: '2px' }} />}
          </button>

          <div className="dock-info">
            <div className="dock-title">{activeAudioSong.title}</div>
            <div className="dock-artist">{activeAudioSong.artist}</div>
          </div>

          {/* Scrubbable Song Seeker */}
          <div className="audio-seeker-container">
            <span className="seeker-time">{formatTime(currentTime)}</span>
            <input 
              type="range" 
              className="seeker-slider"
              min="0" 
              max={duration || 100} 
              step="0.1" 
              value={currentTime}
              onChange={(e) => {
                const newTime = parseFloat(e.target.value);
                setCurrentTime(newTime);
                if (audioElement) audioElement.currentTime = newTime;
              }}
            />
            <span className="seeker-time">{formatTime(duration)}</span>
          </div>

          {/* Volume Control with Indicator & Continuous Smooth Slider */}
          <div className="volume-controls">
            <button 
              className="btn-icon"
              onClick={() => {
                const nextVol = volume > 0 ? 0 : 0.3;
                setVolume(nextVol);
                if (audioElement) audioElement.volume = nextVol;
              }}
              title={volume === 0 ? "Unmute" : "Mute"}
            >
              {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} color="var(--accent-primary)" />}
            </button>

            <div 
              className="volume-slider-container"
              onMouseEnter={() => setIsAdjustingVolume(true)}
              onMouseLeave={() => setIsAdjustingVolume(false)}
            >
              {isAdjustingVolume && (
                <div className="volume-tooltip">
                  {Math.round(volume * 100)}%
                </div>
              )}
              <input 
                type="range" 
                className="volume-slider"
                min="0" 
                max="1" 
                step="0.001" 
                value={volume}
                onMouseDown={() => setIsAdjustingVolume(true)}
                onMouseUp={() => setIsAdjustingVolume(false)}
                onTouchStart={() => setIsAdjustingVolume(true)}
                onTouchEnd={() => setIsAdjustingVolume(false)}
                onChange={(e) => {
                  const newVol = parseFloat(e.target.value);
                  setVolume(newVol);
                  if (audioElement) audioElement.volume = newVol;
                }}
              />
            </div>
          </div>

          <button 
            className="btn-icon"
            onClick={() => { audioElement?.pause(); setActiveAudioSong(null); setIsPlaying(false); }}
            title="Close Audio Player"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Song Detail Modal - chart stats + download */}
      {detailSong && (
        <div className="modal-overlay" onClick={closeDetail}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-box">
                {detailSong.cover_file ? (
                  <img className="modal-cover" src={`/api/songs/${detailSong.id}/cover`} alt="" />
                ) : (
                  <div className="modal-cover" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Music size={22} />
                  </div>
                )}
                <div>
                  <div className="modal-heading">{formatSongTitle(detailSong.title)}</div>
                  <div className="detail-sub">{detailSong.artist}</div>
                </div>
              </div>
              <button className="btn-icon" onClick={closeDetail} title="Close">
                <X size={18} />
              </button>
            </div>

            {!detailData ? (
              <div className="modal-body">
                <div className="loading-state" style={{ padding: '30px 0' }}>
                  <RefreshCw size={28} className="spinner" style={{ margin: '0 auto 12px', display: 'block', color: 'var(--accent-primary)' }} />
                  Loading chart info...
                </div>
              </div>
            ) : (
              <div className="modal-body">
                <div className="designer-grid">
                  <div className="designer-card"><div className="designer-label">BPM</div><div className="designer-name">{detailData.bpm || '—'}</div></div>
                  <div className="designer-card"><div className="designer-label">Genre</div><div className="designer-name">{detailData.genre || '—'}</div></div>
                  <div className="designer-card"><div className="designer-label">Version</div><div className="designer-name">{formatVersionName(detailData.version)}</div></div>
                  <div className="designer-card"><div className="designer-label">Cabinet</div><div className="designer-name">{detailData.cabinet || '—'}</div></div>
                  <div className="designer-card"><div className="designer-label">Charter</div><div className="designer-name">{detailData.charter || '—'}</div></div>
                  <div className="designer-card"><div className="designer-label">Song ID</div><div className="designer-name">{detailData.shortid}</div></div>
                </div>

                <div className="detail-heading">Charts</div>
                <div className="detail-charts">
                  {detailData.charts.length === 0 && (
                    <div className="detail-sub">No charts indexed for this song.</div>
                  )}
                  {detailData.charts.map((chart) => {
                    const slot = SLOTS.find((s) => s.key === `lv_${chart.slot}`);
                    return (
                      <div key={chart.slot} className="detail-chart-row">
                        <span className={`badge ${slot?.badge || 'badge-basic'}`}>
                          {slot?.label || `lv_${chart.slot}`} {chart.level}
                        </span>
                        <span className="detail-chart-notes">
                          {chart.notes === null
                            ? 'note count unavailable'
                            : <><strong className="detail-notes-strong">{chart.notes.toLocaleString()}</strong> notes
                              {chart.nps !== null && <> · <span className="detail-nps">{chart.nps.toFixed(2)} nps</span></>}</>}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="modal-actions">
                  <CustomDropdown
                    options={exportFormatOptions}
                    value={exportFormat}
                    onChange={(val) => setExportFormat(val as any)}
                    minWidth="170px"
                  />
                  <button className="btn-export" disabled={exporting} onClick={() => exportSongs([detailSong.shortid])}>
                    {exporting ? <RefreshCw size={16} className="spinner" /> : <Download size={16} />}
                    {exporting ? 'Exporting...' : 'Download'}
                  </button>
                  {detailSong.audio_file && (
                    <button className="btn-secondary" onClick={() => previewFromModal(detailSong)}>
                      {activeAudioSong?.id === detailSong.id && isPlaying ? <Pause size={14} /> : <Play size={14} />} Preview
                    </button>
                  )}
                  <button className="btn-card-action" onClick={() => shareSong(detailSong)} title="Share this song" aria-label="Share this song">
                    <Share2 size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Batch Export Cart Dock */}
      {selectedIds.size > 0 && (
        <div className={`export-dock ${activeAudioSong ? 'has-audio-dock' : ''}`}>
          <div className="export-info">
            <div className="export-count">
              <ListChecks size={16} color="var(--accent-primary)" /> {selectedIds.size} {selectedIds.size === 1 ? 'Song' : 'Songs'} Selected
            </div>
            <div className="export-subtext">Ready for batch streaming</div>
          </div>

          {/* Format Picker Custom Dropdown */}
          <CustomDropdown 
            options={exportFormatOptions}
            value={exportFormat}
            onChange={(val) => setExportFormat(val as any)}
            minWidth="160px"
            dropUp={true}
          />

          {/* Download Action Button */}
          <button 
            className="btn-export"
            disabled={exporting}
            onClick={handleExport}
          >
            {exporting ? (
              <>
                <RefreshCw size={16} className="spinner" /> Exporting...
              </>
            ) : (
              <>
                <Download size={16} /> Export {exportFormat === 'astrodx' ? 'ADX' : exportFormat === 'sonolus' ? 'SCP' : 'ZIP'}
              </>
            )}
          </button>

          <button 
            className="btn-icon"
            onClick={clearSelection}
            title="Clear selection"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Transient status message (share copy confirmation) */}
      {toast && (
        <div className="toast-badge" role="status">
          <Check size={16} color="var(--accent-primary)" />
          {toast}
        </div>
      )}
    </div>
  );
}
