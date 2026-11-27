import * as d3 from 'd3';
import React, { useEffect, useMemo, useRef } from 'react';
import { BeatAccentType, SubdivisionType, TimeSignature } from '../types/metronome';
import { TimelineSnapshot } from '../utils/timeline';

interface D3BeatPulseVisualizerProps {
  bpm: number;
  timeSignature: TimeSignature;
  accentPattern: BeatAccentType[];
  subdivision: SubdivisionType;
  timeline: TimelineSnapshot;
  canEditAccents: boolean;
  onToggleBeatAccent?: (beatIndex: number) => void;
  visualFlash?: boolean;
  reducedMotion?: boolean;
}

interface BeatNodeDatum {
  index: number;
  angle: number;
  x: number;
  y: number;
  accent: BeatAccentType;
}

const SIZE = 260;
const CX = SIZE / 2;
const CY = SIZE / 2;
const BAR_ARC_INNER = 112;
const BAR_ARC_OUTER = 117;
const NODE_ORBIT_R = 94;
const PHASE_ARC_INNER = 64;
const PHASE_ARC_OUTER = 68;
const CORE_BASE_R = 42;
const PULSE_START_R = 44;
const PULSE_END_R = 106;

export const D3BeatPulseVisualizer: React.FC<D3BeatPulseVisualizerProps> = ({
  bpm,
  timeSignature,
  accentPattern,
  timeline,
  canEditAccents,
  onToggleBeatAccent,
  visualFlash = true,
  reducedMotion = false,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const onToggleRef = useRef(onToggleBeatAccent);
  onToggleRef.current = onToggleBeatAccent;

  const numBeats = Math.max(1, timeSignature.numerator);

  const beatNodes = useMemo<BeatNodeDatum[]>(() => {
    const angleScale = d3
      .scaleLinear()
      .domain([0, numBeats])
      .range([-Math.PI / 2, (3 * Math.PI) / 2]);

    return Array.from({ length: numBeats }, (_, i) => {
      const angle = angleScale(i);
      return {
        index: i,
        angle,
        x: CX + Math.cos(angle) * NODE_ORBIT_R,
        y: CY + Math.sin(angle) * NODE_ORBIT_R,
        accent: accentPattern[i] ?? (i === 0 ? 'accent' : 'normal'),
      };
    });
  }, [accentPattern, numBeats]);

  // Build structural SVG layers via D3 whenever meter, accents, or interactivity changes
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    const radialGrad = defs
      .append('radialGradient')
      .attr('id', 'd3-pulse-core-glow')
      .attr('cx', '50%')
      .attr('cy', '50%')
      .attr('r', '50%');
    radialGrad.append('stop').attr('offset', '0%').attr('stop-color', '#F59E0B').attr('stop-opacity', 0.28);
    radialGrad.append('stop').attr('offset', '100%').attr('stop-color', '#F59E0B').attr('stop-opacity', 0);

    const root = svg.append('g').attr('class', 'd3-stage-root');

    // Subtle ambient glow backdrop
    root
      .append('circle')
      .attr('class', 'd3-ambient-glow')
      .attr('cx', CX)
      .attr('cy', CY)
      .attr('r', 102)
      .attr('fill', 'url(#d3-pulse-core-glow)')
      .attr('opacity', 0);

    // Outer bar-progress background track
    const fullTrackArc = d3
      .arc<unknown>()
      .innerRadius(BAR_ARC_INNER)
      .outerRadius(BAR_ARC_OUTER)
      .startAngle(0)
      .endAngle(Math.PI * 2);

    root
      .append('path')
      .attr('transform', `translate(${CX},${CY})`)
      .attr('d', fullTrackArc({}) ?? '')
      .attr('fill', 'rgba(255,255,255,0.06)');

    // Active bar-progress sweep arc
    root
      .append('path')
      .attr('class', 'd3-bar-progress-arc')
      .attr('transform', `translate(${CX},${CY})`)
      .attr('fill', '#F59E0B')
      .attr('opacity', 0.85);

    // Orbit guide ring
    root
      .append('circle')
      .attr('cx', CX)
      .attr('cy', CY)
      .attr('r', NODE_ORBIT_R)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(255,255,255,0.07)')
      .attr('stroke-width', 1);

    // Inner beat-phase background track
    const phaseTrackArc = d3
      .arc<unknown>()
      .innerRadius(PHASE_ARC_INNER)
      .outerRadius(PHASE_ARC_OUTER)
      .startAngle(0)
      .endAngle(Math.PI * 2);

    root
      .append('path')
      .attr('transform', `translate(${CX},${CY})`)
      .attr('d', phaseTrackArc({}) ?? '')
      .attr('fill', 'rgba(255,255,255,0.06)');

    // Inner tempo-synchronized beat-phase arc
    root
      .append('path')
      .attr('class', 'd3-beat-phase-arc')
      .attr('transform', `translate(${CX},${CY})`)
      .attr('fill', '#F59E0B');

    // Expanding circular pulse rings
    root
      .append('circle')
      .attr('class', 'd3-pulse-echo')
      .attr('cx', CX)
      .attr('cy', CY)
      .attr('r', PULSE_START_R)
      .attr('fill', 'none')
      .attr('stroke', '#F59E0B')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0);

    root
      .append('circle')
      .attr('class', 'd3-pulse-ring')
      .attr('cx', CX)
      .attr('cy', CY)
      .attr('r', PULSE_START_R)
      .attr('fill', 'none')
      .attr('stroke', '#F59E0B')
      .attr('stroke-width', 3)
      .attr('opacity', 0);

    // Subdivision micro-pulse ring
    root
      .append('circle')
      .attr('class', 'd3-sub-ring')
      .attr('cx', CX)
      .attr('cy', CY)
      .attr('r', CORE_BASE_R + 10)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(255,255,255,0.3)')
      .attr('stroke-width', 1.25)
      .attr('opacity', 0);

    // Radial beat nodes around the orbit
    const nodesGroup = root.append('g').attr('class', 'd3-beat-nodes');
    const nodeGroups = nodesGroup
      .selectAll<SVGGElement, BeatNodeDatum>('g.d3-beat-node')
      .data(beatNodes, (d) => String(d.index))
      .join('g')
      .attr('class', 'd3-beat-node')
      .attr('transform', (d) => `translate(${d.x},${d.y})`)
      .style('cursor', canEditAccents ? 'pointer' : 'default')
      .on('click', (_event, d) => {
        if (canEditAccents && onToggleRef.current) {
          onToggleRef.current(d.index);
        }
      });

    nodeGroups
      .append('circle')
      .attr('class', 'd3-node-circle')
      .attr('r', numBeats > 8 ? 9 : 11)
      .attr('stroke-width', 1.5);

    nodeGroups
      .append('text')
      .attr('class', 'd3-node-label')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', numBeats > 8 ? '9px' : '10px')
      .attr('font-weight', '700')
      .text((d) => String(d.index + 1));

    // Central Beat Core Circle
    const coreGroup = root.append('g').attr('class', 'd3-core-group');

    coreGroup
      .append('circle')
      .attr('class', 'd3-beat-core')
      .attr('cx', CX)
      .attr('cy', CY)
      .attr('r', CORE_BASE_R)
      .attr('fill', '#181B23')
      .attr('stroke', 'rgba(255,255,255,0.16)')
      .attr('stroke-width', 2);

    coreGroup
      .append('text')
      .attr('class', 'd3-core-beat-text')
      .attr('x', CX)
      .attr('y', CY - 3)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-family', 'Outfit, sans-serif')
      .attr('font-size', '28px')
      .attr('font-weight', '800')
      .attr('fill', '#F4F5F7')
      .text('1');

    coreGroup
      .append('text')
      .attr('class', 'd3-core-sub-text')
      .attr('x', CX)
      .attr('y', CY + 20)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '9px')
      .attr('font-weight', '600')
      .attr('letter-spacing', '0.1em')
      .attr('fill', '#A1A1AA')
      .text('READY');
  }, [beatNodes, canEditAccents, numBeats]);

  // Synchronize D3 pulse, arcs, and beat nodes continuously to timeline phase & tempo
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const svg = d3.select(svgEl);

    const isPlaying = timeline.isPlaying;
    const phase = isPlaying ? Math.min(0.9999, Math.max(0, timeline.beatPhase)) : 0;
    const activeBeat = timeline.currentBeat;
    const activeAccent = accentPattern[activeBeat] ?? (activeBeat === 0 ? 'accent' : 'normal');
    const isAccent = activeAccent === 'accent';
    const isMuted = activeAccent === 'mute';

    const pulseColor = isMuted
      ? '#71717A'
      : isAccent || activeBeat === 0
      ? '#F59E0B'
      : '#F4F5F7';

    // Ease curve for crisp percussive onset + tempo-proportional decay
    const eased = d3.easeCubicOut(phase);
    const onsetDecay = isPlaying ? Math.max(0, 1 - d3.easeQuadOut(Math.min(1, phase * 1.45))) : 0;

    // 1. Update Bar Progress Arc
    const barProgress = isPlaying
      ? Math.min(1, Math.max(0, (activeBeat + phase) / numBeats))
      : 0;
    const barArcGen = d3
      .arc<unknown>()
      .innerRadius(BAR_ARC_INNER)
      .outerRadius(BAR_ARC_OUTER)
      .startAngle(0)
      .endAngle(barProgress * Math.PI * 2)
      .cornerRadius(3);

    svg.select<SVGPathElement>('path.d3-bar-progress-arc').attr('d', barArcGen({}) ?? '');

    // 2. Update Beat Phase Arc (sweeps 0 -> 2π each beat in exact tempo)
    const phaseArcGen = d3
      .arc<unknown>()
      .innerRadius(PHASE_ARC_INNER)
      .outerRadius(PHASE_ARC_OUTER)
      .startAngle(0)
      .endAngle(isPlaying ? phase * Math.PI * 2 : 0)
      .cornerRadius(2);

    svg
      .select<SVGPathElement>('path.d3-beat-phase-arc')
      .attr('d', phaseArcGen({}) ?? '')
      .attr('fill', pulseColor)
      .attr('opacity', isPlaying ? 0.92 : 0);

    // 3. Update Expanding Circular Pulse Ring
    const pulseRadius =
      isPlaying && !reducedMotion && visualFlash && !isMuted
        ? PULSE_START_R + (PULSE_END_R - PULSE_START_R) * eased
        : PULSE_START_R;
    const pulseOpacity =
      isPlaying && !reducedMotion && visualFlash && !isMuted
        ? Math.max(0, (1 - eased) * (isAccent ? 0.9 : 0.6))
        : 0;
    const pulseStrokeW = Math.max(0.75, (isAccent ? 4.2 : 2.8) * (1 - eased * 0.75));

    svg
      .select<SVGCircleElement>('circle.d3-pulse-ring')
      .attr('r', pulseRadius)
      .attr('stroke', pulseColor)
      .attr('stroke-width', pulseStrokeW)
      .attr('opacity', pulseOpacity);

    // 4. Secondary harmonic echo ring on accent/downbeat
    const echoPhase = Math.max(0, phase - 0.14) / 0.86;
    const echoEased = d3.easeCubicOut(echoPhase);
    const showEcho = isPlaying && !reducedMotion && visualFlash && (isAccent || activeBeat === 0) && phase > 0.14;

    svg
      .select<SVGCircleElement>('circle.d3-pulse-echo')
      .attr('r', showEcho ? PULSE_START_R + (PULSE_END_R - PULSE_START_R) * 0.85 * echoEased : PULSE_START_R)
      .attr('stroke', '#F59E0B')
      .attr('opacity', showEcho ? (1 - echoEased) * 0.45 : 0);

    // 5. Subdivision micro-ring pulse
    const subCount = Math.max(1, timeline.subdivisionsPerBeat);
    const subPhase = (phase * subCount) % 1;
    const subEased = d3.easeCubicOut(subPhase);
    const showSub = isPlaying && !reducedMotion && visualFlash && subCount > 1 && !isMuted;

    svg
      .select<SVGCircleElement>('circle.d3-sub-ring')
      .attr('r', showSub ? CORE_BASE_R + 4 + subEased * 14 : CORE_BASE_R + 4)
      .attr('opacity', showSub ? (1 - subEased) * 0.42 : 0);

    // 6. Ambient Glow Backdrop
    svg
      .select<SVGCircleElement>('circle.d3-ambient-glow')
      .attr('opacity', isPlaying && visualFlash && !isMuted ? (isAccent ? 0.9 : 0.4) * onsetDecay : 0);

    // 7. Central Beat Core Circle & Readout
    const coreScaleRadius =
      isPlaying && !reducedMotion && !isMuted
        ? CORE_BASE_R + onsetDecay * (isAccent ? 8 : 5)
        : CORE_BASE_R;

    svg
      .select<SVGCircleElement>('circle.d3-beat-core')
      .attr('r', coreScaleRadius)
      .attr(
        'fill',
        isPlaying && visualFlash && !isMuted && onsetDecay > 0.35
          ? isAccent || activeBeat === 0
            ? 'rgba(245,158,11,0.22)'
            : 'rgba(244,245,247,0.12)'
          : '#181B23'
      )
      .attr('stroke', isPlaying ? pulseColor : 'rgba(255,255,255,0.16)')
      .attr('stroke-width', isPlaying && isAccent ? 2.5 : 2);

    svg
      .select<SVGTextElement>('text.d3-core-beat-text')
      .attr('fill', isPlaying ? (isAccent || activeBeat === 0 ? '#FBBF24' : '#FFFFFF') : '#E4E4E7')
      .text(
        isPlaying && timeline.countInDisplayText
          ? timeline.countInDisplayText
          : String((isPlaying ? activeBeat : 0) + 1)
      );

    svg
      .select<SVGTextElement>('text.d3-core-sub-text')
      .attr('fill', isPlaying && (isAccent || timeline.isCountingIn) ? '#F59E0B' : '#A1A1AA')
      .text(
        !isPlaying
          ? `${Math.round(bpm)} BPM`
          : timeline.isCountingIn
          ? 'COUNT-IN'
          : isMuted
          ? 'MUTE'
          : isAccent
          ? 'ACCENT'
          : `BEAT ${activeBeat + 1}`
      );

    // 8. Radial Beat Nodes
    const baseNodeR = numBeats > 8 ? 9 : 11;
    svg
      .selectAll<SVGGElement, BeatNodeDatum>('g.d3-beat-node')
      .each(function (d) {
        const g = d3.select(this);
        const nodeIsActive = isPlaying && activeBeat === d.index;
        const nodeAccent = accentPattern[d.index] ?? d.accent;
        const nodeIsAccent = nodeAccent === 'accent';
        const nodeIsMuted = nodeAccent === 'mute';

        const activeBump = nodeIsActive && !reducedMotion ? onsetDecay * 3 : 0;

        let fill = '#181B23';
        let stroke = 'rgba(255,255,255,0.16)';
        let textFill = '#A1A1AA';

        if (nodeIsActive) {
          if (nodeIsMuted) {
            fill = '#27272A';
            stroke = '#71717A';
            textFill = '#D4D4D8';
          } else if (nodeIsAccent || d.index === 0) {
            fill = '#F59E0B';
            stroke = '#FBBF24';
            textFill = '#09090B';
          } else {
            fill = '#F4F5F7';
            stroke = '#FFFFFF';
            textFill = '#09090B';
          }
        } else if (nodeIsAccent) {
          fill = 'rgba(245,158,11,0.14)';
          stroke = 'rgba(245,158,11,0.55)';
          textFill = '#FCD34D';
        } else if (nodeIsMuted) {
          fill = 'transparent';
          stroke = 'rgba(255,255,255,0.14)';
          textFill = '#52525B';
        }

        g.select<SVGCircleElement>('circle.d3-node-circle')
          .attr('r', baseNodeR + activeBump)
          .attr('fill', fill)
          .attr('stroke', stroke)
          .attr('stroke-dasharray', nodeIsMuted && !nodeIsActive ? '2,2' : null);

        g.select<SVGTextElement>('text.d3-node-label').attr('fill', textFill);
      });
  }, [accentPattern, bpm, numBeats, reducedMotion, timeline, visualFlash]);

  const beatIntervalMs = Math.round(60000 / Math.max(20, bpm));

  return (
    <div className="mb-4 flex flex-col items-center">
      <div className="relative flex items-center justify-center">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-[220px] w-[220px] sm:h-[248px] sm:w-[248px] select-none"
          role="img"
          aria-label={`D3 circular tempo pulse visualizer: Beat ${timeline.currentBeat + 1} of ${numBeats} at ${bpm} BPM`}
        />
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] font-mono-tabular text-zinc-500">
        <span>Pulse Cycle</span>
        <span aria-hidden="true">·</span>
        <span className="text-zinc-300">{beatIntervalMs} ms / beat</span>
        <span aria-hidden="true">·</span>
        <span>
          {timeSignature.numerator}/{timeSignature.denominator}
        </span>
      </div>
    </div>
  );
};
