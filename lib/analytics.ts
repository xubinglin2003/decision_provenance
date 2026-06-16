import { STATE_REGION_MAP } from "@/lib/state-positions";
import type {
  CrimeDatum,
  DecisionType,
  Hypothesis,
  MetricKey,
  ScatterPointAggregate,
  StateAggregate,
  TimelineDecision,
  TimelineInteraction,
  TimelineNode,
  VizState,
} from "@/lib/types";

export const METRIC_OPTIONS: Array<{ value: MetricKey; label: string }> = [
  { value: "Data.Rates.Property.All", label: "Property Crime Rate" },
  { value: "Data.Rates.Property.Burglary", label: "Burglary Rate" },
  { value: "Data.Rates.Property.Larceny", label: "Larceny Rate" },
  { value: "Data.Rates.Property.Motor", label: "Motor Vehicle Theft Rate" },
  { value: "Data.Rates.Violent.All", label: "Violent Crime Rate" },
  { value: "Data.Rates.Violent.Assault", label: "Assault Rate" },
  { value: "Data.Rates.Violent.Murder", label: "Murder Rate" },
  { value: "Data.Rates.Violent.Rape", label: "Rape Rate" },
  { value: "Data.Rates.Violent.Robbery", label: "Robbery Rate" },
  { value: "Data.Totals.Property.All", label: "Property Crime Total" },
  { value: "Data.Totals.Property.Burglary", label: "Burglary Total" },
  { value: "Data.Totals.Property.Larceny", label: "Larceny Total" },
  { value: "Data.Totals.Property.Motor", label: "Motor Vehicle Theft Total" },
  { value: "Data.Totals.Violent.All", label: "Violent Crime Total" },
  { value: "Data.Totals.Violent.Assault", label: "Assault Total" },
  { value: "Data.Totals.Violent.Murder", label: "Murder Total" },
  { value: "Data.Totals.Violent.Rape", label: "Rape Total" },
  { value: "Data.Totals.Violent.Robbery", label: "Robbery Total" },
];

export const TABLE_COLUMNS: Array<{ key: keyof CrimeDatum; label: string; editable?: boolean }> = [
  { key: "State", label: "State" },
  { key: "Year", label: "Year" },
  { key: "Data.Population", label: "Population", editable: true },
  { key: "Data.Rates.Violent.All", label: "Violent Rate", editable: true },
  { key: "Data.Rates.Property.All", label: "Property Rate", editable: true },
  { key: "Data.Rates.Violent.Murder", label: "Murder Rate", editable: true },
  { key: "Data.Rates.Property.Burglary", label: "Burglary Rate", editable: true },
];

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 1000 ? 0 : 1,
  }).format(value);
}

export function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function getMetricLabel(metric: MetricKey) {
  return METRIC_OPTIONS.find((option) => option.value === metric)?.label ?? metric;
}

export function summarizeSelection(rows: CrimeDatum[], metric: MetricKey) {
  if (rows.length === 0) {
    return {
      average: 0,
      peak: 0,
      population: 0,
    };
  }

  const metricValues = rows.map((row) => row[metric]);
  return {
    average: metricValues.reduce((sum, value) => sum + value, 0) / rows.length,
    peak: Math.max(...metricValues),
    population: rows.reduce((sum, row) => sum + row["Data.Population"], 0),
  };
}

export function groupByState(rows: CrimeDatum[], metric: MetricKey): StateAggregate[] {
  const grouped = new Map<string, CrimeDatum[]>();

  for (const row of rows) {
    const bucket = grouped.get(row.State);
    if (bucket) {
      bucket.push(row);
    } else {
      grouped.set(row.State, [row]);
    }
  }

  return Array.from(grouped.entries())
    .map(([state, stateRows]) => {
      const values = stateRows.map((row) => row[metric]);
      return {
        state,
        region: STATE_REGION_MAP[state] ?? "Unknown",
        averageMetric: values.reduce((sum, value) => sum + value, 0) / values.length,
        peakMetric: Math.max(...values),
        population: stateRows.reduce((sum, row) => sum + row["Data.Population"], 0),
        records: stateRows.length,
        trend: stateRows
          .map((row) => ({
            year: row.Year,
            value: row[metric],
          }))
          .sort((left, right) => left.year - right.year),
      };
    })
    .sort((left, right) => right.averageMetric - left.averageMetric);
}

