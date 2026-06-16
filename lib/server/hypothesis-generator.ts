import "server-only";

import { deriveHypotheses, getMetricLabel, summarizeSelection } from "@/lib/analytics";
import { loadDatasetRows } from "@/lib/server/dataset-store";
import { getLlmAvailability, requestStructuredJson, type LlmCallMetadata } from "@/lib/server/llm";
import type {
  AnalyticContext,
  ContextSummary,
  CrimeDatum,
  GenerateHypothesesRequest,
  GenerateHypothesesResponse,
  Hypothesis,
  MetricKey,
} from "@/lib/types";

type LlmHypothesisPayload = {
  hypotheses?: Array<{
    text?: unknown;
    score?: unknown;
  }>;
};

export type HypothesisGenerationMetadata = {
  provider?: string;
  model?: string;
  fallbackUsed: boolean;
  latencyMs?: number;
};

export type HypothesisGenerationResult = {
  response: GenerateHypothesesResponse;
  metadata: HypothesisGenerationMetadata;
};

type ContextSnapshot = {
  currentMetric: {
    key: MetricKey;
    label: string;
    activeView: string;
  };
  currentFilters: {
    states: string[];
    years: number[];
    selectedDataCount: number;
    tableSelectionCount: number;
  };
  analyticFocus: {
    scope: string;
    comparisonTarget: string;
    focusReason: string;
  };
  recentInteractionIntent: {
    summary: string;
    recentSteps: string[];
  };
  observedPatternSummary: {
    filteredRowCount: number;
    baselineRowCount: number;
    filteredAverage: number;
    baselineAverage: number;
    averageDeltaPct: number;
    filteredPeak: number;
    trendDirection: "increasing" | "decreasing" | "mixed" | "flat";
    outlierSignal: string;
    topStates: Array<{ state: string; average: number }>;
    bottomStates: Array<{ state: string; average: number }>;
  };
  representativeExamples: Array<{
    state: string;
    year: number;
    metricValue: number;
  }>;
};

function applyContextFilters(rows: CrimeDatum[], context: AnalyticContext) {
  return rows.filter((row) => {
    const stateMatch =
      context.vizState.filters.states.length === 0 || context.vizState.filters.states.includes(row.State);
    const yearMatch =
      context.vizState.filters.years.length === 0 || context.vizState.filters.years.includes(row.Year);
    const selectedMatch =
      context.vizState.selectedDataIds.length === 0 ||
      context.vizState.selectedDataIds.includes(row.id) ||
      context.tableSelection?.includes(row.id);

    return stateMatch && yearMatch && selectedMatch;
  });
}

function buildContextSummary(context: AnalyticContext): ContextSummary {
  return {
    activeView: context.vizState.activeView,
    selectedCount: context.vizState.selectedDataIds.length,
    filtersApplied:
      Number(context.vizState.filters.states.length > 0) +
      Number(context.vizState.filters.years.length > 0),
  };
}

function averageMetric(rows: CrimeDatum[], metric: MetricKey) {
  if (rows.length === 0) {
    return 0;
  }

  return rows.reduce((sum, row) => sum + row[metric], 0) / rows.length;
}

function buildTrendDirection(rows: CrimeDatum[], metric: MetricKey) {
  const byYear = new Map<number, number[]>();

  for (const row of rows) {
    const bucket = byYear.get(row.Year);
    if (bucket) {
      bucket.push(row[metric]);
    } else {
      byYear.set(row.Year, [row[metric]]);
    }
  }

  const ordered = Array.from(byYear.entries())
    .map(([year, values]) => ({
      year,
      average: values.reduce((sum, value) => sum + value, 0) / values.length,
    }))
    .sort((left, right) => left.year - right.year);

  if (ordered.length < 2) {
    return "flat" as const;
  }

  const first = ordered[0]?.average ?? 0;
  const last = ordered[ordered.length - 1]?.average ?? 0;
  const delta = last - first;
  const baseline = Math.max(Math.abs(first), 1);
  const relativeDelta = delta / baseline;

  if (Math.abs(relativeDelta) < 0.05) {
    return "flat" as const;
  }

  const positiveSteps = ordered.slice(1).filter((entry, index) => entry.average >= ordered[index]!.average).length;
  const stepRatio = positiveSteps / (ordered.length - 1);

  if (relativeDelta > 0.05 && stepRatio >= 0.6) {
    return "increasing" as const;
  }

  if (relativeDelta < -0.05 && stepRatio <= 0.4) {
    return "decreasing" as const;
  }

  return "mixed" as const;
}

