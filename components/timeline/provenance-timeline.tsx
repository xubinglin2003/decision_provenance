import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatTimestamp } from "@/lib/analytics";
import type { TimelineDecision, TimelineInteraction, TimelineNode } from "@/lib/types";

const DECISION_CARD_CLASS = {
  adopt: "border-emerald-200 bg-emerald-50 text-emerald-700",
  reject: "border-rose-200 bg-rose-50 text-rose-700",
  revise: "border-blue-200 bg-blue-50 text-blue-700",
} as const;

const TIMELINE_SLOT_WIDTH = 250;
const INTERACTION_CARD_WIDTH = 196;
const DECISION_CARD_WIDTH = 236;
const TIMELINE_LEFT_PADDING = 140;
const TIMELINE_RIGHT_PADDING = 96;

type DecisionLayout = {
  decision: TimelineDecision;
  left: number;
  centerX: number;
};

type CompactMarker = {
  id: string;
  layer: "interaction" | "decision";
  tone: "interaction" | TimelineDecision["decisionType"];
  label: string;
  detail: string;
  description: string;
  inspectPosition: number;
  timestamp: string;
};

function compactLabel(label: string, maxLength = 56) {
  return label.length > maxLength ? `${label.slice(0, maxLength - 3)}...` : label;
}

export function buildTimelineNodePositionMap(
  interactions: TimelineInteraction[],
  decisions: TimelineDecision[],
) {
  const orderedInteractions = [...interactions].sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  );

  const orderedDecisions = [...decisions].sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  );

  const interactionCenters = new Map(
    orderedInteractions.map((interaction, index) => [
      interaction.id,
      TIMELINE_LEFT_PADDING + index * TIMELINE_SLOT_WIDTH + INTERACTION_CARD_WIDTH / 2,
    ]),
  );

  const grouped = new Map<string, TimelineDecision[]>();
  const unanchored: TimelineDecision[] = [];

  for (const decision of orderedDecisions) {
    if (decision.triggerInteractionId) {
      const bucket = grouped.get(decision.triggerInteractionId);
      if (bucket) {
        bucket.push(decision);
      } else {
        grouped.set(decision.triggerInteractionId, [decision]);
      }
    } else {
      unanchored.push(decision);
    }
  }

  const decisionCenters = new Map<string, number>();

  for (const interaction of orderedInteractions) {
    const anchored = grouped.get(interaction.id) ?? [];
    const baseCenter = interactionCenters.get(interaction.id) ?? TIMELINE_LEFT_PADDING;
    const totalWidth = (anchored.length - 1) * 28;

    anchored.forEach((decision, index) => {
      const centerX = baseCenter - totalWidth / 2 + index * 28;
      decisionCenters.set(decision.id, centerX);
    });
  }

  const fallbackStart = TIMELINE_LEFT_PADDING + orderedInteractions.length * TIMELINE_SLOT_WIDTH + 24;
  unanchored.forEach((decision, index) => {
    const centerX = fallbackStart + index * (DECISION_CARD_WIDTH + 24);
    decisionCenters.set(decision.id, centerX);
  });

  const canvasWidth = Math.max(
    1100,
    TIMELINE_LEFT_PADDING + Math.max(orderedInteractions.length, 1) * TIMELINE_SLOT_WIDTH + TIMELINE_RIGHT_PADDING,
    ...Array.from(decisionCenters.values()).map((centerX) => centerX + DECISION_CARD_WIDTH / 2 + 48),
  );

  const positions = new Map<string, number>();

  for (const interaction of orderedInteractions) {
    const centerX = interactionCenters.get(interaction.id) ?? TIMELINE_LEFT_PADDING;
    positions.set(interaction.id, centerX / canvasWidth);
  }

  for (const decision of orderedDecisions) {
    const centerX = decisionCenters.get(decision.id);
    if (centerX !== undefined) {
      positions.set(decision.id, centerX / canvasWidth);
    }
  }

  return positions;
}

