import * as d3 from 'd3';
import React, { useEffect, useId, useMemo, useRef } from 'react';
import { BeatAccentType, SubdivisionType, TimeSignature } from '../types/metronome';
import { TimelineSnapshot } from '../utils/timeline';

interface D3BeatPulseVisualizerProps {
  bpm: number;
  timeSignature: TimeSignature;
  accentPattern: BeatAccentType[];
  subdivision: SubdivisionType;
  timeline: TimelineSnapshot;
  getTimelineSnapshot?: () => TimelineSnapshot;
  canEditAccents: boolean;
  onToggleBeatAccent?: (beatIndex: number) => void;
  visualFlash?: boolean;
  reducedMotion?: boolean;
  theme?: 'dark' | 'light';
}

interface BeatNodeDatum {
  index: number;
  angle: number;
  x: number;
  y: number;
  accent: BeatAccentType;
}

interface CachedSvgNodes {
  barProgressArc: SVGPathElement | null;
  beatPhaseArc: SVGPathElement | null;
  pulseRing: SVGCircleElement | null;
  pulseEcho: SVGCircleElement | null;
  subRing: SVGCircleElement | null;
  ambientGlow: SVGCircleElement | null;
  beatCore: SVGCircleElement | null;
  coreBeatText: SVGTextElement | null;
  coreSubText: SVGTextElement | null;
  nodeCircles: Array<SVGCircleElement | null>;
  nodeLabels: Array<SVGTextElement | null>;
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

export const D3BeatPulseVisualizer: React.FC<D3BeatPulseVisualizerProps> = React.memo(({
  bpm,
  timeSignature,
  accentPattern,
  timeline,
  getTimelineSnapshot,
  canEditAccents,
  onToggleBeatAccent,
  visualFlash = true,
  reducedMotion = false,
  theme = 'dark',
}) => {
  const isLight = theme === 'light';
  const rawGradId = useId();
  const gradId = `d3-pulse-glow-${rawGradId.replace(/:/g, '')}`;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const cachedRef = useRef<CachedSvgNodes | null>(null);

  const onToggleRef = useRef(onToggleBeatAccent);
  onToggleRef.current = onToggleBeatAccent;

  const latestPropsRef = useRef({
    bpm,
    accentPattern,
    isLight,
    visualFlash,
    reducedMotion,
    numBeats: Math.max(1, timeSignature.numerator),
    timeline,
  });
  latestPropsRef.current = {
    bpm,
    accentPattern,
    isLight,
    visualFlash,
    reducedMotion,
    numBeats: Math.max(1, timeSignature.numerator),
    timeline,
  };

  const getSnapshotRef = useRef(getTimelineSnapshot);
  getSnapshotRef.current = getTimelineSnapshot;

  // Reusable D3 arc generators (never recreated inside animation frames)
  const barArcGen = useMemo(
    () =>
      d3
        .arc<unknown>()
        .innerRadius(BAR_ARC_INNER)
        .outerRadius(BAR_ARC_OUTER)
        .startAngle(0)
        .cornerRadius(3),
    []
  );

  const phaseArcGen = useMemo(
    () =>
      d3
        .arc<unknown>()
        .innerRadius(PHASE_ARC_INNER)
        .outerRadius(PHASE_ARC_OUTER)
        .startAngle(0)
        .cornerRadius(2),
    []
  );

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

  // Build structural SVG layers via D3 & cache DOM node references for zero-allocation RAF ticks
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const trackFill = isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.06)';
    const orbitStroke = isLight ? 'rgba(15,23,42,0.1)' : 'rgba(255,255,255,0.07)';
    const subRingStroke = isLight ? 'rgba(15,23,42,0.28)' : 'rgba(255,255,255,0.3)';
    const coreFill = isLight ? '#FFFFFF' : '#181B23';
    const coreStroke = isLight ? 'rgba(15,23,42,0.16)' : 'rgba(255,255,255,0.16)';
    const coreText = isLight ? '#0F172A' : '#F4F5F7';
    const subText = isLight ? '#64748B' : '#A1A1AA';

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    const radialGrad = defs
      .append('radialGradient')
      .attr('id', gradId)
      .attr('cx', '50%')
      .attr('cy', '50%')
      .attr('r', '50%');
    radialGrad.append('stop').attr('offset', '0%').attr('stop-color', '#F59E0B').attr('stop-opacity', 0.28);
    radialGrad.append('stop').attr('offset', '100%').attr('stop-color', '#F59E0B').attr('stop-opacity', 0);

    const root = svg.append('g').attr('class', 'd3-stage-root');

    const ambientGlow = root
      .append('circle')
      .attr('class', 'd3-ambient-glow')
      .attr('cx', CX)
      .attr('cy', CY)
      .attr('r', 102)
      .attr('fill', `url(#${gradId})`)
      .attr('opacity', 0)
      .node();

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
      .attr('fill', trackFill);

    const barProgressArc = root
      .append('path')
      .attr('class', 'd3-bar-progress-arc')
      .attr('transform', `translate(${CX},${CY})`)
      .attr('fill', '#F59E0B')
      .attr('opacity', 0.85)
      .node();

    root
      .append('circle')
      .attr('cx', CX)
      .attr('cy', CY)
      .attr('r', NODE_ORBIT_R)
      .attr('fill', 'none')
      .attr('stroke', orbitStroke)
      .attr('stroke-width', 1);

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
      .attr('fill', trackFill);

    const beatPhaseArc = root
      .append('path')
      .attr('class', 'd3-beat-phase-arc')
      .attr('transform', `translate(${CX},${CY})`)
      .attr('fill', '#F59E0B')
      .node();

    const pulseEcho = root
      .append('circle')
      .attr('class', 'd3-pulse-echo')
      .attr('cx', CX)
      .attr('cy', CY)
      .attr('r', PULSE_START_R)
      .attr('fill', 'none')
      .attr('stroke', '#F59E0B')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0)
      .node();