function buildStateAverages(rows: CrimeDatum[], metric: MetricKey) {
  const stateBuckets = new Map<string, number[]>();

  for (const row of rows) {
    const bucket = stateBuckets.get(row.State);
    if (bucket) {
      bucket.push(row[metric]);
    } else {
      stateBuckets.set(row.State, [row[metric]]);
    }
  }

  return Array.from(stateBuckets.entries())
    .map(([state, values]) => ({
      state,
      average: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)),
    }))
    .sort((left, right) => right.average - left.average);
}

function buildRepresentativeExamples(rows: CrimeDatum[], metric: MetricKey) {
  if (rows.length === 0) {
    return [];
  }

  const sorted = rows.slice().sort((left, right) => right[metric] - left[metric]);
  const middleIndex = Math.floor(sorted.length / 2);
  const candidates = [sorted[0], sorted[middleIndex], sorted[sorted.length - 1]].filter(
    (row): row is CrimeDatum => Boolean(row),
  );

  return Array.from(new Map(candidates.map((row) => [row.id, row])).values()).map((row) => ({
    state: row.State,
    year: row.Year,
    metricValue: Number(row[metric].toFixed(2)),
  }));
}

function summarizeInteractionIntent(context: AnalyticContext) {
  const states = context.vizState.filters.states;
  const years = context.vizState.filters.years;
  const selectedCount = context.vizState.selectedDataIds.length;
  const recentSteps = (context.recentInteractions ?? []).slice(-4).map((interaction) => {
    switch (interaction.type) {
      case "filter":
        return "The analyst narrowed the workspace to a subset worth closer inspection.";
      case "select":
        return "The analyst focused on a specific subset of records or states.";
      case "compare":
        return "The analyst is comparing the current subset against an alternative framing or metric.";
      case "edit":
        return "The analyst adjusted source values, suggesting they are testing how robust the interpretation is.";
      case "manual_add":
        return "The analyst explicitly requested an interpretation at this point in the workflow.";
      default:
        return "The analyst is advancing the current line of inquiry.";
    }
  });

  const summaryParts = [
    states.length > 0
      ? `The analysis is focused on ${states.length === 1 ? states[0] : `${states.length} selected states`}.`
      : "The analysis is still at a broad workspace scope.",
    years.length > 0
      ? `The current time window is limited to ${years.length} selected years.`
      : "The current time window covers the full available range.",
    selectedCount > 0
      ? `A specifically selected subset of ${selectedCount} records is in focus.`
      : "No explicit row-level selection is currently narrowing the focus.",
  ];

  return {
    summary: summaryParts.join(" "),
    recentSteps,
  };
}

function buildOutlierSignal(rows: CrimeDatum[], metric: MetricKey, baselineAverage: number) {
  if (rows.length === 0) {
    return "No clear outlier signal is visible in the current slice.";
  }

  const values = rows.map((row) => row[metric]);
  const peak = Math.max(...values);
  const average = averageMetric(rows, metric);
  const denominator = Math.max(Math.abs(average), Math.abs(baselineAverage), 1);
  const intensity = (peak - average) / denominator;

  if (intensity >= 0.5) {
    return "The current slice includes a noticeably elevated high end relative to its own center.";
  }

  if (intensity <= 0.15) {
    return "The current slice looks relatively even, without a strong outlier dominating the pattern.";
  }

  return "The current slice has some high-end concentration, but not a single dominant spike.";
}

