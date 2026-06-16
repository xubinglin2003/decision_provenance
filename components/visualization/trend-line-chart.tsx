import { useEffect, useRef, useState } from "react";
import { line, scaleLinear } from "d3";
import { formatNumber } from "@/lib/analytics";
import { ChartTooltip } from "@/components/ui/chart-tooltip";
import type { StateAggregate } from "@/lib/types";

const SERIES_COLORS = ["#2d7be5", "#31a36b", "#f59e0b", "#ef4444"];
const DEFAULT_CHART_WIDTH = 840;
const DEFAULT_CHART_HEIGHT = 360;
const MIN_CHART_WIDTH = 320;
const MIN_CHART_HEIGHT = 280;

export function TrendLineChart({
  items,
  selectedStates,
}: {
  items: StateAggregate[];
  selectedStates: string[];
}) {
  const chartFrameRef = useRef<HTMLDivElement | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    title: string;
    lines: string[];
  } | null>(null);
  const [chartSize, setChartSize] = useState({
    width: DEFAULT_CHART_WIDTH,
    height: DEFAULT_CHART_HEIGHT,
  });
  const padding = { top: 18, right: 26, bottom: 30, left: 48 };
  const series =
    selectedStates.length > 0
      ? items.filter((item) => selectedStates.includes(item.state)).slice(0, 4)
      : items.slice(0, 3);

  useEffect(() => {
    const frame = chartFrameRef.current;

    if (!frame || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateChartSize = () => {
      const nextWidth = Math.max(frame.clientWidth, MIN_CHART_WIDTH);
      const nextHeight = Math.max(frame.clientHeight, MIN_CHART_HEIGHT);

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

  if (series.length === 0) {
    return (
      <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-6 text-sm text-slate-500">
        Select one or more states to view the trend comparison.
      </div>
    );
  }

  const years = series.flatMap((item) => item.trend.map((entry) => entry.year));
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const width = chartSize.width;
  const height = chartSize.height;
  const maxValue = Math.max(
    1,
    ...series.flatMap((item) => item.trend.map((entry) => entry.value)),
  );

  const xScale = scaleLinear()
    .domain([minYear, maxYear])
    .range([padding.left, width - padding.right]);
  const yScale = scaleLinear()
    .domain([0, maxValue])
    .nice(4)
    .range([height - padding.bottom, padding.top]);
  const yTicks = yScale.ticks(4);
  const xTicks = xScale.ticks(Math.max(1, Math.min(6, maxYear - minYear)));

  return (
    <div className="relative flex h-full min-h-[380px] flex-col rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-800">Trend Over Time</h3>
          <p className="text-sm text-slate-500">Compare selected states over the full timeline.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {series.map((item, index) => (
            <span
              key={item.state}
              className="rounded-full px-2 py-1 text-xs font-medium text-slate-700"
              style={{ backgroundColor: `${SERIES_COLORS[index]}20` }}
            >
              {item.state}
            </span>
          ))}
        </div>
      </div>

      <div ref={chartFrameRef} className="min-h-[280px] flex-1">
        <svg viewBox={`0 0 ${width} ${height}`} className="size-full overflow-visible">
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
              <g key={y}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray="4 4"
                />
                <text x={4} y={y + 4} fill="#64748b" fontSize="10">
                  {formatNumber(tick)}
                </text>
              </g>
            );
          })}
          {xTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={xScale(tick)}
                y1={height - padding.bottom}
                x2={xScale(tick)}
                y2={height - padding.bottom + 6}
                stroke="#94a3b8"
              />
              <text x={xScale(tick)} y={height - 8} fill="#64748b" fontSize="10" textAnchor="middle">
                {tick}
              </text>
            </g>
          ))}

          {series.map((item, index) => {
            const path = line<{ year: number; value: number }>()
              .x((entry) => xScale(entry.year))
              .y((entry) => yScale(entry.value))(item.trend);

            return (
              <g key={item.state}>
                <path
                  d={path ?? ""}
                  fill="none"
                  stroke={SERIES_COLORS[index]}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {item.trend.map((entry) => (
                  <circle
                    key={`${item.state}-${entry.year}`}
                    cx={xScale(entry.year)}
                    cy={yScale(entry.value)}
                    r="4"
                    fill={SERIES_COLORS[index]}
                    stroke="white"
                    strokeWidth="1.5"
                    onMouseMove={(event) =>
                      setTooltip({
                        x: event.clientX,
                        y: event.clientY,
                        title: item.state,
                        lines: [`Year: ${entry.year}`, `Metric: ${formatNumber(entry.value)}`],
                      })
                    }
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      {tooltip ? <ChartTooltip x={tooltip.x} y={tooltip.y} title={tooltip.title} lines={tooltip.lines} /> : null}
    </div>
  );
}