    const pulseRing = root
      .append('circle')
      .attr('class', 'd3-pulse-ring')
      .attr('cx', CX)
      .attr('cy', CY)
      .attr('r', PULSE_START_R)
      .attr('fill', 'none')
      .attr('stroke', '#F59E0B')
      .attr('stroke-width', 3)
      .attr('opacity', 0)
      .node();

    const subRing = root
      .append('circle')
      .attr('class', 'd3-sub-ring')
      .attr('cx', CX)
      .attr('cy', CY)
      .attr('r', CORE_BASE_R + 10)
      .attr('fill', 'none')
      .attr('stroke', subRingStroke)
      .attr('stroke-width', 1.25)
      .attr('opacity', 0)
      .node();

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

    const nodeCircles: Array<SVGCircleElement | null> = [];
    const nodeLabels: Array<SVGTextElement | null> = [];
    nodeGroups.each(function () {
      nodeCircles.push(this.querySelector('circle.d3-node-circle'));
      nodeLabels.push(this.querySelector('text.d3-node-label'));
    });

    const coreGroup = root.append('g').attr('class', 'd3-core-group');

    const beatCore = coreGroup
      .append('circle')
      .attr('class', 'd3-beat-core')
      .attr('cx', CX)
      .attr('cy', CY)
      .attr('r', CORE_BASE_R)
      .attr('fill', coreFill)
      .attr('stroke', coreStroke)
      .attr('stroke-width', 2)
      .node();

    const coreBeatText = coreGroup
      .append('text')
      .attr('class', 'd3-core-beat-text')
      .attr('x', CX)
      .attr('y', CY - 3)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-family', 'Outfit, sans-serif')
      .attr('font-size', '28px')
      .attr('font-weight', '800')
      .attr('fill', coreText)
      .text('1')
      .node();

    const coreSubText = coreGroup
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
      .attr('fill', subText)
      .text('READY')
      .node();

