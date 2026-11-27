import {
  ArrowDown,
  ArrowUp,
  Clock,
  Copy,
  Edit3,
  GripVertical,
  ListMusic,
  Play,
  Plus,
  Search,
  SkipForward,
  Trash2,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import {
  buildAccentPattern,
  CLICK_SOUNDS,
  SUBDIVISIONS,
  TIME_SIGNATURE_PRESETS,
} from '../constants/metronomeData';
import {
  ClickSoundId,
  CountInBars,
  MetronomeSessionState,
  RemotePermissions,
  Setlist,
  SetlistItem,
  SubdivisionType,
  TempoSection,
} from '../types/metronome';
import { TimelineSnapshot } from '../utils/timeline';

interface SetlistManagerProps {
  session: MetronomeSessionState;
  timeline: TimelineSnapshot;
  getTimelineSnapshot?: () => TimelineSnapshot;
  setlists: Setlist[];
  isHost: boolean;
  permissions: RemotePermissions;
  onSaveSetlists: (next: Setlist[]) => Promise<void>;
  onLoadSetlist: (items: SetlistItem[], setlistId: string) => void;
  onSelectSong: (index: number) => void;
  onPlay: () => void;
}

function formatCountdownSeconds(totalSec: number): string {
  const clamped = Math.max(0, Math.ceil(totalSec));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const SetlistManager: React.FC<SetlistManagerProps> = React.memo(({
  session,
  timeline,
  getTimelineSnapshot,
  setlists,
  isHost,
  permissions,
  onSaveSetlists,
  onLoadSetlist,
  onSelectSong,
  onPlay,
}) => {
  const [selectedSetlistId, setSelectedSetlistId] = useState<string>(
    session.activeSetlistId ?? setlists[0]?.id ?? ''
  );
  const [editingItem, setEditingItem] = useState<SetlistItem | null>(null);
  const [isNewSong, setIsNewSong] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [newSetName, setNewSetName] = useState('');
  const [showNewSetInput, setShowNewSetInput] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [manualCue, setManualCue] = useState<
    | { mode: 'bars'; targetTotalBeats: number; totalBeatsSpan: number; songId: string }
    | { mode: 'seconds'; endAtMs: number; totalSec: number; songId: string }
    | null
  >(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const currentSetlist =
    setlists.find((s) => s.id === selectedSetlistId) ?? setlists[0] ?? null;

  const filteredSongs = useMemo(() => {
    if (!currentSetlist) return [];
    const q = searchQuery.trim().toLowerCase();
    return currentSetlist.items
      .map((song, idx) => ({ song, idx }))
      .filter(
        ({ song }) =>
          !q ||
          song.songName.toLowerCase().includes(q) ||
          (song.notes && song.notes.toLowerCase().includes(q)) ||
          String(song.bpm).includes(q)
      );
  }, [currentSetlist, searchQuery]);

  const canNav = isHost || permissions.setlistNav;
  const isLoadedInSession = currentSetlist?.id === session.activeSetlistId;
  const activeSong =
    isLoadedInSession && currentSetlist
      ? currentSetlist.items[session.activeSongIndex] ?? null
      : null;
  const upcomingIndex =
    isLoadedInSession &&
    currentSetlist &&
    session.activeSongIndex >= 0 &&
    session.activeSongIndex + 1 < currentSetlist.items.length
      ? session.activeSongIndex + 1
      : -1;
  const upcomingSong =
    upcomingIndex >= 0 && currentSetlist ? currentSetlist.items[upcomingIndex] ?? null : null;

  // Clear manual prep cue if active song changes
  useEffect(() => {
    if (manualCue && activeSong && manualCue.songId !== activeSong.id) {
      setManualCue(null);
    }
  }, [activeSong, manualCue]);

  // Lightweight 250ms tick for live countdown timer updates while playing or prep timer running
  const hasTimedSong = Boolean(
    activeSong &&
      (activeSong.bars > 0 ||
        (activeSong.tempoSections && activeSong.tempoSections.some((s) => s.bars > 0)))
  );
  const needsCountdownTick =
    Boolean(upcomingSong) &&
    ((timeline.isPlaying && (hasTimedSong || manualCue?.mode === 'bars')) ||
      manualCue?.mode === 'seconds');

  useEffect(() => {
    if (!needsCountdownTick) return;
    const id = window.setInterval(() => {
      setNowTick(Date.now());
    }, 220);
    return () => window.clearInterval(id);
  }, [needsCountdownTick]);

  const transitionCountdown = useMemo(() => {
    void nowTick;
    if (!upcomingSong || !activeSong) return null;

    const snap = getTimelineSnapshot ? getTimelineSnapshot() : timeline;
    const beatsPerBar = Math.max(1, session.timeSignature.numerator);
    const countInBeats = session.countInBars * beatsPerBar;
    const currentBpm = Math.max(20, session.bpm);

    // 1. Timed tempo sections
    const timedSections = (activeSong.tempoSections ?? []).filter((s) => s.bars > 0);
    if (timedSections.length > 0) {
      const totalSongBeats = timedSections.reduce((sum, s) => sum + s.bars * beatsPerBar, 0);
      const totalAllBeats = countInBeats + totalSongBeats;
      const elapsedBeats = Math.max(0, snap.totalBeatsElapsed);
      const remainingTotalBeats = Math.max(0, totalAllBeats - elapsedBeats);

      let remainingSec = 0;
      if (snap.isCountingIn) {
        remainingSec += Math.max(0, countInBeats - elapsedBeats) * (60 / currentBpm);
        for (const sec of timedSections) {
          remainingSec += (sec.bars * beatsPerBar) * (60 / Math.max(20, sec.bpm));
        }
      } else {
        const songElapsed = Math.max(0, snap.songBeatsElapsed);
        let cursor = 0;
        for (const sec of timedSections) {
          const secBeats = sec.bars * beatsPerBar;
          const secEnd = cursor + secBeats;
          if (songElapsed < secEnd) {
            const remInSec = Math.min(secBeats, secEnd - songElapsed);
            remainingSec += remInSec * (60 / Math.max(20, sec.bpm));
          }
          cursor = secEnd;
        }
      }

      const remainingBars = Math.max(0, Math.ceil(remainingTotalBeats / beatsPerBar));
      const progress = totalAllBeats > 0 ? Math.min(1, Math.max(0, elapsedBeats / totalAllBeats)) : 0;
      return {
        mode: 'auto' as const,
        remainingSec,
        remainingBars,
        totalBars: timedSections.reduce((sum, s) => sum + s.bars, 0),
        progress,
        isImminent: remainingSec <= 10 || remainingBars <= 2,
        isComplete: remainingTotalBeats <= 0.1,
      };
    }

    // 2. Timed bar length on song
    if (activeSong.bars > 0) {
      const totalSongBeats = activeSong.bars * beatsPerBar;
      const totalAllBeats = countInBeats + totalSongBeats;
      const elapsedBeats = Math.max(0, snap.totalBeatsElapsed);
      const remainingBeats = Math.max(0, totalAllBeats - elapsedBeats);
      const remainingSec = remainingBeats * (60 / currentBpm);
      const remainingBars = Math.max(0, Math.ceil(remainingBeats / beatsPerBar));
      const progress = totalAllBeats > 0 ? Math.min(1, Math.max(0, elapsedBeats / totalAllBeats)) : 0;
      return {
        mode: 'auto' as const,
        remainingSec,
        remainingBars,
        totalBars: activeSong.bars,
        progress,
        isImminent: remainingSec <= 10 || remainingBars <= 2,
        isComplete: remainingBeats <= 0.1,
      };
    }

    // 3. Manual bar-locked prep cue (while active song has bars=0)
    if (manualCue && manualCue.mode === 'bars') {
      const remainingBeats = Math.max(0, manualCue.targetTotalBeats - snap.totalBeatsElapsed);
      const remainingSec = remainingBeats * (60 / currentBpm);
      const remainingBars = Math.max(0, Math.ceil(remainingBeats / beatsPerBar));
      const progress = Math.min(
        1,
        Math.max(0, 1 - remainingBeats / Math.max(1, manualCue.totalBeatsSpan))
      );
      return {
        mode: 'manual-bars' as const,
        remainingSec,
        remainingBars,
        totalBars: Math.round(manualCue.totalBeatsSpan / beatsPerBar),
        progress,
        isImminent: remainingSec <= 8 || remainingBars <= 1,
        isComplete: remainingBeats <= 0.1,
      };
    }

    // 4. Manual seconds prep timer
    if (manualCue && manualCue.mode === 'seconds') {
      const remainingSec = Math.max(0, (manualCue.endAtMs - Date.now()) / 1000);
      const progress = Math.min(
        1,
        Math.max(0, 1 - remainingSec / Math.max(1, manualCue.totalSec))
      );
      return {
        mode: 'manual-seconds' as const,
        remainingSec,
        remainingBars: null,
        totalBars: null,
        progress,
        isImminent: remainingSec <= 5,
        isComplete: remainingSec <= 0.1,
      };
    }

    return {
      mode: 'manual-idle' as const,
      remainingSec: null,
      remainingBars: null,
      totalBars: null,
      progress: 0,
      isImminent: false,
      isComplete: false,
    };
  }, [
    activeSong,
    getTimelineSnapshot,
    manualCue,
    nowTick,
    session.bpm,
    session.countInBars,
    session.timeSignature.numerator,
    timeline,
    upcomingSong,
  ]);

  const startBarCue = (barsCount: number) => {
    if (!activeSong) return;
    const snap = getTimelineSnapshot ? getTimelineSnapshot() : timeline;
    const beatsPerBar = Math.max(1, session.timeSignature.numerator);
    const span = barsCount * beatsPerBar;
    setManualCue({
      mode: 'bars',
      targetTotalBeats: snap.totalBeatsElapsed + span,
      totalBeatsSpan: span,
      songId: activeSong.id,
    });
  };

  const startSecondsCue = (seconds: number) => {
    if (!activeSong) return;
    setManualCue({
      mode: 'seconds',
      endAtMs: Date.now() + seconds * 1000,
      totalSec: seconds,
      songId: activeSong.id,
    });
  };

  const updateCurrentSetlistItems = async (items: SetlistItem[]) => {
    if (!currentSetlist) return;
    const updated = setlists.map((s) =>
      s.id === currentSetlist.id ? { ...s, items, updatedAt: Date.now() } : s
    );
    await onSaveSetlists(updated);
  };

  const handleCreateSetlist = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newSetName.trim();
    if (!trimmed) return;
    const created: Setlist = {
      id: `set-${Date.now()}`,
      name: trimmed,
      updatedAt: Date.now(),
      items: [],
    };
    const next = [...setlists, created];
    await onSaveSetlists(next);
    setSelectedSetlistId(created.id);
    setNewSetName('');
    setShowNewSetInput(false);
    if (isHost) {
      onLoadSetlist(created.items, created.id);
    }
  };

  const handleOpenAddSong = () => {
    setIsNewSong(true);
    setEditingItem({
      id: `song-${Date.now()}`,
      songName: '',
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      clickSound: 'studio',
      subdivision: 'quarter',
      accentPattern: ['accent', 'normal', 'normal', 'normal'],
      countInBars: 2,
      bars: 0,
      autoAdvance: false,
      notes: '',
      tempoSections: [],
    });
  };

  const handleSaveSong = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !currentSetlist) return;
    const cleanName = editingItem.songName.trim() || 'Untitled Song';
    const itemToSave: SetlistItem = {
      ...editingItem,
      songName: cleanName,
      bpm: Math.min(300, Math.max(20, Number(editingItem.bpm) || 120)),
    };

    const nextItems = isNewSong
      ? [...currentSetlist.items, itemToSave]
      : currentSetlist.items.map((it) => (it.id === itemToSave.id ? itemToSave : it));

    await updateCurrentSetlistItems(nextItems);
    setEditingItem(null);
  };

  const handleDuplicate = async (item: SetlistItem) => {
    if (!currentSetlist) return;
    const copy: SetlistItem = {
      ...item,
      id: `song-${Date.now()}`,
      songName: `${item.songName} (Copy)`,
      accentPattern: [...item.accentPattern],
      tempoSections: item.tempoSections ? item.tempoSections.map((t) => ({ ...t })) : [],
    };
    const idx = currentSetlist.items.findIndex((i) => i.id === item.id);
    const next = [...currentSetlist.items];
    next.splice(idx + 1, 0, copy);
    await updateCurrentSetlistItems(next);
  };

  const handleDelete = async (id: string) => {
    if (!currentSetlist) return;
    const next = currentSetlist.items.filter((i) => i.id !== id);
    await updateCurrentSetlistItems(next);
  };

  const moveItem = async (fromIdx: number, toIdx: number) => {
    if (!currentSetlist) return;
    if (toIdx < 0 || toIdx >= currentSetlist.items.length || fromIdx === toIdx) return;
    const next = [...currentSetlist.items];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    await updateCurrentSetlistItems(next);
  };

  const handlePlaySongFromSetlist = (index: number) => {
    if (!currentSetlist) return;
    if (!isLoadedInSession && isHost) {
      onLoadSetlist(currentSetlist.items, currentSetlist.id);
    }
    onSelectSong(index);
    if (isHost || permissions.playStop) {
      onPlay();
    }
  };

  return (
    <div className="space-y-4">
      {/* Setlist Selector & Actions Header */}
      <section className="hc-surface studio-panel rounded-2xl border border-slate-200/90 dark:border-white/[0.08] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              Setlist Manager
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
              Drag songs or use arrows to reorder, configure count-ins, or add tempo sections.
            </p>
          </div>

          {isHost && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowNewSetInput((v) => !v)}
                className="studio-keycap inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-200 dark:hover:bg-white/10 transition min-h-[40px]"
              >
                <ListMusic className="w-3.5 h-3.5" />
                <span>New Set</span>
              </button>
              <button
                type="button"
                onClick={handleOpenAddSong}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-400 transition min-h-[40px]"
              >
                <Plus className="w-4 h-4" />
                <span>Add Song</span>
              </button>
            </div>
          )}
        </div>

        {/* Setlist Switcher Tabs */}
        <div className="scroll-touch mt-4 flex items-center gap-2 overflow-x-auto pb-1">
          {setlists.map((setItem) => {
            const active = setItem.id === currentSetlist?.id;
            return (
              <button
                key={setItem.id}
                type="button"
                onClick={() => {
                  setSelectedSetlistId(setItem.id);
                  if (isHost) onLoadSetlist(setItem.items, setItem.id);
                }}
                className={`studio-keycap rounded-xl px-3.5 py-2 text-xs font-medium transition whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-slate-900 text-white border border-slate-900 dark:bg-white/15 dark:text-white dark:border-white/20'
                    : 'bg-slate-100 text-slate-600 border border-slate-200 hover:text-slate-900 dark:bg-[#181B23] dark:text-zinc-400 dark:border-transparent dark:hover:text-zinc-200'
                }`}
              >
                {setItem.name} · <span className="font-mono-tabular">{setItem.items.length}</span>
              </button>
            );
          })}

          {isHost && currentSetlist && setlists.length > 1 && (
            <button
              type="button"
              onClick={() => {
                const next = setlists.filter((s) => s.id !== currentSetlist.id);
                void onSaveSetlists(next);
                if (next[0]) {
                  setSelectedSetlistId(next[0].id);
                  onLoadSetlist(next[0].items, next[0].id);
                }
              }}
              className="ml-auto shrink-0 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-600 hover:border-rose-500/40 hover:text-rose-600 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-400 dark:hover:text-rose-300 transition"
              title={`Delete ${currentSetlist.name}`}
            >
              Delete Set
            </button>
          )}
        </div>

        {showNewSetInput && (
          <form onSubmit={(e) => void handleCreateSetlist(e)} className="mt-3 flex items-center gap-2">
            <input
              type="text"
              value={newSetName}
              onChange={(e) => setNewSetName(e.target.value)}
              placeholder="e.g., Friday Night Acoustic Set"
              maxLength={48}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-white dark:placeholder:text-zinc-600"
            />
            <button
              type="submit"
              className="rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400"
            >
              Create
            </button>
          </form>
        )}

        {currentSetlist && currentSetlist.items.length > 3 && (
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter songs by title, BPM, or notes..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-8 py-2 text-xs text-slate-900 placeholder:text-slate-400 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-white dark:placeholder:text-zinc-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 dark:text-zinc-500 dark:hover:text-white"
                aria-label="Clear song filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </section>

      {/* Upcoming Song Queue Highlight & Transition Countdown */}
      {upcomingSong && activeSong && transitionCountdown && (
        <section
          aria-label="Upcoming song queue spotlight"
          className={`hc-surface studio-panel rounded-2xl border p-4 sm:p-5 transition-colors ${
            transitionCountdown.isImminent
              ? 'border-amber-500/60 bg-amber-500/[0.08] dark:border-amber-400/50 dark:bg-amber-500/[0.08]'
              : 'border-emerald-500/40 bg-emerald-500/[0.06] dark:border-emerald-400/35 dark:bg-emerald-500/[0.06]'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono-tabular font-semibold uppercase tracking-wider">
                <span
                  className={
                    transitionCountdown.isImminent
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }
                >
                  Up Next · Track {String(upcomingIndex + 1).padStart(2, '0')}
                </span>
                <span className="text-slate-300 dark:text-zinc-600" aria-hidden="true">·</span>
                <span className="text-slate-500 dark:text-zinc-400">
                  {transitionCountdown.isComplete
                    ? 'Ready to Cue'
                    : transitionCountdown.isImminent
                    ? 'Transition Approaching'
                    : activeSong.autoAdvance
                    ? 'Auto-Advance Armed'
                    : 'Manual Transition'}
                </span>
              </div>

              <h3 className="mt-1 font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate">
                {upcomingSong.songName}
              </h3>

              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 dark:text-zinc-300">
                <span className="font-mono-tabular font-semibold">
                  {upcomingSong.bpm} BPM
                </span>
                {Math.round(upcomingSong.bpm - session.bpm) !== 0 && (
                  <span className="font-mono-tabular text-slate-500 dark:text-zinc-400">
                    ({upcomingSong.bpm > session.bpm ? '+' : ''}
                    {Math.round(upcomingSong.bpm - session.bpm)} BPM)
                  </span>
                )}
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">
                  {upcomingSong.timeSignature.numerator}/{upcomingSong.timeSignature.denominator}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {upcomingSong.countInBars > 0
                    ? `${upcomingSong.countInBars}b count-in`
                    : 'No count-in'}
                </span>
                {upcomingSong.notes && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-500 dark:text-zinc-400 truncate max-w-xs">
                      {upcomingSong.notes}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Live Countdown Timer & Quick Prep Controls */}
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <div className="text-left sm:text-right">
                {transitionCountdown.remainingSec !== null ? (
                  <>
                    <div
                      className={`font-display text-2xl sm:text-3xl font-extrabold tabular-nums leading-none ${
                        transitionCountdown.isImminent
                          ? 'text-amber-700 dark:text-amber-300'
                          : 'text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {formatCountdownSeconds(transitionCountdown.remainingSec)}
                    </div>
                    <div className="mt-1 font-mono-tabular text-[11px] text-slate-500 dark:text-zinc-400">
                      {transitionCountdown.remainingBars !== null
                        ? `${transitionCountdown.remainingBars} ${
                            transitionCountdown.remainingBars === 1 ? 'bar' : 'bars'
                          } left`
                        : 'Prep timer'}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="inline-flex items-center gap-1.5 font-mono-tabular text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                      <Clock className="w-4 h-4" />
                      <span>{timeline.isPlaying ? `Bar ${timeline.currentBar}` : 'Standby'}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-zinc-400">
                      Open-ended cue
                    </div>
                  </>
                )}
              </div>

              {!hasTimedSong && (
                <div className="flex items-center gap-1">
                  {timeline.isPlaying ? (
                    <>
                      <button
                        type="button"
                        onClick={() => startBarCue(4)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono-tabular text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-200 dark:hover:bg-white/10 min-h-[38px]"
                        title="Start 4-bar transition countdown"
                      >
                        4b Cue
                      </button>
                      <button
                        type="button"
                        onClick={() => startBarCue(8)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono-tabular text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-200 dark:hover:bg-white/10 min-h-[38px]"
                        title="Start 8-bar transition countdown"
                      >
                        8b Cue
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startSecondsCue(15)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono-tabular text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-200 dark:hover:bg-white/10 min-h-[38px]"
                        title="Start 15-second transition countdown"
                      >
                        15s
                      </button>
                      <button
                        type="button"
                        onClick={() => startSecondsCue(30)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono-tabular text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-200 dark:hover:bg-white/10 min-h-[38px]"
                        title="Start 30-second transition countdown"
                      >
                        30s
                      </button>
                    </>
                  )}
                  {manualCue && (
                    <button
                      type="button"
                      onClick={() => setManualCue(null)}
                      className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-900 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-400 dark:hover:text-white min-h-[38px]"
                      aria-label="Clear prep timer"
                      title="Clear prep timer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              {canNav && (
                <button
                  type="button"
                  onClick={() => handlePlaySongFromSetlist(upcomingIndex)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition active:scale-95 whitespace-nowrap min-h-[42px]"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  <span>Start Next</span>
                </button>
              )}
            </div>
          </div>

          {transitionCountdown.remainingSec !== null && (
            <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
              <div
                className={`h-full w-full origin-left rounded-full transition-transform duration-200 ${
                  transitionCountdown.isImminent
                    ? 'bg-amber-500'
                    : 'bg-emerald-500 dark:bg-emerald-400'
                }`}
                style={{ transform: `scaleX(${transitionCountdown.progress.toFixed(3)})` }}
              />
            </div>
          )}
        </section>
      )}

      {/* Song List */}
      <section className="hc-surface studio-panel rounded-2xl border border-slate-200/90 dark:border-white/[0.08] divide-y divide-slate-200 dark:divide-white/[0.06]">
        {!currentSetlist || currentSetlist.items.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-slate-500 dark:text-zinc-400">No songs in this setlist yet.</p>
            {isHost && (
              <button
                type="button"
                onClick={handleOpenAddSong}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400"
              >
                <Plus className="w-4 h-4" />
                <span>Add First Song</span>
              </button>
            )}
          </div>
        ) : filteredSongs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-zinc-400">
            No songs match &ldquo;{searchQuery}&rdquo;.
          </div>
        ) : (
          filteredSongs.map(({ song, idx }) => {
            const isActiveSong = isLoadedInSession && session.activeSongIndex === idx;
            const isUpcomingSong = isLoadedInSession && upcomingIndex === idx;
            const clickMeta = CLICK_SOUNDS.find((c) => c.id === song.clickSound);
            const subMeta = SUBDIVISIONS.find((s) => s.id === song.subdivision);

            return (
              <div
                key={song.id}
                draggable={isHost}
                onDragStart={() => setDragIndex(idx)}
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={() => {
                  if (dragIndex !== null && dragIndex !== idx) {
                    void moveItem(dragIndex, idx);
                  }
                  setDragIndex(null);
                }}
                onDragEnd={() => setDragIndex(null)}
                className={`flex items-center gap-3 p-4 transition-colors ${
                  isActiveSong
                    ? 'bg-amber-500/[0.09] dark:bg-amber-500/[0.07]'
                    : isUpcomingSong
                    ? 'bg-emerald-500/[0.08] dark:bg-emerald-500/[0.07]'
                    : 'hover:bg-slate-50 dark:hover:bg-white/[0.02]'
                } ${dragIndex === idx ? 'opacity-40' : ''}`}
              >
                {isHost && (
                  <div
                    className="hidden sm:flex cursor-grab text-slate-400 hover:text-slate-700 dark:text-zinc-600 dark:hover:text-zinc-300 p-1"
                    title="Drag to reorder"
                  >
                    <GripVertical className="w-4 h-4" />
                  </div>
                )}

                <div className="font-mono-tabular text-xs font-semibold text-slate-400 dark:text-zinc-500 w-6 text-right shrink-0">
                  {String(idx + 1).padStart(2, '0')}
                </div>

                <button
                  type="button"
                  disabled={!canNav}
                  onClick={() => handlePlaySongFromSetlist(idx)}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition disabled:opacity-40 ${
                    isUpcomingSong
                      ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:border-emerald-400/40 dark:text-emerald-300'
                      : 'border-slate-200 bg-slate-100 text-slate-700 hover:border-amber-500/50 hover:text-amber-600 dark:border-white/10 dark:bg-[#181B23] dark:text-zinc-200 dark:hover:border-amber-500/50 dark:hover:text-amber-400'
                  }`}
                  aria-label={`Load and play ${song.songName}`}
                >
                  <Play className="w-4 h-4 fill-current" />
                </button>

                <div
                  className="min-w-0 flex-1 cursor-pointer"
                  onClick={() => canNav && onSelectSong(idx)}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span
                      className={`font-display text-sm sm:text-base font-semibold truncate ${
                        isActiveSong
                          ? 'text-amber-600 dark:text-amber-400'
                          : isUpcomingSong
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {song.songName}
                    </span>
                    {isActiveSong && (
                      <span className="text-[11px] font-mono-tabular font-semibold uppercase text-amber-600 dark:text-amber-400">
                        · Active
                      </span>
                    )}
                    {isUpcomingSong && (
                      <span className="text-[11px] font-mono-tabular font-semibold uppercase text-emerald-700 dark:text-emerald-400">
                        · Up Next
                        {transitionCountdown && transitionCountdown.remainingSec !== null
                          ? ` · ${formatCountdownSeconds(transitionCountdown.remainingSec)}`
                          : ''}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-zinc-400">
                    <span className="font-mono-tabular text-slate-800 dark:text-zinc-200 font-medium">
                      {song.bpm} BPM
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      {song.timeSignature.numerator}/{song.timeSignature.denominator}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{clickMeta?.name ?? song.clickSound}</span>
                    <span aria-hidden="true">·</span>
                    <span>{subMeta?.shortLabel ?? song.subdivision}</span>
                    {song.tempoSections && song.tempoSections.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-600 dark:text-amber-400/90">
                          {song.tempoSections.map((t) => `${t.label} ${t.bpm}`).join(' → ')}
                        </span>
                      </>
                    )}
                  </div>
                  {song.notes && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500 truncate">
                      {song.notes}
                    </p>
                  )}
                </div>

                {isHost && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => void moveItem(idx, idx - 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white disabled:opacity-25"
                      aria-label="Move up"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === currentSetlist.items.length - 1}
                      onClick={() => void moveItem(idx, idx + 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white disabled:opacity-25"
                      aria-label="Move down"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewSong(false);
                        setEditingItem({
                          ...song,
                          accentPattern: [...song.accentPattern],
                          tempoSections: song.tempoSections
                            ? song.tempoSections.map((t) => ({ ...t }))
                            : [],
                        });
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
                      aria-label={`Edit ${song.songName}`}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDuplicate(song)}
                      className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
                      aria-label={`Duplicate ${song.songName}`}
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(song.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-500/15 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400"
                      aria-label={`Delete ${song.songName}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* Song Editor Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 dark:bg-black/75 backdrop-blur-sm sm:p-4">
          <form
            onSubmit={(e) => void handleSaveSong(e)}
            className="animate-sheet-up scroll-touch pb-safe w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#12141A] p-5 sm:p-6 shadow-2xl space-y-4"
          >
            <div className="sm:hidden mx-auto mb-1 h-1 w-10 rounded-full bg-slate-300 dark:bg-white/20" aria-hidden="true" />
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                {isNewSong ? 'Add Song to Setlist' : 'Edit Song'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">
                Song Name
              </label>
              <input
                type="text"
                required
                value={editingItem.songName}
                onChange={(e) => setEditingItem({ ...editingItem, songName: e.target.value })}
                placeholder="e.g., Amazing Grace"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-white dark:placeholder:text-zinc-600"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">
                  BPM (20–300)
                </label>
                <input
                  type="number"
                  min={20}
                  max={300}
                  step={0.5}
                  value={editingItem.bpm}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, bpm: Number(e.target.value) })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono-tabular text-sm text-slate-900 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">
                  Time Signature
                </label>
                <select
                  value={`${editingItem.timeSignature.numerator}/${editingItem.timeSignature.denominator}`}
                  onChange={(e) => {
                    const found = TIME_SIGNATURE_PRESETS.find((p) => p.label === e.target.value);
                    if (found) {
                      setEditingItem({
                        ...editingItem,
                        timeSignature: { ...found.ts },
                        accentPattern: buildAccentPattern(found.ts),
                      });
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono-tabular text-sm text-slate-900 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-white"
                >
                  {TIME_SIGNATURE_PRESETS.map((p) => (
                    <option key={p.label} value={p.label}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">
                  Count-In
                </label>
                <select
                  value={editingItem.countInBars}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      countInBars: Number(e.target.value) as CountInBars,
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono-tabular text-sm text-slate-900 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-white"
                >
                  <option value={0}>Off</option>
                  <option value={1}>1 Bar</option>
                  <option value={2}>2 Bars</option>
                  <option value={4}>4 Bars</option>
                  <option value={8}>8 Bars</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">
                  Click Sound
                </label>
                <select
                  value={editingItem.clickSound}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      clickSound: e.target.value as ClickSoundId,
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-white"
                >
                  {CLICK_SOUNDS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">
                  Subdivision
                </label>
                <select
                  value={editingItem.subdivision}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      subdivision: e.target.value as SubdivisionType,
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-white"
                >
                  {SUBDIVISIONS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">
                  Length in Bars (0 = manual)
                </label>
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={editingItem.bars}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, bars: Math.max(0, Number(e.target.value)) })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono-tabular text-sm text-slate-900 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-white"
                />
              </div>

              <div className="flex items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-[#181B23] px-3.5 py-2 min-h-[44px]">
                <span className="text-xs font-medium text-slate-800 dark:text-zinc-200">
                  Auto-advance next song
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={editingItem.autoAdvance}
                  aria-label="Auto-advance next song"
                  onClick={() =>
                    setEditingItem({ ...editingItem, autoAdvance: !editingItem.autoAdvance })
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                    editingItem.autoAdvance
                      ? 'border-amber-500 bg-amber-500'
                      : 'border-slate-300 bg-slate-200 dark:border-white/15 dark:bg-[#0A0B0E]'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      editingItem.autoAdvance ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Automatic Tempo Sections (e.g., Verse -> Chorus -> Bridge) */}
            <div className="pt-2 border-t border-slate-200 dark:border-white/[0.06]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-700 dark:text-zinc-300">
                  Tempo Changes / Song Sections (Optional)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const nextSec: TempoSection = {
                      id: `sec-${Date.now()}`,
                      label:
                        (editingItem.tempoSections?.length ?? 0) === 0
                          ? 'Verse'
                          : (editingItem.tempoSections?.length ?? 0) === 1
                          ? 'Chorus'
                          : 'Bridge',
                      bpm: editingItem.bpm,
                      bars: 8,
                    };
                    setEditingItem({
                      ...editingItem,
                      tempoSections: [...(editingItem.tempoSections ?? []), nextSec],
                    });
                  }}
                  className="text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
                >
                  + Add Section
                </button>
              </div>
              {editingItem.tempoSections && editingItem.tempoSections.length > 0 && (
                <div className="space-y-2">
                  {editingItem.tempoSections.map((sec, sIdx) => (
                    <div key={sec.id} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        value={sec.label}
                        onChange={(e) => {
                          const list = [...(editingItem.tempoSections ?? [])];
                          list[sIdx] = { ...list[sIdx], label: e.target.value };
                          setEditingItem({ ...editingItem, tempoSections: list });
                        }}
                        placeholder="Section"
                        className="col-span-5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-white"
                      />
                      <input
                        type="number"
                        min={20}
                        max={300}
                        value={sec.bpm}
                        onChange={(e) => {
                          const list = [...(editingItem.tempoSections ?? [])];
                          list[sIdx] = { ...list[sIdx], bpm: Number(e.target.value) };
                          setEditingItem({ ...editingItem, tempoSections: list });
                        }}
                        title="BPM"
                        className="col-span-3 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono-tabular text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-white"
                      />
                      <input
                        type="number"
                        min={1}
                        max={256}
                        value={sec.bars}
                        onChange={(e) => {
                          const list = [...(editingItem.tempoSections ?? [])];
                          list[sIdx] = { ...list[sIdx], bars: Number(e.target.value) };
                          setEditingItem({ ...editingItem, tempoSections: list });
                        }}
                        title="Bars"
                        className="col-span-3 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono-tabular text-xs text-slate-900 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const list = (editingItem.tempoSections ?? []).filter(
                            (_, i) => i !== sIdx
                          );
                          setEditingItem({ ...editingItem, tempoSections: list });
                        }}
                        className="col-span-1 flex justify-center text-slate-400 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400"
                        aria-label="Remove section"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">
                Rehearsal Notes
              </label>
              <input
                type="text"
                value={editingItem.notes ?? ''}
                onChange={(e) => setEditingItem({ ...editingItem, notes: e.target.value })}
                placeholder="Cue notes, key, pad swell..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-white dark:placeholder:text-zinc-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5 min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 min-h-[44px] active:scale-[0.98] transition"
              >
                Save Song
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
});
SetlistManager.displayName = 'SetlistManager';
