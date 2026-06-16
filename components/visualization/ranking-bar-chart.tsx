import { useState } from "react";
import { scaleLinear } from "d3";
import { formatNumber } from "@/lib/analytics";
import { ChartTooltip } from "@/components/ui/chart-tooltip";
import type { StateAggregate } from "@/lib/types";

export function RankingBarChart({
  items,
  selectedStates,
  onSelectState,
  onClearSelection,
}: {
  items: StateAggregate[];
  selectedStates: string[];
  onSelectState: (state: string) => void;
  onClearSelection: () => void;
}) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    title: string;
    lines: string[];
  } | null>(null);
  const topItems = items.slice(0, 8);
  const topValue = Math.max(1, ...topItems.map((item) => item.averageMetric));

  if (topItems.length === 0) {
    return (
      <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-6 text-sm text-slate-500">
        No states match the current filter.
      </div>
    );
  }

  const barScale = scaleLinear().domain([0, topValue]).range([0, 100]);

  return (
    <div
      className="relative flex h-full flex-col rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClearSelection();
        }
      }}
    >
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-800">State Ranking</h3>
        <p className="text-sm text-slate-500">Top states under the active metric.</p>
      </div>

      <div
        className="flex-1 space-y-3"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onClearSelection();
          }
        }}
      >
        {topItems.map((item) => {
          const active = selectedStates.includes(item.state);
          const dimmed = selectedStates.length > 0 && !active;
          return (
            <button
              key={item.state}
              type="button"
              onClick={() => onSelectState(item.state)}
              className="w-full text-left"
              onMouseMove={(event) =>
                setTooltip({
                  x: event.clientX,
                  y: event.clientY,
                  title: item.state,
                  lines: [
                    `Average: ${formatNumber(item.averageMetric)}`,
                    `Peak: ${formatNumber(item.peakMetric)}`,
                    `Region: ${item.region}`,
                  ],
                })
              }
              onMouseLeave={() => setTooltip(null)}
            >
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                <span className={`font-semibold ${active ? "text-slate-900" : ""}`}>{item.state}</span>
                <span>{formatNumber(item.averageMetric)}</span>
              </div>
              <div className="h-3 rounded-full bg-slate-200/80">
                <div
                  className={`h-full rounded-full transition-all ${
                    dimmed ? "bg-slate-300" : "bg-blue-500"
                  }`}
                  style={{ width: `${barScale(item.averageMetric)}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
      {tooltip ? <ChartTooltip x={tooltip.x} y={tooltip.y} title={tooltip.title} lines={tooltip.lines} /> : null}
    </div>
  );
}
