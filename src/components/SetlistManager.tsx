import {
  ArrowDown,
  ArrowUp,
  Copy,
  Edit3,
  GripVertical,
  ListMusic,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
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

interface SetlistManagerProps {
  session: MetronomeSessionState;
  setlists: Setlist[];
  isHost: boolean;
  permissions: RemotePermissions;
  onSaveSetlists: (next: Setlist[]) => Promise<void>;
  onLoadSetlist: (items: SetlistItem[], setlistId: string) => void;
  onSelectSong: (index: number) => void;
  onPlay: () => void;
}

export const SetlistManager: React.FC<SetlistManagerProps> = React.memo(({
  session,
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
      <section className="hc-surface studio-panel rounded-2xl border border-white/[0.08] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-white">Setlist Manager</h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Drag songs or use arrows to reorder, configure count-ins, or add tempo sections.
            </p>
          </div>

          {isHost && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowNewSetInput((v) => !v)}
                className="studio-keycap inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#181B23] px-3.5 py-2 text-xs font-medium text-zinc-200 hover:bg-white/10 transition min-h-[40px]"
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
                    ? 'bg-white/15 text-white border border-white/20'
                    : 'bg-[#181B23] text-zinc-400 border border-transparent hover:text-zinc-200'
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
              className="ml-auto shrink-0 rounded-xl border border-white/10 bg-[#181B23] px-3 py-2 text-xs text-zinc-400 hover:border-rose-500/40 hover:text-rose-300 transition"
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
              className="flex-1 rounded-xl border border-white/10 bg-[#0A0B0E] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600"
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
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter songs by title, BPM, or notes..."
              className="w-full rounded-xl border border-white/10 bg-[#0A0B0E] pl-9 pr-8 py-2 text-xs text-white placeholder:text-zinc-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                aria-label="Clear song filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </section>

      {/* Song List */}
      <section className="hc-surface studio-panel rounded-2xl border border-white/[0.08] divide-y divide-white/[0.06]">
        {!currentSetlist || currentSetlist.items.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-zinc-400">No songs in this setlist yet.</p>
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
          <div className="p-8 text-center text-xs text-zinc-400">
            No songs match &ldquo;{searchQuery}&rdquo;.
          </div>
        ) : (
          filteredSongs.map(({ song, idx }) => {
            const isActiveSong = isLoadedInSession && session.activeSongIndex === idx;
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
                  isActiveSong ? 'bg-amber-500/[0.07]' : 'hover:bg-white/[0.02]'
                } ${dragIndex === idx ? 'opacity-40' : ''}`}
              >
                {isHost && (
                  <div
                    className="hidden sm:flex cursor-grab text-zinc-600 hover:text-zinc-300 p-1"
                    title="Drag to reorder"
                  >
                    <GripVertical className="w-4 h-4" />
                  </div>
                )}

                <div className="font-mono-tabular text-xs font-semibold text-zinc-500 w-6 text-right shrink-0">
                  {String(idx + 1).padStart(2, '0')}
                </div>

                <button
                  type="button"
                  disabled={!canNav}
                  onClick={() => handlePlaySongFromSetlist(idx)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#181B23] text-zinc-200 hover:border-amber-500/50 hover:text-amber-400 disabled:opacity-40 transition"
                  aria-label={`Load and play ${song.songName}`}
                >
                  <Play className="w-4 h-4 fill-current" />
                </button>

                <div
                  className="min-w-0 flex-1 cursor-pointer"
                  onClick={() => canNav && onSelectSong(idx)}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-display text-sm sm:text-base font-semibold truncate ${
                        isActiveSong ? 'text-amber-400' : 'text-white'
                      }`}
                    >
                      {song.songName}
                    </span>
                    {isActiveSong && (
                      <span className="text-[11px] font-mono-tabular font-semibold uppercase text-amber-400">
                        · Active
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-400">
                    <span className="font-mono-tabular text-zinc-200 font-medium">
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
                        <span className="text-amber-400/90">
                          {song.tempoSections.map((t) => `${t.label} ${t.bpm}`).join(' → ')}
                        </span>
                      </>
                    )}
                  </div>
                  {song.notes && (
                    <p className="mt-1 text-xs text-zinc-500 truncate">{song.notes}</p>
                  )}
                </div>

                {isHost && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => void moveItem(idx, idx - 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-25"
                      aria-label="Move up"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === currentSetlist.items.length - 1}
                      onClick={() => void moveItem(idx, idx + 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-25"
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
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white"
                      aria-label={`Edit ${song.songName}`}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDuplicate(song)}
                      className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white"
                      aria-label={`Duplicate ${song.songName}`}
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(song.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-rose-500/15 hover:text-rose-400"
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm sm:p-4">
          <form
            onSubmit={(e) => void handleSaveSong(e)}
            className="scroll-touch pb-safe w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/10 bg-[#12141A] p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">
                {isNewSong ? 'Add Song to Setlist' : 'Edit Song'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Song Name</label>
              <input
                type="text"
                required
                value={editingItem.songName}
                onChange={(e) => setEditingItem({ ...editingItem, songName: e.target.value })}
                placeholder="e.g., Amazing Grace"
                className="w-full rounded-xl border border-white/10 bg-[#0A0B0E] px-3.5 py-2.5 text-sm text-white"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">BPM (20–300)</label>
                <input
                  type="number"
                  min={20}
                  max={300}
                  step={0.5}
                  value={editingItem.bpm}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, bpm: Number(e.target.value) })
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#0A0B0E] px-3 py-2.5 font-mono-tabular text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Time Signature</label>
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
                  className="w-full rounded-xl border border-white/10 bg-[#0A0B0E] px-3 py-2.5 font-mono-tabular text-sm text-white"
                >
                  {TIME_SIGNATURE_PRESETS.map((p) => (
                    <option key={p.label} value={p.label}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Count-In</label>
                <select
                  value={editingItem.countInBars}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      countInBars: Number(e.target.value) as CountInBars,
                    })
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#0A0B0E] px-3 py-2.5 font-mono-tabular text-sm text-white"
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
                <label className="block text-xs font-medium text-zinc-400 mb-1">Click Sound</label>
                <select
                  value={editingItem.clickSound}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      clickSound: e.target.value as ClickSoundId,
                    })
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#0A0B0E] px-3 py-2.5 text-sm text-white"
                >
                  {CLICK_SOUNDS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Subdivision</label>
                <select
                  value={editingItem.subdivision}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      subdivision: e.target.value as SubdivisionType,
                    })
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#0A0B0E] px-3 py-2.5 text-sm text-white"
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
                <label className="block text-xs font-medium text-zinc-400 mb-1">
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
                  className="w-full rounded-xl border border-white/10 bg-[#0A0B0E] px-3 py-2.5 font-mono-tabular text-sm text-white"
                />
              </div>

              <label className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#181B23] px-3.5 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingItem.autoAdvance}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, autoAdvance: e.target.checked })
                  }
                  className="accent-amber-500 w-4 h-4"
                />
                <span className="text-xs font-medium text-zinc-200">Auto-advance next song</span>
              </label>
            </div>

            {/* Automatic Tempo Sections (e.g., Verse -> Chorus -> Bridge) */}
            <div className="pt-2 border-t border-white/[0.06]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-zinc-300">
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
                  className="text-xs font-medium text-amber-400 hover:text-amber-300"
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
                        className="col-span-5 rounded-lg border border-white/10 bg-[#0A0B0E] px-2.5 py-1.5 text-xs text-white"
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
                        className="col-span-3 rounded-lg border border-white/10 bg-[#0A0B0E] px-2.5 py-1.5 font-mono-tabular text-xs text-white"
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
                        className="col-span-3 rounded-lg border border-white/10 bg-[#0A0B0E] px-2.5 py-1.5 font-mono-tabular text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const list = (editingItem.tempoSections ?? []).filter(
                            (_, i) => i !== sIdx
                          );
                          setEditingItem({ ...editingItem, tempoSections: list });
                        }}
                        className="col-span-1 flex justify-center text-zinc-500 hover:text-rose-400"
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
              <label className="block text-xs font-medium text-zinc-400 mb-1">Rehearsal Notes</label>
              <input
                type="text"
                value={editingItem.notes ?? ''}
                onChange={(e) => setEditingItem({ ...editingItem, notes: e.target.value })}
                placeholder="Cue notes, key, pad swell..."
                className="w-full rounded-xl border border-white/10 bg-[#0A0B0E] px-3.5 py-2.5 text-sm text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-medium text-zinc-300 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400"
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
