import {
  BookmarkPlus,
  Check,
  Copy,
  Edit3,
  Moon,
  Play,
  Share2,
  Sun,
  Trash2,
  Volume2,
} from 'lucide-react';
import React, { useState } from 'react';
import { CLICK_SOUNDS } from '../constants/metronomeData';
import {
  AccessibilitySettings,
  ClickCategory,
  ClickProfile,
  ClickSoundId,
  MetronomePreset,
  MetronomeSessionState,
} from '../types/metronome';
import { TimelineSnapshot } from '../utils/timeline';
import { VocalCountdown } from './VocalCountdown';

interface SoundAndSettingsProps {
  session: MetronomeSessionState;
  timeline?: TimelineSnapshot;
  isHost: boolean;
  presets: MetronomePreset[];
  accessibility: AccessibilitySettings;
  deviceOffsetMs: number;
  onUpdateDeviceOffsetMs: (ms: number) => void;
  onUpdateClickProfile: (patch: Partial<ClickProfile>) => void;
  onPreviewClick: (soundId: ClickSoundId, isAccent?: boolean) => void;
  onPreviewVocalCount: () => void;
  onSavePresets: (next: MetronomePreset[]) => Promise<void>;
  onApplyPreset: (preset: MetronomePreset) => void;
  onUpdateAccessibility: (patch: Partial<AccessibilitySettings>) => void;
}

const CATEGORIES: ClickCategory[] = ['Classic', 'Acoustic', 'Electronic', 'Worship / Band'];