export function buildScatterPoints(
  rows: CrimeDatum[],
  xMetric: MetricKey,
  yMetric: MetricKey,
): ScatterPointAggregate[] {
  const grouped = new Map<string, CrimeDatum[]>();

  for (const row of rows) {
    const bucket = grouped.get(row.State);
    if (bucket) {
      bucket.push(row);
    } else {
      grouped.set(row.State, [row]);
    }
  }

  return Array.from(grouped.entries())
    .map(([state, stateRows]) => ({
      state,
      region: STATE_REGION_MAP[state] ?? "Unknown",
      xValue: stateRows.reduce((sum, row) => sum + row[xMetric], 0) / stateRows.length,
      yValue: stateRows.reduce((sum, row) => sum + row[yMetric], 0) / stateRows.length,
      population:
        stateRows.reduce((sum, row) => sum + row["Data.Population"], 0) / stateRows.length,
      records: stateRows.length,
    }))
    .sort((left, right) => left.state.localeCompare(right.state));
}

export function deriveHypotheses(
  rows: CrimeDatum[],
  metric: MetricKey,
  selectedStates: string[],
): Hypothesis[] {
  const focusedRows = selectedStates.length
    ? rows.filter((row) => selectedStates.includes(row.State))
    : rows.slice(0, 40);
  const summary = summarizeSelection(focusedRows, metric);
  const stateLabel = selectedStates.length > 0 ? selectedStates.join(", ") : "the current filtered states";
  const metricLabel = getMetricLabel(metric);

  return [
    {
      id: "hyp-1",
      text: `${stateLabel} shows an elevated ${metricLabel.toLowerCase()} compared with the current workspace average.`,
      score: 0.87,
      source: "heuristic",
    },
    {
      id: "hyp-2",
      text: `The recent points suggest the pattern is driven by a high-volatility period rather than a stable long-term baseline.`,
      score: 0.76,
      source: "heuristic",
    },
    {
      id: "hyp-3",
      text: `Population scale and offense totals may be masking whether this is a rate-specific issue or a broader state-level shift.`,
      score: summary.population > 10_000_000 ? 0.71 : 0.67,
      source: "heuristic",
    },
  ];
}

export function buildDecisionLabel(type: DecisionType, text: string) {
  const prefix = {
    adopt: "Adopt",
    reject: "Reject",
    revise: "Revise",
  }[type];

  return `${prefix}: ${text}`;
}

export function mergeTimeline(
  interactions: TimelineInteraction[],
  decisions: TimelineDecision[],
): TimelineNode[] {
  const interactionNodes: TimelineNode[] = interactions.map((interaction) => ({
    id: interaction.id,
    label: interaction.label,
    timestamp: interaction.timestamp,
    layer: "interaction",
    tone: "neutral",
    description: interaction.type,
  }));

  const decisionNodes: TimelineNode[] = decisions.map((decision) => ({
    id: decision.id,
    label: buildDecisionLabel(
      decision.decisionType,
      decision.revisedHypothesisText ?? decision.hypothesisText,
    ),
    timestamp: decision.timestamp,
    layer: "decision",
    tone: decision.decisionType,
    description: decision.userExplanation ?? "Decision recorded",
    anchorId: decision.triggerInteractionId,
  }));

  return [...interactionNodes, ...decisionNodes].sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  );
}

export function buildVizState(
  metric: MetricKey,
  selectedStates: string[],
  selectedYears: number[],
  selectedRowIds: string[],
): VizState {
  return {
    activeView: "scatter",
    metric,
    filters: {
      states: selectedStates,
      years: selectedYears,
    },
    selectedDataIds: selectedRowIds,
  };
}