    cachedRef.current = {
      barProgressArc,
      beatPhaseArc,
      pulseRing,
      pulseEcho,
      subRing,
      ambientGlow,
      beatCore,
      coreBeatText,
      coreSubText,
      nodeCircles,
      nodeLabels,
    };
  }, [beatNodes, canEditAccents, gradId, isLight, numBeats]);

  // Direct zero-allocation DOM updater + native RAF loop when playing
  useEffect(() => {
    let rafId = 0;
    let active = true;
    let lastDiscreteKey = '';
    let lastActiveBeatForBump = -1;

    const renderFrame = (snap: TimelineSnapshot) => {
      const nodes = cachedRef.current;
      if (!nodes) return;

      const {
        bpm: currentBpm,
        accentPattern: accents,
        isLight: light,
        visualFlash: flash,
        reducedMotion: reduced,
        numBeats: beats,
      } = latestPropsRef.current;

      const isPlaying = snap.isPlaying;
      const phase = isPlaying ? Math.min(0.9999, Math.max(0, snap.beatPhase)) : 0;
      const activeBeat = snap.currentBeat;
      const activeAccent = accents[activeBeat] ?? (activeBeat === 0 ? 'accent' : 'normal');
      const isAccent = activeAccent === 'accent';
      const isMuted = activeAccent === 'mute';

      const normalPulse = light ? '#0F172A' : '#F4F5F7';
      const pulseColor = isMuted
        ? '#71717A'
        : isAccent || activeBeat === 0
        ? '#F59E0B'
        : normalPulse;

      const eased = d3.easeCubicOut(phase);
      const onsetDecay = isPlaying ? Math.max(0, 1 - d3.easeQuadOut(Math.min(1, phase * 1.45))) : 0;

      // 1. Bar Progress Arc
      if (nodes.barProgressArc) {
        const barProgress = isPlaying
          ? Math.min(1, Math.max(0, (activeBeat + phase) / beats))
          : 0;
        barArcGen.endAngle(barProgress * Math.PI * 2);
        nodes.barProgressArc.setAttribute('d', barArcGen({}) ?? '');
      }

      // 2. Beat Phase Arc
      if (nodes.beatPhaseArc) {
        phaseArcGen.endAngle(isPlaying ? phase * Math.PI * 2 : 0);
        nodes.beatPhaseArc.setAttribute('d', phaseArcGen({}) ?? '');
        nodes.beatPhaseArc.setAttribute('fill', pulseColor);
        nodes.beatPhaseArc.setAttribute('opacity', isPlaying ? '0.92' : '0');
      }

      // 3. Expanding Circular Pulse Ring
      if (nodes.pulseRing) {
        const activePulse = isPlaying && !reduced && flash && !isMuted;
        const pulseRadius = activePulse
          ? PULSE_START_R + (PULSE_END_R - PULSE_START_R) * eased
          : PULSE_START_R;
        const pulseOpacity = activePulse
          ? Math.max(0, (1 - eased) * (isAccent ? 0.9 : 0.6))
          : 0;
        const pulseStrokeW = Math.max(0.75, (isAccent ? 4.2 : 2.8) * (1 - eased * 0.75));
        nodes.pulseRing.setAttribute('r', pulseRadius.toFixed(2));
        nodes.pulseRing.setAttribute('stroke', pulseColor);
        nodes.pulseRing.setAttribute('stroke-width', pulseStrokeW.toFixed(2));
        nodes.pulseRing.setAttribute('opacity', pulseOpacity.toFixed(3));
      }

      // 4. Secondary harmonic echo ring on accent/downbeat
      if (nodes.pulseEcho) {
        const echoPhase = Math.max(0, phase - 0.14) / 0.86;
        const echoEased = d3.easeCubicOut(echoPhase);
        const showEcho = isPlaying && !reduced && flash && (isAccent || activeBeat === 0) && phase > 0.14;
        nodes.pulseEcho.setAttribute(
          'r',
          (showEcho ? PULSE_START_R + (PULSE_END_R - PULSE_START_R) * 0.85 * echoEased : PULSE_START_R).toFixed(2)
        );
        nodes.pulseEcho.setAttribute('opacity', showEcho ? ((1 - echoEased) * 0.45).toFixed(3) : '0');
      }

      // 5. Subdivision micro-ring pulse
      if (nodes.subRing) {
        const subCount = Math.max(1, snap.subdivisionsPerBeat);
        const subPhase = (phase * subCount) % 1;
        const subEased = d3.easeCubicOut(subPhase);
        const showSub = isPlaying && !reduced && flash && subCount > 1 && !isMuted;
        nodes.subRing.setAttribute(
          'r',
          (showSub ? CORE_BASE_R + 4 + subEased * 14 : CORE_BASE_R + 4).toFixed(2)
        );
        nodes.subRing.setAttribute('opacity', showSub ? ((1 - subEased) * 0.42).toFixed(3) : '0');
      }

      // 6. Ambient Glow Backdrop
      if (nodes.ambientGlow) {
        const ambOpacity = isPlaying && flash && !isMuted ? (isAccent ? 0.9 : 0.4) * onsetDecay : 0;
        nodes.ambientGlow.setAttribute('opacity', ambOpacity.toFixed(3));
      }

      // 7. Central Beat Core Circle
      if (nodes.beatCore) {
        const coreScaleRadius =
          isPlaying && !reduced && !isMuted
            ? CORE_BASE_R + onsetDecay * (isAccent ? 8 : 5)
            : CORE_BASE_R;
        const coreDefaultFill = light ? '#FFFFFF' : '#181B23';
        const coreDefaultStroke = light ? 'rgba(15,23,42,0.16)' : 'rgba(255,255,255,0.16)';
        const coreNormalFlash = light ? 'rgba(15,23,42,0.08)' : 'rgba(244,245,247,0.12)';

        nodes.beatCore.setAttribute('r', coreScaleRadius.toFixed(2));
        nodes.beatCore.setAttribute(
          'fill',
          isPlaying && flash && !isMuted && onsetDecay > 0.35
            ? isAccent || activeBeat === 0
              ? 'rgba(245,158,11,0.22)'
              : coreNormalFlash
            : coreDefaultFill
        );
        nodes.beatCore.setAttribute('stroke', isPlaying ? pulseColor : coreDefaultStroke);
        nodes.beatCore.setAttribute('stroke-width', isPlaying && isAccent ? '2.5' : '2');
      }

      // 8. Active Beat Node Radial Bump (continuous)
      const baseNodeR = beats > 8 ? 9 : 11;
      if (lastActiveBeatForBump !== -1 && lastActiveBeatForBump !== activeBeat) {
        const prevCircle = nodes.nodeCircles[lastActiveBeatForBump];
        if (prevCircle) prevCircle.setAttribute('r', String(baseNodeR));
      }
      if (isPlaying && !reduced) {
        const activeCircle = nodes.nodeCircles[activeBeat];
        if (activeCircle) {
          activeCircle.setAttribute('r', (baseNodeR + onsetDecay * 3).toFixed(2));
        }
        lastActiveBeatForBump = activeBeat;
      } else {
        lastActiveBeatForBump = -1;
      }

      // 9. Discrete Text & Radial Node Color States (updated only when beat/state/theme changes)
      const discreteKey = `${isPlaying ? 1 : 0}|${activeBeat}|${snap.isCountingIn ? 1 : 0}|${snap.countInDisplayText ?? ''}|${Math.round(currentBpm)}|${light ? 1 : 0}|${accents.join(',')}`;
      if (discreteKey !== lastDiscreteKey) {
        lastDiscreteKey = discreteKey;

        if (nodes.coreBeatText) {
          nodes.coreBeatText.setAttribute(
            'fill',
            isPlaying
              ? isAccent || activeBeat === 0
                ? light
                  ? '#D97706'
                  : '#FBBF24'
                : light
                ? '#0F172A'
                : '#FFFFFF'
              : light
              ? '#0F172A'
              : '#E4E4E7'
          );
          nodes.coreBeatText.textContent =
            isPlaying && snap.countInDisplayText
              ? snap.countInDisplayText
              : String((isPlaying ? activeBeat : 0) + 1);
        }

        if (nodes.coreSubText) {
          nodes.coreSubText.setAttribute(
            'fill',
            isPlaying && (isAccent || snap.isCountingIn)
              ? light
                ? '#D97706'
                : '#F59E0B'
              : light
              ? '#64748B'
              : '#A1A1AA'
          );
          nodes.coreSubText.textContent = !isPlaying
            ? `${Math.round(currentBpm)} BPM`
            : snap.isCountingIn
            ? 'COUNT-IN'
            : isMuted
            ? 'MUTE'
            : isAccent
            ? 'ACCENT'
            : `BEAT ${activeBeat + 1}`;
        }

        for (let i = 0; i < nodes.nodeCircles.length; i++) {
          const circle = nodes.nodeCircles[i];
          const label = nodes.nodeLabels[i];
          if (!circle || !label) continue;

          const nodeIsActive = isPlaying && activeBeat === i;
          const nodeAccent = accents[i] ?? (i === 0 ? 'accent' : 'normal');
          const nodeIsAccent = nodeAccent === 'accent';
          const nodeIsMuted = nodeAccent === 'mute';

          let fill = light ? '#F1F5F9' : '#181B23';
          let stroke = light ? 'rgba(15,23,42,0.16)' : 'rgba(255,255,255,0.16)';
          let textFill = light ? '#475569' : '#A1A1AA';

          if (nodeIsActive) {
            if (nodeIsMuted) {
              fill = light ? '#E2E8F0' : '#27272A';
              stroke = '#71717A';
              textFill = light ? '#334155' : '#D4D4D8';
            } else if (nodeIsAccent || i === 0) {
              fill = '#F59E0B';
              stroke = '#FBBF24';
              textFill = '#09090B';
            } else {
              fill = light ? '#0F172A' : '#F4F5F7';
              stroke = light ? '#0F172A' : '#FFFFFF';
              textFill = light ? '#FFFFFF' : '#09090B';
            }
          } else if (nodeIsAccent) {
            fill = light ? 'rgba(245,158,11,0.16)' : 'rgba(245,158,11,0.14)';
            stroke = 'rgba(245,158,11,0.55)';
            textFill = light ? '#B45309' : '#FCD34D';
          } else if (nodeIsMuted) {
            fill = 'transparent';
            stroke = light ? 'rgba(15,23,42,0.16)' : 'rgba(255,255,255,0.14)';
            textFill = light ? '#94A3B8' : '#52525B';
          }

          if (!nodeIsActive) {
            circle.setAttribute('r', String(baseNodeR));
          }
          circle.setAttribute('fill', fill);
          circle.setAttribute('stroke', stroke);
          if (nodeIsMuted && !nodeIsActive) {
            circle.setAttribute('stroke-dasharray', '2,2');
          } else {
            circle.removeAttribute('stroke-dasharray');
          }
          label.setAttribute('fill', textFill);
        }
      }
    };

    // Always draw latest state immediately
    renderFrame(getSnapshotRef.current ? getSnapshotRef.current() : timeline);

    if (!timeline.isPlaying || !getSnapshotRef.current) {
      return;
    }

    const tick = () => {
      if (!active) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        rafId = 0;
        return;
      }
      const snap = getSnapshotRef.current ? getSnapshotRef.current() : latestPropsRef.current.timeline;
      renderFrame(snap);
      rafId = requestAnimationFrame(tick);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && rafId === 0 && active) {
        rafId = requestAnimationFrame(tick);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    rafId = requestAnimationFrame(tick);
    return () => {
      active = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, [accentPattern, bpm, isLight, numBeats, reducedMotion, timeline, visualFlash]);

  const beatIntervalMs = Math.round(60000 / Math.max(20, bpm));

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex items-center justify-center">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-[208px] w-[208px] sm:h-[238px] sm:w-[238px] select-none"
          role="img"
          aria-label={`D3 circular tempo pulse visualizer: Beat ${timeline.currentBeat + 1} of ${numBeats} at ${bpm} BPM`}
        />
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] font-mono-tabular text-slate-500 dark:text-zinc-500">
        <span>Pulse Cycle</span>
        <span aria-hidden="true">·</span>
        <span className="text-slate-700 dark:text-zinc-300">{beatIntervalMs} ms / beat</span>
        <span aria-hidden="true">·</span>
        <span>
          {timeSignature.numerator}/{timeSignature.denominator}
        </span>
      </div>
    </div>
  );
});
D3BeatPulseVisualizer.displayName = 'D3BeatPulseVisualizer';
