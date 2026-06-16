import { geoPath, interpolateBlues, scaleSequential } from "d3";
import { useEffect, useRef, useState } from "react";
import statesTopology from "us-atlas/states-albers-10m.json";
import { feature, mesh } from "topojson-client";
import {
  TOOL_BUTTON_BASE,
  TOOL_BUTTON_ICON_STYLE,
  TOOL_BUTTON_IDLE,
  TOOL_BUTTON_MEDIUM,
  TOOL_BUTTON_SMALL,
  TOOL_BUTTON_STYLE,
} from "@/components/ui/tool-button-styles";
import { formatNumber, getMetricLabel } from "@/lib/analytics";
import { ChartTooltip } from "@/components/ui/chart-tooltip";
import { STATE_FIPS_MAP } from "@/lib/state-positions";
import type { MetricKey, StateAggregate } from "@/lib/types";
import type { GeometryCollection, GeometryObject, Topology } from "topojson-specification";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";

type FeatureCollection = {
  features: Array<{
    id: string | number;
    geometry: unknown;
  }>;
};

type DragState = {
  active: boolean;
  lastX: number;
  lastY: number;
  moved: boolean;
};

const DEFAULT_MAP_WIDTH = 840;
const DEFAULT_MAP_HEIGHT = 360;
const MIN_MAP_WIDTH = 320;
const MIN_MAP_HEIGHT = 280;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function GeoBubbleMap({
  items,
  metric,
  selectedStates,
  onSelectState,
  onClearSelection,
}: {
  items: StateAggregate[];
  metric: MetricKey;
  selectedStates: string[];
  onSelectState: (state: string) => void;
  onClearSelection: () => void;
}) {
  const chartFrameRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState>({ active: false, lastX: 0, lastY: 0, moved: false });
  const zoomScaleRef = useRef(1);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    title: string;
    lines: string[];
  } | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [chartSize, setChartSize] = useState({
    width: DEFAULT_MAP_WIDTH,
    height: DEFAULT_MAP_HEIGHT,
  });

  const width = chartSize.width;
  const height = chartSize.height;
  const metricLabel = getMetricLabel(metric);

  const maxValue = Math.max(1, ...items.map((item) => item.averageMetric));
  const itemByFips = new Map(items.map((item) => [STATE_FIPS_MAP[item.state], item] as const));
  const fillScale = scaleSequential(interpolateBlues).domain([0, maxValue]);
  const chartTopology = statesTopology as unknown as Topology<{
    states: GeometryCollection;
    nation: GeometryObject;
  }>;
  const states = feature(chartTopology, chartTopology.objects.states) as unknown as FeatureCollection;
  const nation = feature(chartTopology, chartTopology.objects.nation);
  const borders = mesh(chartTopology, chartTopology.objects.states, (left, right) => left.id !== right.id);
  const path = geoPath();
  const [[minX, minY], [maxX, maxY]] = path.bounds(nation);
  const margin = 18;
  const mapWidth = maxX - minX;
  const mapHeight = maxY - minY;
  const scale = Math.min(
    (width - margin * 2) / Math.max(mapWidth, 1),
    (height - margin * 2) / Math.max(mapHeight, 1),
  );
  const translateX = (width - mapWidth * scale) / 2 - minX * scale;
  const translateY = (height - mapHeight * scale) / 2 - minY * scale;

  useEffect(() => {
    const frame = chartFrameRef.current;

    if (!frame || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateChartSize = () => {
      const nextWidth = Math.max(frame.clientWidth, MIN_MAP_WIDTH);
      const nextHeight = Math.max(frame.clientHeight, MIN_MAP_HEIGHT);

      setChartSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight },
      );
    };

    updateChartSize();

    const observer = new ResizeObserver(() => {
      updateChartSize();
    });

    observer.observe(frame);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    zoomScaleRef.current = zoomScale;
  }, [zoomScale]);

  function zoomAroundPoint(nextScale: number, originX = width / 2, originY = height / 2) {
    const clampedScale = clamp(nextScale, 1, 6);

    setPanOffset((current) => {
      const scaleRatio = clampedScale / zoomScale;
      return {
        x: originX - (originX - current.x) * scaleRatio,
        y: originY - (originY - current.y) * scaleRatio,
      };
    });
    setZoomScale(clampedScale);
  }

  function applyZoom(factor: number) {
    zoomAroundPoint(zoomScale * factor);
  }

  function resetZoom() {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  }

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    event.stopPropagation();

    const svgRect = svgRef.current?.getBoundingClientRect();
    const originX = svgRect ? ((event.clientX - svgRect.left) / svgRect.width) * width : width / 2;
    const originY = svgRect ? ((event.clientY - svgRect.top) / svgRect.height) * height : height / 2;
    const factor = event.deltaY < 0 ? 1.12 : 0.9;

    zoomAroundPoint(zoomScale * factor, originX, originY);
  }

  useEffect(() => {
    const svgElement = svgRef.current;

    if (!svgElement) {
      return;
    }

    const nativeWheelHandler = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const svgRect = svgElement.getBoundingClientRect();
      const originX = ((event.clientX - svgRect.left) / svgRect.width) * width;
      const originY = ((event.clientY - svgRect.top) / svgRect.height) * height;
      const factor = event.deltaY < 0 ? 1.12 : 0.9;
      const currentScale = zoomScaleRef.current;
      const nextScale = clamp(currentScale * factor, 1, 6);

      setPanOffset((current) => {
        const scaleRatio = nextScale / currentScale;
        return {
          x: originX - (originX - current.x) * scaleRatio,
          y: originY - (originY - current.y) * scaleRatio,
        };
      });
      setZoomScale(nextScale);
    };

    svgElement.addEventListener("wheel", nativeWheelHandler, { passive: false });

    return () => {
      svgElement.removeEventListener("wheel", nativeWheelHandler);
    };
  }, [height, width]);

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    const target = event.target as Element | null;
    const isBackgroundTarget =
      target instanceof SVGSVGElement || (target instanceof SVGRectElement && target.dataset.role === "map-background");

    if (!isBackgroundTarget) {
      return;
    }

    dragRef.current = {
      active: true,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!dragRef.current.active) {
      return;
    }

    const deltaX = event.clientX - dragRef.current.lastX;
    const deltaY = event.clientY - dragRef.current.lastY;

    dragRef.current = {
      active: true,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: dragRef.current.moved || Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2,
    };

    const svgRect = svgRef.current?.getBoundingClientRect();
    const scaleX = svgRect ? width / svgRect.width : 1;
    const scaleY = svgRect ? height / svgRect.height : 1;

    setPanOffset((current) => ({
      x: current.x + deltaX * scaleX,
      y: current.y + deltaY * scaleY,
    }));
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (!dragRef.current.active) {
      return;
    }

    dragRef.current.active = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  if (items.length === 0) {
    return (
      <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-6 text-sm text-slate-500">
        No geography view is available for the current selection.
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full min-h-[380px] flex-col rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClearSelection();
        }
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-800">Geographic Pattern</h3>
          <p className="text-sm text-slate-500">US map silhouette with state-level crime intensity bubbles.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => applyZoom(1.25)}
            style={TOOL_BUTTON_ICON_STYLE}
            className={`${TOOL_BUTTON_BASE} ${TOOL_BUTTON_SMALL} ${TOOL_BUTTON_IDLE}`}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => applyZoom(0.8)}
            style={TOOL_BUTTON_ICON_STYLE}
            className={`${TOOL_BUTTON_BASE} ${TOOL_BUTTON_SMALL} ${TOOL_BUTTON_IDLE}`}
          >
            -
          </button>
          <button
            type="button"
            onClick={resetZoom}
            style={TOOL_BUTTON_STYLE}
            className={`${TOOL_BUTTON_BASE} ${TOOL_BUTTON_MEDIUM} ${TOOL_BUTTON_IDLE}`}
          >
            Reset
          </button>
        </div>
      </div>

      <div ref={chartFrameRef} className="min-h-[280px] flex-1">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="size-full rounded-2xl bg-[linear-gradient(180deg,#eff6ff_0%,#f8fafc_100%)] touch-none"
          onWheelCapture={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ overscrollBehavior: "contain" }}
        >
          <rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill="transparent"
            data-role="map-background"
            onClick={() => {
              if (!dragRef.current.moved) {
                onClearSelection();
              }
            }}
          />
          <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoomScale})`}>
            <g transform={`translate(${translateX}, ${translateY}) scale(${scale})`}>
              <path d={path(nation) ?? ""} fill="#eef6ff" stroke="#bfd9f6" strokeWidth="1.2" />
              {states.features.map((stateFeature) => {
                const fips = String(stateFeature.id).padStart(2, "0");
                const stateItem = itemByFips.get(fips);
                const stateName = stateItem?.state;
                const value = stateItem?.averageMetric ?? 0;
                const selected = stateName ? selectedStates.includes(stateName) : false;
                const dimmed = selectedStates.length > 0 && !selected;

                if (!stateName) {
                  return (
                    <path
                      key={fips}
                      d={path(stateFeature as never) ?? ""}
                      fill="#eff6ff"
                      stroke="#d8e5f5"
                      strokeWidth="0.5"
                    />
                  );
                }

                const centroid = path.centroid(stateFeature as never);
                return (
                  <g
                  key={fips}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectState(stateName);
                    }}
                    className="cursor-pointer"
                    onMouseMove={(event: ReactMouseEvent<SVGGElement>) =>
                      setTooltip({
                        x: event.clientX,
                        y: event.clientY,
                        title: stateName,
                        lines: [
                          `Region: ${stateItem.region}`,
                          `Average ${metricLabel}: ${formatNumber(stateItem.averageMetric)}`,
                          `Peak ${metricLabel}: ${formatNumber(stateItem.peakMetric)}`,
                          `Years: ${stateItem.records}`,
                        ],
                      })
                    }
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <path
                      d={path(stateFeature as never) ?? ""}
                      fill={dimmed ? "#cbd5e1" : fillScale(value)}
                      stroke={selected ? "#1e293b" : "white"}
                      strokeWidth={selected ? "2" : "0.7"}
                    />
                    {selected && Number.isFinite(centroid[0]) && Number.isFinite(centroid[1]) ? (
                      <>
                        <circle cx={centroid[0]} cy={centroid[1]} r="4.5" fill="#1e293b" />
                        <text
                          x={centroid[0] + 8}
                          y={centroid[1] - 4}
                          fill="#1e293b"
                          fontSize="12"
                          fontWeight="700"
                          pointerEvents="none"
                        >
                          {stateName}
                        </text>
                        <text
                          x={centroid[0] + 8}
                          y={centroid[1] + 12}
                          fill="#334155"
                          fontSize="11"
                          pointerEvents="none"
                        >
                          {formatNumber(value)}
                        </text>
                      </>
                    ) : null}
                  </g>
                );
              })}
              <path d={path(borders) ?? ""} fill="none" stroke="#ffffff" strokeWidth="0.8" pointerEvents="none" />
            </g>
          </g>
        </svg>
      </div>
      {tooltip ? <ChartTooltip x={tooltip.x} y={tooltip.y} title={tooltip.title} lines={tooltip.lines} /> : null}
    </div>
  );
}
