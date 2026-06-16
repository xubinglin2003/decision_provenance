import { brush, extent, scaleLinear, scaleSqrt, select } from "d3";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChartTooltip } from "@/components/ui/chart-tooltip";
import {
  TOOL_BUTTON_ACTIVE,
  TOOL_BUTTON_BASE,
  TOOL_BUTTON_IDLE,
  TOOL_BUTTON_MEDIUM,
  TOOL_BUTTON_STYLE,
} from "@/components/ui/tool-button-styles";
import { formatNumber, getMetricLabel } from "@/lib/analytics";
import type { MetricKey, ScatterColorMode, ScatterPointAggregate } from "@/lib/types";

const REGION_COLORS: Record<string, string> = {
  Northeast: "#2563eb",
  Midwest: "#0f766e",
  South: "#d97706",
  West: "#7c3aed",
  Unknown: "#94a3b8",
};

function getPointColor(item: ScatterPointAggregate, selectedStates: string[], colorMode: ScatterColorMode) {
  if (selectedStates.length > 0 && !selectedStates.includes(item.state)) {
    return "#cbd5e1";
  }

  if (colorMode === "region") {
    return REGION_COLORS[item.region] ?? REGION_COLORS.Unknown;
  }

  return "#2563eb";
}

export function ScatterChart({
  items,
  xMetric,
  yMetric,
  colorMode,
  selectedStates,
  onSelectState,
  onClearSelection,
  onBrushSelection,
}: {
  items: ScatterPointAggregate[];
  xMetric: MetricKey;
  yMetric: MetricKey;
  colorMode: ScatterColorMode;
  selectedStates: string[];
  onSelectState: (state: string) => void;
  onClearSelection: () => void;
  onBrushSelection: (states: string[]) => void;
}) {
  const brushRef = useRef<SVGGElement | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    title: string;
    lines: string[];
  } | null>(null);
  const [brushEnabled, setBrushEnabled] = useState(false);

  const width = 840;
  const height = 310;
  const padding = { top: 20, right: 28, bottom: 62, left: 82 };
  const [rawMinX = 0, rawMaxX = 1] = extent(items, (item) => item.xValue);
  const [rawMinY = 0, rawMaxY = 1] = extent(items, (item) => item.yValue);
  const xMin = rawMinX === rawMaxX ? rawMinX - 1 : rawMinX;
  const xMax = rawMinX === rawMaxX ? rawMaxX + 1 : rawMaxX;
  const yMin = rawMinY === rawMaxY ? rawMinY - 1 : rawMinY;
  const yMax = rawMinY === rawMaxY ? rawMaxY + 1 : rawMaxY;
  const maxPopulation = Math.max(...items.map((item) => item.population), 1);
  const xScale = scaleLinear().domain([xMin, xMax]).nice(5).range([padding.left, width - padding.right]);
  const yScale = scaleLinear().domain([yMin, yMax]).nice(5).range([height - padding.bottom, padding.top]);
  const radiusScale = scaleSqrt().domain([0, maxPopulation]).range([6, 18]);
  const xTicks = xScale.ticks(5);
  const yTicks = yScale.ticks(5);
  const selectedStateSet = useMemo(() => new Set(selectedStates), [selectedStates]);
  const regionLegend = useMemo(
    () =>
      Array.from(new Set(items.map((item) => item.region))).map((region) => ({
        region,
        color: REGION_COLORS[region] ?? REGION_COLORS.Unknown,
      })),
    [items],
  );

  useEffect(() => {
    const brushElement = brushRef.current;

    if (!brushElement || !brushEnabled) {
      return;
    }

    const brushGroup = select<SVGGElement, unknown>(brushElement);

    const brushBehavior = brush()
      .extent([
        [padding.left, padding.top],
        [width - padding.right, height - padding.bottom],
      ])
      .on("end", (event) => {
        const selection = event.selection as [[number, number], [number, number]] | null;

        if (!selection) {
          return;
        }

        const [[x0, y0], [x1, y1]] = selection;
        const brushedStates = items
          .filter((item) => {
            const x = xScale(item.xValue);
            const y = yScale(item.yValue);
            return x >= x0 && x <= x1 && y >= y0 && y <= y1;
          })
          .map((item) => item.state);

        onBrushSelection(brushedStates);
        brushBehavior.move(brushGroup, null);
        setBrushEnabled(false);
      });

    brushGroup.call(brushBehavior);
    brushGroup.selectAll(".overlay").style("cursor", "crosshair");

    return () => {
      brushGroup.on(".brush", null);
      brushGroup.selectAll("*").remove();
    };
  }, [brushEnabled, height, items, onBrushSelection, padding.bottom, padding.left, padding.right, padding.top, width, xScale, yScale]);

  if (items.length === 0) {
    return (
      <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-6 text-sm text-slate-500">
        No states match the current year filter.
      </div>
    );
  }

  return (
    <div className="relative rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-800">State Scatter Comparison</h3>
          <p className="text-sm text-slate-500">
            One point per state. Axes use the average across all years or the selected years.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500">
            {items.length} states
          </div>
          <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500">
            Size: population
          </div>
          <button
            type="button"
            onClick={() => {
              setTooltip(null);
              setBrushEnabled((current) => !current);
            }}
            style={TOOL_BUTTON_STYLE}
            className={`${TOOL_BUTTON_BASE} ${TOOL_BUTTON_MEDIUM} ${
              brushEnabled ? TOOL_BUTTON_ACTIVE : TOOL_BUTTON_IDLE
            }`}
          >
            {brushEnabled ? "Brushing..." : "Brush"}
          </button>
        </div>
      </div>

      {colorMode === "region" ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {regionLegend.map((entry) => (
            <span
              key={entry.region}
              className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.region}
            </span>
          ))}
        </div>
      ) : null}

      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full overflow-visible">
        <rect x={0} y={0} width={width} height={height} fill="transparent" onClick={onClearSelection} />
        <line
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
          stroke="#94a3b8"
        />
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={height - padding.bottom}
          stroke="#94a3b8"
        />

        {yTicks.map((tick) => {
          const y = yScale(tick);
          return (
            <g key={`y-${tick}`}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray="4 4"
              />
              <text x={padding.left - 12} y={y + 4} fill="#64748b" fontSize="11" textAnchor="end">
                {formatNumber(tick)}
              </text>
            </g>
          );
        })}

        {xTicks.map((tick) => (
          <g key={`x-${tick}`}>
            <line
              x1={xScale(tick)}
              y1={height - padding.bottom}
              x2={xScale(tick)}
              y2={height - padding.bottom + 6}
              stroke="#94a3b8"
            />
            <text
              x={xScale(tick)}
              y={height - padding.bottom + 22}
              fill="#64748b"
              fontSize="11"
              textAnchor="middle"
            >
              {formatNumber(tick)}
            </text>
          </g>
        ))}

        {items.map((item) => {
          const isSelected = selectedStateSet.has(item.state);
          const radius = radiusScale(item.population);

          return (
            <g key={item.state}>
              <circle
                cx={xScale(item.xValue)}
                cy={yScale(item.yValue)}
                r={radius}
                fill={getPointColor(item, selectedStates, colorMode)}
                fillOpacity={isSelected || selectedStates.length === 0 ? 0.72 : 0.45}
                stroke={isSelected ? "#1e293b" : "white"}
                strokeWidth={isSelected ? 2.5 : 1.5}
                className="cursor-pointer transition-all duration-200"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectState(item.state);
                }}
                onMouseMove={(event) =>
                  setTooltip({
                    x: event.clientX,
                    y: event.clientY,
                    title: item.state,
                    lines: [
                      `Region: ${item.region}`,
                      `${getMetricLabel(xMetric)}: ${formatNumber(item.xValue)}`,
                      `${getMetricLabel(yMetric)}: ${formatNumber(item.yValue)}`,
                      `Avg population: ${formatNumber(item.population)}`,
                      `Years averaged: ${item.records}`,
                    ],
                  })
                }
                onMouseLeave={() => setTooltip(null)}
              />
              {isSelected ? (
                <text
                  x={xScale(item.xValue) + radius + 4}
                  y={yScale(item.yValue) - radius - 2}
                  fill="#1e293b"
                  fontSize="11"
                  fontWeight="700"
                  pointerEvents="none"
                >
                  {item.state}
                </text>
              ) : null}
            </g>
          );
        })}

        <text x={(padding.left + (width - padding.right)) / 2} y={height - 10} fill="#475569" fontSize="12" fontWeight="600" textAnchor="middle">
          {getMetricLabel(xMetric)}
        </text>
        <text
          x={24}
          y={(padding.top + (height - padding.bottom)) / 2}
          fill="#475569"
          fontSize="12"
          fontWeight="600"
          textAnchor="middle"
          transform={`rotate(-90 24 ${(padding.top + (height - padding.bottom)) / 2})`}
        >
          {getMetricLabel(yMetric)}
        </text>
        {brushEnabled ? <g ref={brushRef} /> : null}
      </svg>
      <p className="mt-2 text-xs text-slate-400">
        {brushEnabled ? "Drag on the plot to brush-select states." : "Hover points for details, or enable Brush to select an area."}
      </p>
      {tooltip ? <ChartTooltip x={tooltip.x} y={tooltip.y} title={tooltip.title} lines={tooltip.lines} /> : null}
    </div>
  );
}