function buildContextSnapshot(
  rows: CrimeDatum[],
  allRows: CrimeDatum[],
  context: AnalyticContext,
): ContextSnapshot {
  const metric = context.vizState.metric;
  const filteredSummary = summarizeSelection(rows, metric);
  const filteredAverage = averageMetric(rows, metric);
  const baselineAverage = averageMetric(allRows, metric);
  const baselineDenominator = Math.max(Math.abs(baselineAverage), 1);
  const stateAverages = buildStateAverages(rows, metric);
  const interactionIntent = summarizeInteractionIntent(context);

  return {
    currentMetric: {
      key: metric,
      label: getMetricLabel(metric),
      activeView: context.vizState.activeView,
    },
    currentFilters: {
      states: context.vizState.filters.states,
      years: context.vizState.filters.years,
      selectedDataCount: context.vizState.selectedDataIds.length,
      tableSelectionCount: context.tableSelection?.length ?? 0,
    },
    analyticFocus: {
      scope:
        context.vizState.filters.states.length > 0
          ? `Focused subset: ${context.vizState.filters.states.join(", ")}`
          : "Broad workspace scan across the available states",
      comparisonTarget:
        rows.length !== allRows.length
          ? "Interpret the filtered subset relative to the broader workspace baseline."
          : "Interpret the current workspace pattern without inventing an external baseline.",
      focusReason:
        context.vizState.selectedDataIds.length > 0 || (context.tableSelection?.length ?? 0) > 0
          ? "The user has made an explicit selection and is likely evaluating whether that subset reflects a meaningful pattern."
          : "The user is exploring the current filtered view and needs plausible interpretive framings.",
    },
    recentInteractionIntent: interactionIntent,
    observedPatternSummary: {
      filteredRowCount: rows.length,
      baselineRowCount: allRows.length,
      filteredAverage: Number(filteredAverage.toFixed(2)),
      baselineAverage: Number(baselineAverage.toFixed(2)),
      averageDeltaPct: Number((((filteredAverage - baselineAverage) / baselineDenominator) * 100).toFixed(1)),
      filteredPeak: Number(filteredSummary.peak.toFixed(2)),
      trendDirection: buildTrendDirection(rows, metric),
      outlierSignal: buildOutlierSignal(rows, metric, baselineAverage),
      topStates: stateAverages.slice(0, 3),
      bottomStates: stateAverages.slice(-3).reverse(),
    },
    representativeExamples: buildRepresentativeExamples(rows, metric),
  };
}

function buildSystemPrompt() {
  return [
    "You are assisting an analytic provenance system.",
    "Return strict JSON only.",
    "Do not include markdown, explanations, or extra keys.",
    'The response must match: {"hypotheses":[{"text":"string","score":0.0}]}',
    "Generate exactly 3 concise, interpretation-oriented hypotheses for an analyst to adopt, reject, or revise.",
    "Each hypothesis must be exactly one sentence.",
    "Each hypothesis must stay within 25 to 35 words.",
    "Prefer explanatory framings such as composition effects, subgroup differences, time-window effects, reporting changes, or context-dependent shifts when supported by the supplied summary.",
    "Do not add explanation paragraphs, follow-up justification, or second sentences.",
    "Do not merely restate averages, peaks, counts, or trend direction.",
    "Do not repeat the context wording, filter labels, or metric summary back to the user.",
    "Do not make strong causal claims or policy recommendations.",
    "Scores must be numbers between 0 and 1.",
  ].join(" ");
}

function buildUserPrompt(snapshot: ContextSnapshot) {
  return JSON.stringify(
    {
      task: "Generate candidate analytic hypotheses from a compact dashboard context.",
      context: snapshot,
      requirements: {
        hypothesesCount: 3,
        textStyle:
          "Concise, tentative, interpretation-oriented, decision-friendly, grounded in the supplied context, and written as one short sentence.",
        preferredStyle: [
          "candidate explanation",
          "analytical framing",
          "possible interpretation of why this subset looks different",
        ],
        avoid: [
          "more than one sentence",
          "more than 35 words",
          "explanation paragraph",
          "repeating the context summary or filter wording",
          "restating raw statistics or trend summaries without interpretation",
          "mentioning unavailable evidence",
          "overly certain causal language",
          "long explanations",
          "policy advice",
          "formatting outside strict JSON",
        ],
      },
    },
    null,
    2,
  );
}