export const SoundAndSettings: React.FC<SoundAndSettingsProps> = React.memo(({
  session,
  timeline,
  isHost,
  presets,
  accessibility,
  deviceOffsetMs,
  onUpdateDeviceOffsetMs,
  onUpdateClickProfile,
  onPreviewClick,
  onPreviewVocalCount,
  onSavePresets,
  onApplyPreset,
  onUpdateAccessibility,
}) => {
  const [assignTarget, setAssignTarget] = useState<'accentSound' | 'normalSound' | 'subdivisionSound'>('normalSound');
  const [newPresetName, setNewPresetName] = useState('');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingPresetName, setEditingPresetName] = useState('');
  const [copiedPresetId, setCopiedPresetId] = useState<string | null>(null);

  const profile = session.clickProfile;
  const activeTheme = accessibility.theme === 'light' ? 'light' : 'dark';

  const handleSaveCurrentAsPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newPresetName.trim() || `${session.bpm} BPM Preset`;
    const created: MetronomePreset = {
      id: `preset-${Date.now()}`,
      name,
      bpm: session.bpm,
      timeSignature: { ...session.timeSignature },
      clickSound: profile.normalSound,
      subdivision: session.subdivision,
      accentPattern: [...session.accentPattern],
      countInBars: session.countInBars,
      updatedAt: Date.now(),
    };
    await onSavePresets([created, ...presets]);
    setNewPresetName('');
  };

  const handleRenamePreset = async (id: string) => {
    const clean = editingPresetName.trim();
    if (!clean) {
      setEditingPresetId(null);
      return;
    }
    const next = presets.map((p) =>
      p.id === id ? { ...p, name: clean, updatedAt: Date.now() } : p
    );
    await onSavePresets(next);
    setEditingPresetId(null);
  };

  const handleDuplicatePreset = async (preset: MetronomePreset) => {
    const copy: MetronomePreset = {
      ...preset,
      id: `preset-${Date.now()}`,
      name: `${preset.name} (Copy)`,
      updatedAt: Date.now(),
    };
    await onSavePresets([copy, ...presets]);
  };

  const handleDeletePreset = async (id: string) => {
    await onSavePresets(presets.filter((p) => p.id !== id));
  };

  const handleSharePreset = (preset: MetronomePreset) => {
    const summary = `${preset.name} — ${preset.bpm} BPM · ${preset.timeSignature.numerator}/${preset.timeSignature.denominator} · ${
      CLICK_SOUNDS.find((c) => c.id === preset.clickSound)?.name ?? preset.clickSound
    }`;
    void navigator.clipboard?.writeText(summary);
    setCopiedPresetId(preset.id);
    window.setTimeout(() => setCopiedPresetId(null), 1800);
  };

  return (
    <div className="space-y-4">
      {/* Studio Appearance & Theme Toggle */}
      <section className="hc-surface studio-panel rounded-2xl border border-slate-200/90 dark:border-white/[0.08] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400">
              {activeTheme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                Studio Theme
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
                Switch between low-glare Dark mode for stages and crisp Light mode for daylight rehearsal.
              </p>
            </div>
          </div>

          <div
            role="group"
            aria-label="Theme mode"
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-white/10 dark:bg-[#0A0B0E]"
          >
            <button
              type="button"
              onClick={() => onUpdateAccessibility({ theme: 'dark' })}
              aria-pressed={activeTheme === 'dark'}
              className={`studio-keycap inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition whitespace-nowrap shrink-0 min-h-[36px] ${
                activeTheme === 'dark'
                  ? 'bg-amber-500 text-zinc-950 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Dark</span>
            </button>
            <button
              type="button"
              onClick={() => onUpdateAccessibility({ theme: 'light' })}
              aria-pressed={activeTheme === 'light'}
              className={`studio-keycap inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition whitespace-nowrap shrink-0 min-h-[36px] ${
                activeTheme === 'light'
                  ? 'bg-amber-500 text-zinc-950 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Light</span>
            </button>
          </div>
        </div>
      </section>

      {/* Mixer & Channel Volume */}
      <section className="hc-surface studio-panel rounded-2xl border border-slate-200/90 dark:border-white/[0.08] p-5 sm:p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Click Sound Mixer
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
              Assign independent studio percussion transients for Beat 1, normal beats, and subdivisions.
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Volume2 className="w-5 h-5" />
          </div>
        </div>

        {/* Target Slot Selector */}
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          {(
            [
              { key: 'accentSound', label: 'Beat 1 Accent' },
              { key: 'normalSound', label: 'Normal Beat' },
              { key: 'subdivisionSound', label: 'Subdivision' },
            ] as const
          ).map((slot) => {
            const selected = assignTarget === slot.key;
            const assignedName =
              CLICK_SOUNDS.find((c) => c.id === profile[slot.key])?.name ?? profile[slot.key];
            return (
              <button
                key={slot.key}
                type="button"
                onClick={() => setAssignTarget(slot.key)}
                className={`studio-keycap rounded-xl border p-3 text-left transition ${
                  selected
                    ? 'border-amber-500/60 bg-amber-500/12 shadow-[0_0_20px_rgba(245,158,11,0.08)]'
                    : 'border-slate-200 bg-slate-100/80 hover:border-slate-300 dark:border-white/10 dark:bg-[#181B23] dark:hover:border-white/20'
                }`}
              >
                <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                  {slot.label}
                </div>
                <div className="mt-1 text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {assignedName}
                </div>
              </button>
            );
          })}
        </div>

        {/* Volume Faders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {(
            [
              { key: 'masterVolume', label: 'Master Click Volume' },
              { key: 'accentVolume', label: 'Accent Beat Volume' },
              { key: 'normalVolume', label: 'Normal Beat Volume' },
              { key: 'subdivisionVolume', label: 'Subdivision Volume' },
            ] as const
          ).map((fader) => {
            const pct = Math.round(profile[fader.key] * 100);
            return (
              <div
                key={fader.key}
                className="rounded-xl border border-slate-200/80 bg-slate-100/75 dark:border-white/[0.06] dark:bg-[#181B23] p-4"
              >
                <div className="flex items-center justify-between text-xs mb-2.5">
                  <span className="font-medium text-slate-700 dark:text-zinc-300">{fader.label}</span>
                  <span className="font-mono-tabular text-amber-600 dark:text-amber-400 font-semibold">
                    {pct}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={pct}
                  disabled={!isHost && fader.key !== 'masterVolume'}
                  onChange={(e) =>
                    onUpdateClickProfile({ [fader.key]: Number(e.target.value) / 100 })
                  }
                  style={{ '--slider-pct': `${pct}%` } as React.CSSProperties}
                  className="studio-slider w-full cursor-pointer"
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* Vocal Countdown & Counting Studio */}
      <VocalCountdown
        profile={profile}
        bpm={session.bpm}
        beatsPerBar={session.timeSignature.numerator}
        subdivision={session.subdivision}
        isHost={isHost}
        timeline={timeline}
        onUpdateClickProfile={onUpdateClickProfile}
        onPreviewVocalCount={onPreviewVocalCount}
      />

      {/* Sound Library */}
      <section className="hc-surface studio-panel rounded-2xl border border-slate-200/90 dark:border-white/[0.08] p-5 sm:p-6 space-y-5">
        {CATEGORIES.map((category) => {
          const items = CLICK_SOUNDS.filter((c) => c.category === category);
          return (
            <div key={category}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-2.5">
                {category}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {items.map((sound) => {
                  const isAssigned = profile[assignTarget] === sound.id;
                  return (
                    <div
                      key={sound.id}
                      className={`studio-keycap flex items-center justify-between gap-2 rounded-xl border p-3 transition ${
                        isAssigned
                          ? 'border-amber-500/60 bg-amber-500/12'
                          : 'border-slate-200/90 bg-slate-50 hover:border-slate-300 dark:border-white/[0.08] dark:bg-[#181B23] dark:hover:border-white/20'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={!isHost}
                        onClick={() => {
                          onUpdateClickProfile({ [assignTarget]: sound.id });
                          onPreviewClick(sound.id, assignTarget === 'accentSound');
                        }}
                        className="min-w-0 flex-1 text-left disabled:cursor-default"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {sound.name}
                          </span>
                          {isAssigned && (
                            <Check className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                          {sound.description}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => onPreviewClick(sound.id, assignTarget === 'accentSound')}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-amber-600 hover:border-amber-500/50 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-zinc-300 dark:hover:text-amber-400 dark:hover:border-amber-500/40 transition"
                        title={`Preview ${sound.name}`}
                        aria-label={`Preview ${sound.name}`}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      {/* Saved Presets */}
      <section className="hc-surface studio-panel rounded-2xl border border-slate-200/90 dark:border-white/[0.08] p-5 space-y-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Saved Presets
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
            Save tempo, meter, subdivision, and click setups for instant recall.
          </p>
        </div>

        <form onSubmit={(e) => void handleSaveCurrentAsPreset(e)} className="flex gap-2">
          <input
            type="text"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            placeholder={`Save current (${session.bpm} BPM ${session.timeSignature.numerator}/${session.timeSignature.denominator})...`}
            maxLength={40}
            className="flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-white dark:placeholder:text-zinc-600"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 whitespace-nowrap"
          >
            <BookmarkPlus className="w-4 h-4" />
            <span>Save Preset</span>
          </button>
        </form>

        <div className="divide-y divide-slate-200 dark:divide-white/[0.06] rounded-xl border border-slate-200/80 bg-slate-50 dark:border-white/[0.06] dark:bg-[#181B23]">
          {presets.map((preset) => (
            <div key={preset.id} className="flex items-center justify-between gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                {editingPresetId === preset.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editingPresetName}
                      onChange={(e) => setEditingPresetName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleRenamePreset(preset.id);
                      }}
                      autoFocus
                      className="rounded-lg border border-amber-500/40 bg-white px-2.5 py-1 text-sm text-slate-900 dark:bg-[#0A0B0E] dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => void handleRenamePreset(preset.id)}
                      className="text-xs font-semibold text-amber-600 dark:text-amber-400"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={!isHost}
                    onClick={() => onApplyPreset(preset)}
                    className="text-left w-full group"
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition truncate">
                      {preset.name}
                    </div>
                    <div className="mt-0.5 font-mono-tabular text-xs text-slate-500 dark:text-zinc-400">
                      {preset.bpm} BPM · {preset.timeSignature.numerator}/
                      {preset.timeSignature.denominator} ·{' '}
                      {CLICK_SOUNDS.find((c) => c.id === preset.clickSound)?.name ??
                        preset.clickSound}
                    </div>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleSharePreset(preset)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
                  title="Copy preset summary"
                >
                  {copiedPresetId === preset.id ? (
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Share2 className="w-4 h-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingPresetId(preset.id);
                    setEditingPresetName(preset.name);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
                  title="Rename preset"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDuplicatePreset(preset)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
                  title="Duplicate preset"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeletePreset(preset.id)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-500/15 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400"
                  title="Delete preset"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Haptic, Visual & Accessibility Settings + Device Latency Calibration */}
      <section className="hc-surface studio-panel rounded-2xl border border-slate-200/90 dark:border-white/[0.08] p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Device Calibration, Haptics &amp; Accessibility
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
            Compensate for Bluetooth/IEM hardware latency, configure silent vibration cues, and tune stage readability.
          </p>
        </div>

        {/* Per-Device Audio Sync Offset */}
        <div className="rounded-xl border border-slate-200/90 bg-slate-100/75 dark:border-white/[0.08] dark:bg-[#181B23] p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <div>
              <span className="font-semibold text-slate-900 dark:text-white">
                Device Audio Sync Offset
              </span>
              <span className="ml-2 text-slate-500 dark:text-zinc-400 hidden sm:inline">
                Align this phone/headphones with PA or drummer
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono-tabular font-semibold text-amber-600 dark:text-amber-400">
                {deviceOffsetMs > 0 ? `+${deviceOffsetMs}` : deviceOffsetMs} ms
              </span>
              {deviceOffsetMs !== 0 && (
                <button
                  type="button"
                  onClick={() => onUpdateDeviceOffsetMs(0)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:text-slate-900 dark:border-white/10 dark:bg-[#0A0B0E] dark:text-zinc-300 dark:hover:text-white"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
          <input
            type="range"
            min={-100}
            max={100}
            step={1}
            value={deviceOffsetMs}
            onChange={(e) => onUpdateDeviceOffsetMs(Number(e.target.value))}
            aria-label="Device Audio Sync Offset in milliseconds"
            style={
              {
                '--slider-pct': `${(((deviceOffsetMs + 100) / 200) * 100).toFixed(1)}%`,
              } as React.CSSProperties
            }
            className="studio-slider w-full cursor-pointer"
          />
          <div className="flex justify-between font-mono-tabular text-[10px] text-slate-500 dark:text-zinc-500">
            <span>-100 ms (Earlier)</span>
            <span>0 ms</span>
            <span>+100 ms (Later)</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(
            [
              {
                key: 'hapticBeat',
                label: 'Haptic Beat Vibration',
                desc: 'Vibrate mobile device on each beat',
              },
              {
                key: 'hapticAccentOnly',
                label: 'Vibrate on Accent Only',
                desc: 'Only pulse haptics on Beat 1 / accents',
              },
              {
                key: 'visualFlash',
                label: 'Visual Beat Pulse',
                desc: 'Subtle glow on downbeat transitions',
              },
              {
                key: 'largeText',
                label: 'Large Text Mode',
                desc: 'Scale BPM and primary stage typography',
              },
              {
                key: 'highContrast',
                label: 'High Contrast Surfaces',
                desc: 'Maximum surface contrast and reinforced borders',
              },
              {
                key: 'reducedMotion',
                label: 'Reduced Motion',
                desc: 'Minimize transitions while preserving timing',
              },
            ] as const
          ).map((item) => {
            const enabled = Boolean(accessibility[item.key]);
            return (
              <div
                key={item.key}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-slate-50 dark:border-white/[0.08] dark:bg-[#181B23] p-3.5"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-white">{item.label}</div>
                  <div className="text-xs text-slate-500 dark:text-zinc-400">{item.desc}</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={item.label}
                  onClick={() => onUpdateAccessibility({ [item.key]: !enabled })}
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${
                    enabled
                      ? 'border-amber-500 bg-amber-500'
                      : 'border-slate-300 bg-slate-200 dark:border-white/15 dark:bg-[#0A0B0E]'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-slate-100/75 dark:border-white/[0.06] dark:bg-[#181B23] p-3.5 text-xs text-slate-600 dark:text-zinc-400 flex flex-wrap gap-x-5 gap-y-2">
          <span>
            <strong className="font-mono-tabular text-slate-900 dark:text-zinc-200">Space</strong> Play / Pause
          </span>
          <span>
            <strong className="font-mono-tabular text-slate-900 dark:text-zinc-200">S</strong> Stop
          </span>
          <span>
            <strong className="font-mono-tabular text-slate-900 dark:text-zinc-200">T</strong> Tap Tempo
          </span>
          <span>
            <strong className="font-mono-tabular text-slate-900 dark:text-zinc-200">↑ / ↓</strong> BPM ±1
          </span>
          <span>
            <strong className="font-mono-tabular text-slate-900 dark:text-zinc-200">← / →</strong> Prev / Next Song
          </span>
          <span>
            <strong className="font-mono-tabular text-slate-900 dark:text-zinc-200">F</strong> Stage View
          </span>
        </div>
      </section>
    </div>
  );
});
SoundAndSettings.displayName = 'SoundAndSettings';
