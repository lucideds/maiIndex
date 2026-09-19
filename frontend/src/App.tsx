import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Music, Download, LayoutGrid, List, Play, Pause, 
  CheckSquare, Square, Filter, RefreshCw, X, ListChecks,
  Volume2, VolumeX, ArrowUpDown, ChevronDown, Check,
  Shuffle, SkipForward, RotateCcw, Trash2
} from 'lucide-react';
import {
  activeRanges, availableLevels, buildPool, chartsFor, drawSong,
  loadState, poolOptions, saveState,
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
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  onCommit?: (value: [number, number]) => void;
}

/**
 * Level range as a dual-thumb slider over whole levels - a level range is a bracket,
 * not a pair of exact values, and nobody wants to pick "12.3" out of a menu.
 * Widths are percentages of the track, the thumbs sit on the two native range inputs.
 */
function RangeSlider({ min, max, value, onChange, onCommit }: RangeSliderProps) {
  const span = Math.max(1, max - min);
  const pct = (n: number) => ((n - min) / span) * 100;
  const [low, high] = value;

  return (
    <div className="dual-range-container">
      <div className="dual-range-track-bg" />
      <div
        className="dual-range-track-active"
        style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }}
      />
      <input
        type="range"
        className="dual-range-input"
        min={min}
        max={max}
        step={1}
        value={low}
        aria-label="Lowest level"
        onChange={(e) => onChange([Math.min(Number(e.target.value), high), high])}
        onPointerUp={() => onCommit?.(value)}
        onKeyUp={() => onCommit?.(value)}
      />
      <input
        type="range"
        className="dual-range-input"
        min={min}
        max={max}
        step={1}
        value={high}
        aria-label="Highest level"
        onChange={(e) => onChange([low, Math.max(Number(e.target.value), low)])}
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

  // Filters
  const [search, setSearch] = useState('');
  const [version, setVersion] = useState('');
  const [genre, setGenre] = useState('');
  const [cabinet, setCabinet] = useState('');
  const [sort, setSort] = useState('id_asc');
  
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
  }, [page, search, version, genre, cabinet, sort]);

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
      const res = await fetch(`/api/songs?${params.toString()}`);
      const data = await res.json();
      setSongs(data.songs || []);
      setTotalSongs(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (e) {
      console.error('Failed to fetch songs:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      const [vRes, gRes] = await Promise.all([
        fetch('/api/songs/versions'),
        fetch('/api/songs/genres'),
      ]);
      const vData = await vRes.json();
      const gData = await gRes.json();
      setVersions(vData);
      setGenres(gData);
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

  const handleExport = async () => {
    if (selectedIds.size === 0) return;
    setExporting(true);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songIds: Array.from(selectedIds),
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

  const isFilterActive = version || genre || cabinet || search || sort !== 'id_asc';

  // Pick-mode derived values
  const pickCharts = card ? chartsFor(card, activeRanges(pick)) : null;
  const pickPoolSize = catalog.length > 0 ? buildPool(catalog, poolOptions(pick, card?.shortid)).length : 0;
  const catalogLevels = availableLevels(catalog);
  const levelMin = catalogLevels.length > 0 ? Math.max(1, Math.floor(catalogLevels[0])) : 1;
  const levelMax = catalogLevels.length > 0 ? Math.ceil(catalogLevels[catalogLevels.length - 1]) : 15;
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
    { value: 'sonolus', label: 'Sonolus (.scp)' },
    { value: 'raw', label: 'Raw Passthrough' },
  ];

  return (
    <div className="app-container">
      {/* Top Navigation Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-icon">
            <img src="/pom.png" alt="MaiIndex Icon" className="brand-pom-icon" />
          </div>
          <div>
            <h1 className="brand-title">
              <span className="brand-mai">Mai</span>
              <span className="brand-accent-i">I</span>
              <span className="brand-ndex">ndex</span>
            </h1>
            <p className="brand-subtitle">
              Maimai DX Chart Hub & Converter ({totalSongs.toLocaleString()} Charts)
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
              placeholder="Search title, artist, or song ID..." 
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
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

          {/* Sorting Custom Dropdown */}
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

          {/* Clear Filters Button */}
          {isFilterActive && (
            <button 
              className="btn-reset"
              onClick={() => { setVersion(''); setGenre(''); setCabinet(''); setSearch(''); setSort('id_asc'); setPage(1); }}
            >
              <X size={14} /> Clear
            </button>
          )}

          {/* Select Page Actions */}
          <div className="filter-right-actions">
            <button 
              className="btn-secondary"
              onClick={selectAllCurrentPage}
            >
              <CheckSquare size={14} /> Select Page ({songs.length})
            </button>
          </div>
        </div>

        {/* Pick Card, or the Songs Layout (Grid or Table View) */}
        {pickMode ? (
          <div className="pick-panel">
            <div className="pick-controls">
              <div className="pick-range">
                <span className="pick-range-label">You</span>
                <span className="pick-range-value">{pick.ranges[0][0]}–{pick.ranges[0][1]}</span>
                <RangeSlider
                  min={levelMin}
                  max={levelMax}
                  value={pick.ranges[0]}
                  onChange={(value) => previewRange(0, value)}
                  onCommit={(value) => commitRange(0, value)}
                />
              </div>

              {pick.twoPlayer && (
                <div className="pick-range">
                  <span className="pick-range-label">Them</span>
                  <span className="pick-range-value">{pick.ranges[1][0]}–{pick.ranges[1][1]}</span>
                  <RangeSlider
                    min={levelMin}
                    max={levelMax}
                    value={pick.ranges[1]}
                    onChange={(value) => previewRange(1, value)}
                    onCommit={(value) => commitRange(1, value)}
                  />
                </div>
              )}

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
              </div>
            )}
          </div>
        ) : loading ? (
          <div className="loading-state">
            <RefreshCw size={36} className="spinner" style={{ margin: '0 auto 16px', display: 'block', color: 'var(--accent-primary)' }} />
            Loading chart collection...
          </div>
        ) : songs.length === 0 ? (
          <div className="empty-state">
            No songs found matching your search criteria.
          </div>
        ) : (
          <>
            {/* Top Pagination Bar */}
            <div className="pagination top-pagination">
              <span className="pagination-text">
                Showing <strong>{songs.length}</strong> charts (Page <strong>{page}</strong> of <strong>{totalPages}</strong>)
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
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                            />
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="table-title">
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
      </>
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
            Page <strong>{page}</strong> of <strong>{totalPages}</strong>
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
    </div>
  );
}