function normalizeScore(score: unknown, fallback: number) {
  const numericScore =
    typeof score === "number"
      ? score
      : typeof score === "string"
        ? Number.parseFloat(score)
        : Number.NaN;

  if (Number.isNaN(numericScore)) {
    return fallback;
  }

  const normalizedScore =
    numericScore > 1
      ? numericScore <= 100
        ? numericScore / 100
        : Number.NaN
      : numericScore;

  if (Number.isNaN(normalizedScore) || normalizedScore <= 0) {
    return fallback;
  }

  return Math.min(1, Math.max(0.5, Number(normalizedScore.toFixed(2))));
}

function trimToSingleSentence(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const match = normalized.match(/^[^.!?]+[.!?]?/);
  return (match?.[0] ?? normalized).trim();
}

function enforceHypothesisLength(text: string) {
  const singleSentence = trimToSingleSentence(text);
  const words = singleSentence.split(/\s+/).filter(Boolean);

  if (words.length <= 35) {
    return singleSentence;
  }

  const shortened = words.slice(0, 35).join(" ").replace(/[,:;]+$/, "");
  return /[.!?]$/.test(shortened) ? shortened : `${shortened}.`;
}

function sortHypothesesByScoreDescending(hypotheses: Hypothesis[]) {
  return [...hypotheses].sort((left, right) => right.score - left.score);
}

function parseLlmHypotheses(payload: unknown): Hypothesis[] {
  const parsed = payload as LlmHypothesisPayload;
  if (!parsed || !Array.isArray(parsed.hypotheses)) {
    throw new Error("LLM payload is missing a hypotheses array.");
  }

  const hypotheses = parsed.hypotheses
    .slice(0, 3)
    .map((item, index) => {
      if (typeof item?.text !== "string" || item.text.trim().length === 0) {
        return null;
      }

      const normalizedText = enforceHypothesisLength(item.text);

      return {
        id: `hyp-llm-${index + 1}`,
        text: normalizedText,
        score: normalizeScore(item.score, 0.6 - index * 0.08),
        source: "llm" as const,
      };
    })
    .filter((item) => item !== null) as Hypothesis[];

  if (hypotheses.length === 0) {
    throw new Error("LLM payload did not contain any valid hypotheses.");
  }

  return sortHypothesesByScoreDescending(hypotheses);
}

function buildHeuristicResponse(
  rows: CrimeDatum[],
  request: GenerateHypothesesRequest,
  metadata: Partial<HypothesisGenerationMetadata> = {},
): HypothesisGenerationResult {
  return {
    response: {
      hypotheses: sortHypothesesByScoreDescending(
        deriveHypotheses(
          rows,
          request.context.vizState.metric,
          request.context.vizState.filters.states,
        ),
      ),
      contextSummary: buildContextSummary(request.context),
    },
    metadata: {
      ...metadata,
      fallbackUsed: true,
    },
  };
}

async function tryGenerateWithLlm(
  snapshot: ContextSnapshot,
): Promise<{ hypotheses: Hypothesis[]; metadata: LlmCallMetadata }> {
  const result = await requestStructuredJson({
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt(snapshot),
  });

  return {
    hypotheses: parseLlmHypotheses(result.content),
    metadata: result.metadata,
  };
}

export async function generateHypothesesFromContext(
  datasetId: string,
  request: GenerateHypothesesRequest,
): Promise<HypothesisGenerationResult> {
  const allRows = await loadDatasetRows(datasetId);
  const filteredRows = applyContextFilters(allRows, request.context);
  const rowsForHypotheses = filteredRows.length > 0 ? filteredRows : allRows;
  const contextSummary = buildContextSummary(request.context);
  const llmAvailability = getLlmAvailability();

  if (!llmAvailability.configured) {
    return buildHeuristicResponse(rowsForHypotheses, request);
  }

  try {
    const snapshot = buildContextSnapshot(rowsForHypotheses, allRows, request.context);
    const llmResult = await tryGenerateWithLlm(snapshot);

    return {
      response: {
        hypotheses: llmResult.hypotheses,
        contextSummary,
      },
      metadata: {
        provider: llmResult.metadata.provider,
        model: llmResult.metadata.model,
        latencyMs: llmResult.metadata.latencyMs,
        fallbackUsed: false,
      },
    };
  } catch {
    return buildHeuristicResponse(rowsForHypotheses, request, {
      provider: llmAvailability.provider,
      model: llmAvailability.model,
    });
  }
}
