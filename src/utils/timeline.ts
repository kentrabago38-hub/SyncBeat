import { SUBDIVISIONS } from '../constants/metronomeData';
import { MetronomeSessionState } from '../types/metronome';

export interface TimelineSnapshot {
  isPlaying: boolean;
  isCountingIn: boolean;
  countInBeatsTotal: number;
  countInBeatsRemaining: number;
  countInDisplayText: string | null; // "4", "3", "2", "1", "GO"
  currentBar: number; // 0 during count-in, 1+ during song
  currentBeat: number; // 0-indexed beat in bar
  currentSubdivision: number; // 0-indexed sub inside beat
  subdivisionsPerBeat: number;
  beatPhase: number; // 0..1 progress within current beat
  totalBeatsElapsed: number; // relative to anchor
  songBeatsElapsed: number; // negative during count-in, >=0 during song
}

export function getSubdivisionsPerBeat(subdivisionId: MetronomeSessionState['subdivision']): number {
  return SUBDIVISIONS.find((s) => s.id === subdivisionId)?.perBeat ?? 1;
}

export function evaluateTimeline(
  session: Pick<
    MetronomeSessionState,
    'bpm' | 'timeSignature' | 'subdivision' | 'countInBars' | 'playback'
  >,
  serverOffsetMs: number,
  nowPerfMs: number = performance.now()
): TimelineSnapshot {
  const beatsPerBar = Math.max(1, session.timeSignature.numerator);
  const subPerBeat = getSubdivisionsPerBeat(session.subdivision);
  const countInBeatsTotal = session.countInBars * beatsPerBar;

  if (!session.playback.isPlaying) {
    return {
      isPlaying: false,
      isCountingIn: false,
      countInBeatsTotal,
      countInBeatsRemaining: countInBeatsTotal,
      countInDisplayText: null,
      currentBar: 1,
      currentBeat: 0,
      currentSubdivision: 0,
      subdivisionsPerBeat: subPerBeat,
      beatPhase: 0,
      totalBeatsElapsed: session.playback.anchorTotalBeats,
      songBeatsElapsed: Math.max(0, session.playback.anchorTotalBeats - countInBeatsTotal),
    };
  }

  const estimatedServerNow = nowPerfMs + serverOffsetMs;
  const dtMs = Math.max(0, estimatedServerNow - session.playback.anchorServerMs);
  const totalBeats = session.playback.anchorTotalBeats + (dtMs / 60000) * session.bpm;

  const isCountingIn = totalBeats < countInBeatsTotal;
  const songBeatsElapsed = totalBeats - countInBeatsTotal;

  if (isCountingIn) {
    const remainingBeats = Math.max(1, Math.ceil(countInBeatsTotal - totalBeats));
    const floorBeat = Math.max(0, Math.floor(totalBeats));
    const currentBeat = floorBeat % beatsPerBar;
    const beatPhase = totalBeats - floorBeat;
    const currentSubdivision = Math.min(subPerBeat - 1, Math.floor(beatPhase * subPerBeat));

    return {
      isPlaying: true,
      isCountingIn: true,
      countInBeatsTotal,
      countInBeatsRemaining: remainingBeats,
      countInDisplayText: String(remainingBeats),
      currentBar: 0,
      currentBeat,
      currentSubdivision,
      subdivisionsPerBeat: subPerBeat,
      beatPhase,
      totalBeatsElapsed: totalBeats,
      songBeatsElapsed,
    };
  }

  const floorSongBeat = Math.max(0, Math.floor(songBeatsElapsed));
  const currentBar = Math.floor(floorSongBeat / beatsPerBar) + 1;
  const currentBeat = floorSongBeat % beatsPerBar;
  const beatPhase = songBeatsElapsed - floorSongBeat;
  const currentSubdivision = Math.min(subPerBeat - 1, Math.floor(beatPhase * subPerBeat));

  // Show brief "GO" on beat 1 of bar 1 if count-in was active
  const showGo = countInBeatsTotal > 0 && songBeatsElapsed >= 0 && songBeatsElapsed < 0.8;

  return {
    isPlaying: true,
    isCountingIn: false,
    countInBeatsTotal,
    countInBeatsRemaining: 0,
    countInDisplayText: showGo ? 'GO' : null,
    currentBar,
    currentBeat,
    currentSubdivision,
    subdivisionsPerBeat: subPerBeat,
    beatPhase,
    totalBeatsElapsed: totalBeats,
    songBeatsElapsed,
  };
}