function buildCompactMarkers(interactions: TimelineInteraction[], decisions: TimelineDecision[]) {
  const merged: CompactMarker[] = [
    ...interactions.map((interaction) => ({
      id: interaction.id,
      layer: "interaction" as const,
      tone: "interaction" as const,
      label: interaction.label,
      detail: interaction.type.replaceAll("_", " "),
      description: interaction.type,
      inspectPosition: 0,
      timestamp: interaction.timestamp,
    })),
    ...decisions.map((decision) => ({
      id: decision.id,
      layer: "decision" as const,
      tone: decision.decisionType,
      label: decision.revisedHypothesisText ?? decision.hypothesisText,
      detail: decision.decisionType,
      description: decision.userExplanation ?? "Decision recorded",
      inspectPosition: 0,
      timestamp: decision.timestamp,
    })),
  ].sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());

  return merged.map((marker, index) => ({
    ...marker,
    inspectPosition: merged.length > 1 ? index / (merged.length - 1) : 0.5,
  }));
}

function markerToneClassName(tone: CompactMarker["tone"]) {
  if (tone === "interaction") {
    return "bg-slate-300";
  }

  if (tone === "adopt") {
    return "bg-emerald-500";
  }

  if (tone === "reject") {
    return "bg-rose-500";
  }

  return "bg-blue-500";
}

export function CompactProvenanceTimeline({
  interactions,
  decisions,
  visible,
  onSelectMarker,
  activeMarkerId,
}: {
  interactions: TimelineInteraction[];
  decisions: TimelineDecision[];
  visible: boolean;
  onSelectMarker?: (marker: CompactMarker) => void;
  activeMarkerId?: string | null;
}) {
  const markers = useMemo(() => buildCompactMarkers(interactions, decisions), [decisions, interactions]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [tooltipLeft, setTooltipLeft] = useState<number | null>(null);
  const eventCount = interactions.length + decisions.length;
  const hoveredMarker = markers.find((marker) => marker.id === hoveredMarkerId) ?? null;
  const latestMarkerId = markers.at(-1)?.id ?? null;

  function handleMarkerPointerEnter(markerId: string, element: HTMLElement) {
    const container = containerRef.current;

    if (!container) {
      setHoveredMarkerId(markerId);
      setTooltipLeft(null);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const markerRect = element.getBoundingClientRect();
    const nextTooltipX = markerRect.left - containerRect.left + markerRect.width / 2;
    setHoveredMarkerId(markerId);
    setTooltipLeft(Math.min(Math.max(nextTooltipX, 132), containerRect.width - 132));
  }

  function clearHoveredMarker(markerId: string) {
    setHoveredMarkerId((current) => (current === markerId ? null : current));
    setTooltipLeft(null);
  }

  useEffect(() => {
    if (!visible || !latestMarkerId) {
      return;
    }

    const scroller = scrollerRef.current;

    if (!scroller) {
      return;
    }

    scroller.scrollTo({
      left: scroller.scrollWidth,
      behavior: "smooth",
    });
  }, [latestMarkerId, markers.length, visible]);

  return (
    <div
      className={`fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 transition-all duration-300 ${
        visible ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
      aria-hidden={!visible}
    >
      <div
        ref={containerRef}
        className="relative w-full max-w-[980px] rounded-[24px] border border-slate-200/80 bg-white/92 px-4 py-3 shadow-[0_18px_45px_rgba(148,163,184,0.2)] backdrop-blur-xl transition"
      >
        {hoveredMarker && tooltipLeft !== null ? (
          <div
            className="pointer-events-none absolute bottom-full z-10 mb-2 w-64 -translate-x-1/2 rounded-[20px] border border-slate-200 bg-white px-3 py-2.5 shadow-[0_18px_40px_rgba(148,163,184,0.22)]"
            style={{
              left: `${tooltipLeft}px`,
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {hoveredMarker.layer === "interaction"
                ? `Interaction · ${hoveredMarker.detail}`
                : `Decision · ${hoveredMarker.detail}`}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-700">
              {compactLabel(hoveredMarker.label, 84)}
            </p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">
              {compactLabel(hoveredMarker.description, 120)}
            </p>
            <p className="mt-1 text-[10px] text-slate-400">{formatTimestamp(hoveredMarker.timestamp)}</p>
          </div>
        ) : null}

        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div ref={scrollerRef} className="overflow-x-auto">
              <div className="relative min-w-max px-2 py-2">
                <div className="absolute left-2 right-2 top-1/2 h-px -translate-y-1/2 bg-slate-300" />
                <div className="relative flex items-center gap-3">
                  {markers.map((marker) => (
                  <button
                    key={marker.id}
                    type="button"
                    onClick={() => onSelectMarker?.(marker)}
                    onPointerEnter={(event) => handleMarkerPointerEnter(marker.id, event.currentTarget)}
                    onPointerLeave={() => clearHoveredMarker(marker.id)}
                    onFocus={(event) => handleMarkerPointerEnter(marker.id, event.currentTarget)}
                    onBlur={() => clearHoveredMarker(marker.id)}
                    className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                    aria-label={`${marker.layer === "interaction" ? "Interaction" : "Decision"}: ${marker.label}`}
                  >
                    <span
                      className={`h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm ${markerToneClassName(marker.tone)} ${
                        activeMarkerId === marker.id ? "ring-2 ring-slate-300 ring-offset-2 ring-offset-white" : ""
                      }`}
                    />
                  </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {eventCount} events
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProvenanceTimeline({
  interactions,
  decisions,
  onInspectNode,
  inspectedNode,
  inspectionContent,
  inspectionToneClassName,
  embedded = false,
  scrollToNodeId,
  onScrollToNodeHandled,
}: {
  interactions: TimelineInteraction[];
  decisions: TimelineDecision[];
  onInspectNode?: (node: TimelineNode) => void;
  inspectedNode?: TimelineNode | null;
  inspectionContent?: ReactNode;
  inspectionToneClassName?: string;
  embedded?: boolean;
  scrollToNodeId?: string | null;
  onScrollToNodeHandled?: () => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const orderedInteractions = [...interactions].sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  );

  const orderedDecisions = [...decisions].sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  );

  const slotWidth = TIMELINE_SLOT_WIDTH;
  const interactionCardWidth = INTERACTION_CARD_WIDTH;
  const decisionCardWidth = DECISION_CARD_WIDTH;
  const leftPadding = TIMELINE_LEFT_PADDING;
  const rightPadding = TIMELINE_RIGHT_PADDING;

  const interactionCenters = useMemo(
    () =>
      new Map(
        orderedInteractions.map((interaction, index) => [
          interaction.id,
          leftPadding + index * slotWidth + interactionCardWidth / 2,
        ]),
      ),
    [interactionCardWidth, leftPadding, orderedInteractions, slotWidth],
  );

  const decisionLayouts = useMemo(() => {
    const grouped = new Map<string, TimelineDecision[]>();
    const unanchored: TimelineDecision[] = [];

    for (const decision of orderedDecisions) {
      if (decision.triggerInteractionId) {
        const bucket = grouped.get(decision.triggerInteractionId);
        if (bucket) {
          bucket.push(decision);
        } else {
          grouped.set(decision.triggerInteractionId, [decision]);
        }
      } else {
        unanchored.push(decision);
      }
    }

    const layouts = new Map<string, DecisionLayout>();

    for (const interaction of orderedInteractions) {
      const anchored = grouped.get(interaction.id) ?? [];
      const baseCenter = interactionCenters.get(interaction.id) ?? leftPadding;
      const totalWidth = (anchored.length - 1) * 28;

      anchored.forEach((decision, index) => {
        const centerX = baseCenter - totalWidth / 2 + index * 28;
        layouts.set(decision.id, {
          decision,
          left: centerX - decisionCardWidth / 2,
          centerX,
        });
      });
    }

    const fallbackStart =
      leftPadding + orderedInteractions.length * slotWidth + 24;
    unanchored.forEach((decision, index) => {
      const centerX = fallbackStart + index * (decisionCardWidth + 24);
      layouts.set(decision.id, {
        decision,
        left: centerX - decisionCardWidth / 2,
        centerX,
      });
    });

    return layouts;
  }, [decisionCardWidth, interactionCenters, leftPadding, orderedDecisions, orderedInteractions, slotWidth]);

  const canvasWidth = Math.max(
    1100,
    leftPadding + Math.max(orderedInteractions.length, 1) * slotWidth + rightPadding,
    ...Array.from(decisionLayouts.values()).map((layout) => layout.left + decisionCardWidth + 48),
  );

  const interactionCardTop = 20;
  const interactionCardHeight = 74;
  const decisionCardTop = 138;
  const decisionCardHeight = 84;
  const timelineY = 258;
  const connectorStartY = interactionCardTop + interactionCardHeight;
  const decisionConnectorStartY = decisionCardTop + decisionCardHeight;
  const inspectionCardTop = 296;
  const inspectionCardWidth = Math.min(820, Math.max(420, canvasWidth - leftPadding - rightPadding - 32));
  const inspectionAnchorX = (inspectedNode?.inspectPosition ?? 0.5) * canvasWidth;
  const inspectionCardLeft = Math.min(
    Math.max(inspectionAnchorX - inspectionCardWidth / 2, leftPadding + 8),
    canvasWidth - inspectionCardWidth - rightPadding + 16,
  );
  const inspectionHeight = inspectionContent ? 700 : 270;
  const nodeCenters = useMemo(() => {
    const centers = new Map<string, number>();

    for (const interaction of orderedInteractions) {
      centers.set(interaction.id, interactionCenters.get(interaction.id) ?? leftPadding);
    }

    for (const decision of orderedDecisions) {
      const layout = decisionLayouts.get(decision.id);
      if (layout) {
        centers.set(decision.id, layout.centerX);
      }
    }

    return centers;
  }, [decisionLayouts, interactionCenters, leftPadding, orderedDecisions, orderedInteractions]);

  useEffect(() => {
    if (!scrollToNodeId) {
      return;
    }

    const scroller = scrollerRef.current;
    const centerX = nodeCenters.get(scrollToNodeId);

    if (!scroller || centerX === undefined) {
      onScrollToNodeHandled?.();
      return;
    }

    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
    const nextScrollLeft = Math.min(Math.max(centerX - scroller.clientWidth / 2, 0), Math.max(maxScrollLeft, 0));

    scroller.scrollTo({
      left: nextScrollLeft,
      behavior: "smooth",
    });
    onScrollToNodeHandled?.();
  }, [nodeCenters, onScrollToNodeHandled, scrollToNodeId]);

  return (
    <div className={embedded ? "" : "rounded-[24px] border border-slate-200/80 bg-slate-50/85 p-5"}>
      {!embedded ? (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Provenance Timeline</h3>
          </div>
          <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500">
            {interactions.length + decisions.length} events
          </div>
        </div>
      ) : null}

      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[132px] rounded-l-[20px] border-r border-slate-200/80 bg-slate-50">
          <div className="absolute left-0 top-[42px] w-full px-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Interactions
          </div>
          <div className="absolute left-0 top-[132px] w-full px-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Decisions
          </div>
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-slate-50 via-slate-50/95 to-transparent">
          <div
            className="absolute right-3 -translate-y-1/2"
            style={{ top: `${timelineY + 1}px` }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M3 4L6.5 7L3 10"
                stroke="#94a3b8"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        <div ref={scrollerRef} className="overflow-x-auto pb-2">
          <div className="relative" style={{ width: `${canvasWidth}px`, height: `${inspectionHeight}px` }}>
            <svg
              className="pointer-events-none absolute inset-0"
              width={canvasWidth}
              height={inspectionHeight}
              viewBox={`0 0 ${canvasWidth} ${inspectionHeight}`}
              fill="none"
            >
            <defs>
              <marker
                id="interaction-arrow"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L0,6 L8,3 z" fill="#64748b" />
              </marker>
            </defs>

            {orderedInteractions.slice(0, -1).map((interaction, index) => {
              const currentX = interactionCenters.get(interaction.id) ?? 0;
              const nextX = interactionCenters.get(orderedInteractions[index + 1].id) ?? currentX;
              return (
                <line
                  key={`${interaction.id}-arrow`}
                  x1={currentX + interactionCardWidth / 2 + 4}
                  y1={interactionCardTop + interactionCardHeight / 2}
                  x2={nextX - interactionCardWidth / 2 - 4}
                  y2={interactionCardTop + interactionCardHeight / 2}
                  stroke="#64748b"
                  strokeWidth="2.5"
                  markerEnd="url(#interaction-arrow)"
                />
              );
            })}

            <line
              x1={leftPadding - 12}
              y1={timelineY}
              x2={canvasWidth - 10}
              y2={timelineY}
              stroke="#94a3b8"
              strokeWidth="2"
            />

            {orderedDecisions.map((decision) => {
              const layout = decisionLayouts.get(decision.id);
              if (!layout) {
                return null;
              }

              const anchorX = decision.triggerInteractionId
                ? (interactionCenters.get(decision.triggerInteractionId) ?? layout.centerX)
                : layout.centerX;

              return (
                <g key={`${decision.id}-connectors`}>
                  <line
                    x1={anchorX}
                    y1={connectorStartY}
                    x2={layout.centerX}
                    y2={decisionCardTop - 10}
                    stroke="#94a3b8"
                    strokeWidth="2"
                    strokeDasharray="5 5"
                  />
                  <line
                    x1={layout.centerX}
                    y1={decisionConnectorStartY}
                    x2={layout.centerX}
                    y2={timelineY - 10}
                    stroke="#94a3b8"
                    strokeWidth="2"
                    strokeDasharray="5 5"
                  />
                </g>
              );
            })}

            {inspectionContent ? (
              <line
                x1={inspectionAnchorX}
                y1={timelineY + 8}
                x2={inspectionAnchorX}
                y2={inspectionCardTop - 14}
                stroke="#94a3b8"
                strokeWidth="2"
                strokeDasharray="5 5"
              />
            ) : null}
            </svg>

          {orderedInteractions.map((interaction) => {
            const centerX = interactionCenters.get(interaction.id) ?? leftPadding;
            return (
              <button
                key={interaction.id}
                type="button"
                onClick={() =>
                  onInspectNode?.({
                    id: interaction.id,
                    label: interaction.label,
                    timestamp: interaction.timestamp,
                    layer: "interaction",
                    tone: "neutral",
                    description: interaction.type,
                    inspectPosition: centerX / canvasWidth,
                  })
                }
                className="absolute rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm"
                style={{
                  left: `${centerX - interactionCardWidth / 2}px`,
                  top: `${interactionCardTop}px`,
                  width: `${interactionCardWidth}px`,
                }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {formatTimestamp(interaction.timestamp)}
                </p>
                <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-700">
                  {compactLabel(interaction.label)}
                </p>
              </button>
            );
          })}

          {orderedDecisions.map((decision) => {
            const layout = decisionLayouts.get(decision.id);
            if (!layout) {
              return null;
            }

            return (
              <button
                key={decision.id}
                type="button"
                onClick={() =>
                  onInspectNode?.({
                    id: decision.id,
                    label: decision.revisedHypothesisText ?? decision.hypothesisText,
                    timestamp: decision.timestamp,
                    layer: "decision",
                    tone: decision.decisionType,
                    description: decision.userExplanation ?? "Decision recorded",
                    anchorId: decision.triggerInteractionId,
                    inspectPosition: layout.centerX / canvasWidth,
                  })
                }
                className={`absolute rounded-[24px] border px-4 py-2.5 text-left shadow-sm ${DECISION_CARD_CLASS[decision.decisionType]}`}
                style={{
                  left: `${layout.left}px`,
                  top: `${decisionCardTop}px`,
                  width: `${decisionCardWidth}px`,
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm leading-none">
                    {decision.decisionType === "adopt"
                      ? "●"
                      : decision.decisionType === "reject"
                        ? "✕"
                        : "✓"}
                  </span>
                  <span className="text-sm font-semibold capitalize">
                    {decision.decisionType}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium">
                  {compactLabel(decision.revisedHypothesisText ?? decision.hypothesisText, 42)}
                </p>
              </button>
            );
          })}

          {orderedDecisions.map((decision, index) => {
            const layout = decisionLayouts.get(decision.id);
            if (!layout) {
              return null;
            }

            return (
              <button
                key={`${decision.id}-marker`}
                type="button"
                onClick={() =>
                  onInspectNode?.({
                    id: decision.id,
                    label: decision.revisedHypothesisText ?? decision.hypothesisText,
                    timestamp: decision.timestamp,
                    layer: "decision",
                    tone: decision.decisionType,
                    description: decision.userExplanation ?? "Decision recorded",
                    anchorId: decision.triggerInteractionId,
                    inspectPosition: layout.centerX / canvasWidth,
                  })
                }
                className={`absolute h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white shadow-sm ${
                  decision.decisionType === "adopt"
                    ? "bg-emerald-500"
                    : decision.decisionType === "reject"
                      ? "bg-rose-500"
                      : "bg-blue-500"
                }`}
                style={{ left: `${layout.centerX}px`, top: `${timelineY - 8}px` }}
                aria-label={`Decision marker ${index + 1}`}
              />
            );
          })}

          {inspectionContent ? (
            <div
              className={`absolute rounded-[24px] border ${inspectionToneClassName ?? "border-slate-200"} bg-white/95 p-4 shadow-[0_18px_45px_rgba(148,163,184,0.16)] backdrop-blur-sm`}
              style={{
                left: `${inspectionCardLeft}px`,
                top: `${inspectionCardTop}px`,
                width: `${inspectionCardWidth}px`,
              }}
            >
              {inspectionContent}
            </div>
          ) : null}
        </div>
        </div>
      </div>
    </div>
  );
}
