"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEffectEvent } from "react";
import { DecisionModal } from "@/components/decision/decision-modal";
import { DecisionNudge } from "@/components/decision/decision-nudge";
import { DatasetTable } from "@/components/table/dataset-table";
import {
  buildTimelineNodePositionMap,
  CompactProvenanceTimeline,
  ProvenanceTimeline,
} from "@/components/timeline/provenance-timeline";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { Panel } from "@/components/ui/panel";
import { TOOL_BUTTON_STYLE } from "@/components/ui/tool-button-styles";
import { GeoBubbleMap } from "@/components/visualization/geo-bubble-map";
import { RankingBarChart } from "@/components/visualization/ranking-bar-chart";
import { ScatterChart } from "@/components/visualization/scatter-chart";
import { TrendLineChart } from "@/components/visualization/trend-line-chart";
import { useCrimeDataset } from "@/hooks/use-crime-dataset";
import { useProvenance } from "@/hooks/use-provenance";
import { buildScatterPoints, METRIC_OPTIONS, TABLE_COLUMNS, buildVizState, groupByState } from "@/lib/analytics";
import type {
  AnalyticContext,
  CrimeDatum,
  CreateSessionResponse,
  GenerateHypothesesResponse,
  Hypothesis,
  InteractionPayloadValue,
  MetricKey,
  ScatterColorMode,
  TimelineInteraction,
  TimelineInspectionResponse,
  TimelineNode,
} from "@/lib/types";

const DEFAULT_METRIC: MetricKey = "Data.Rates.Violent.All";
const DEFAULT_X_METRIC: MetricKey = "Data.Rates.Property.All";
const DATASET_ID = "state_crime_small";
const DECISION_INSPECTION_STYLES = {
  adopt: {
    badge: "bg-emerald-100 text-emerald-700",
    card: "border-emerald-200 bg-emerald-50/80",
    accent: "text-emerald-700",
    hypothesis: "border-emerald-200 bg-emerald-50/80 ring-1 ring-emerald-200",
  },
  reject: {
    badge: "bg-rose-100 text-rose-700",
    card: "border-rose-200 bg-rose-50/80",
    accent: "text-rose-700",
    hypothesis: "border-rose-200 bg-rose-50/80 ring-1 ring-rose-200",
  },
  revise: {
    badge: "bg-blue-100 text-blue-700",
    card: "border-blue-200 bg-blue-50/80",
    accent: "text-blue-700",
    hypothesis: "border-blue-200 bg-blue-50/80 ring-1 ring-blue-200",
  },
} as const;

const TABLE_COLUMN_LABELS = new Map(TABLE_COLUMNS.map((column) => [column.key, column.label]));
const ANALYSIS_SELECT_CLASS_NAME =
  "min-w-0 flex-1 bg-transparent pr-5 text-[11px] font-extrabold leading-none text-current outline-none";
const ANALYSIS_SELECT_STYLE = { fontSize: "11px", lineHeight: "12px", fontWeight: 800 } as const;
const ANALYSIS_STATUS_CLASS_NAME =
  "inline-flex h-6 shrink-0 items-center px-1 text-[9px] font-extrabold uppercase tracking-[0.16em] leading-none text-slate-500";
const ANALYSIS_CONTROL_CLASS_NAME =
  "inline-flex h-6 shrink-0 items-center rounded-[9px] border border-slate-200 bg-white px-2 text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
const ANALYSIS_AXIS_CONTROL_CLASS_NAME = "w-[18rem] max-w-full justify-between gap-2";
const ANALYSIS_META_CONTROL_CLASS_NAME = "w-[12rem] max-w-full justify-between gap-2";
const AUTO_TRIGGER_COOLDOWN_MS = 12_000;
const AUTO_TRIGGER_DISMISS_COOLDOWN_MS = 18_000;

type DecisionPromptState = {
  source: "manual_add" | "interaction_trigger";
  triggerInteractionId?: string;
  context: AnalyticContext;
};

type TriggerEligibilityReason =
  | "interaction type not eligible"
  | "filter change not strong enough";

type TriggerCheckResult =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "session not ready"
        | "dataset still loading"
        | "modal already open"
        | "hypotheses already loading"
        | "prompt already visible"
        | "in cooldown"
        | "in dismiss silence window";
      remainingMs?: number;
    };

type HypothesisPrefetchState = {
  triggerInteractionId?: string;
  hypotheses: Hypothesis[];
  loading: boolean;
  error: string | null;
};

function normalizeYearsForFilter(selectedYears: number[], allYears: number[]) {
  return selectedYears.length === 0 ? allYears : selectedYears;
}

function normalizeStringSelection(values: string[]) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function areYearsEqual(left: number[], right: number[]) {
  return left.length === right.length && left.every((year, index) => year === right[index]);
}

function areStringsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function debugDecisionTrigger(
  status: "triggered" | "skipped",
  details: {
    type: "filter" | "select" | "compare";
    label: string;
    reason?: string;
    interactionId?: string | null;
    remainingMs?: number;
  },
) {
  const suffix = details.reason
    ? `${details.reason}${details.remainingMs ? ` (${Math.ceil(details.remainingMs / 1000)}s remaining)` : ""}`
    : "prompt opened";

  console.debug(
    `[decision-trigger] ${status}: ${details.type} | ${details.label} | ${suffix}${
      details.interactionId ? ` | ${details.interactionId}` : ""
    }`,
  );
}

export function DecisionWorkspace() {
  const [metric, setMetric] = useState<MetricKey>(DEFAULT_METRIC);
  const [xMetric, setXMetric] = useState<MetricKey>(DEFAULT_X_METRIC);
  const [scatterColorMode, setScatterColorMode] = useState<ScatterColorMode>("region");
  const [workspaceView, setWorkspaceView] = useState<"analysis" | "dataset">("analysis");
  const [allYearsShortcutSelected, setAllYearsShortcutSelected] = useState(true);
  const [isDecisionOpen, setIsDecisionOpen] = useState(false);
  const [inspectedNode, setInspectedNode] = useState<TimelineNode | null>(null);
  const [inspectionDetails, setInspectionDetails] = useState<TimelineInspectionResponse | null>(null);
  const [inspectionLoading, setInspectionLoading] = useState(false);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [decisionHypotheses, setDecisionHypotheses] = useState<Hypothesis[]>([]);
  const [hypothesesLoading, setHypothesesLoading] = useState(false);
  const [hypothesesError, setHypothesesError] = useState<string | null>(null);
  const [decisionPromptState, setDecisionPromptState] = useState<DecisionPromptState | null>(null);
  const [pendingDecisionPrompt, setPendingDecisionPrompt] = useState<DecisionPromptState | null>(null);
  const [hypothesisPrefetch, setHypothesisPrefetch] = useState<HypothesisPrefetchState>({
    triggerInteractionId: undefined,
    hypotheses: [],
    loading: false,
    error: null,
  });
  const hasLoggedLoad = useRef(false);
  const yearFilterOpenSnapshot = useRef<number[] | null>(null);
  const tableStateFilterOpenSnapshot = useRef<string[] | null>(null);
  const tableYearFilterOpenSnapshot = useRef<number[] | null>(null);
  const manualAddButtonRef = useRef<HTMLButtonElement | null>(null);
  const timelineSectionRef = useRef<HTMLElement | null>(null);
  const lastAutoTriggerAt = useRef(0);
  const lastAutoDismissAt = useRef(0);
  const [manualAddDockVisible, setManualAddDockVisible] = useState(false);
  const [timelineDockVisible, setTimelineDockVisible] = useState(false);
  const [timelineScrollTargetId, setTimelineScrollTargetId] = useState<string | null>(null);

  const dataset = useCrimeDataset(metric, DATASET_ID);
  const provenance = useProvenance(sessionId);

  const vizState = useMemo(
    () => buildVizState(metric, dataset.selectedStates, dataset.selectedYears, dataset.selectedRowIds),
    [dataset.selectedRowIds, dataset.selectedStates, dataset.selectedYears, metric],
  );

  const stateAggregates = useMemo(
    () => groupByState(dataset.filteredRows, metric),
    [dataset.filteredRows, metric],
  );

  const scatterRows = useMemo(() => {
    return dataset.rows.filter((row) => {
      return dataset.selectedYears.length === 0 || dataset.selectedYears.includes(row.Year);
    });
  }, [dataset.rows, dataset.selectedYears]);

  const scatterPoints = useMemo(
    () => buildScatterPoints(scatterRows, xMetric, metric),
    [metric, scatterRows, xMetric],
  );

  const requestHypotheses = useCallback(async (promptState: DecisionPromptState) => {
    if (!sessionId) {
      throw new Error("No active session is available for hypothesis generation.");
    }

    const response = await fetch(`/api/sessions/${sessionId}/hypotheses/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: promptState.source,
        triggerInteractionId: promptState.triggerInteractionId,
        context: promptState.context,
      }),
    });

    if (!response.ok) {
      throw new Error("Unable to generate candidate hypotheses.");
    }

    return (await response.json()) as GenerateHypothesesResponse;
  }, [sessionId]);

  useEffect(() => {
    let isMounted = true;

    async function createSession() {
      try {
        setSessionError(null);
        const response = await fetch("/api/sessions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            datasetId: DATASET_ID,
          }),
        });

        if (!response.ok) {
          throw new Error("Unable to create session.");
        }

        const payload = (await response.json()) as CreateSessionResponse;
        if (isMounted) {
          setSessionId(payload.sessionId);
        }
      } catch {
        if (isMounted) {
          setSessionError("Unable to create analysis session.");
        }
      }
    }

    void createSession();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isDecisionOpen || !sessionId || !decisionPromptState) {
      return;
    }

    const promptState = decisionPromptState;
    const isInteractionTrigger = decisionPromptState.source === "interaction_trigger";
    const hasMatchingPrefetch =
      isInteractionTrigger &&
      decisionPromptState.triggerInteractionId &&
      hypothesisPrefetch.triggerInteractionId === decisionPromptState.triggerInteractionId;

    if (hasMatchingPrefetch && hypothesisPrefetch.hypotheses.length > 0) {
      setDecisionHypotheses(hypothesisPrefetch.hypotheses);
      setHypothesesError(null);
      setHypothesesLoading(false);
      return;
    }

    if (hasMatchingPrefetch && hypothesisPrefetch.loading) {
      setDecisionHypotheses([]);
      setHypothesesError(null);
      setHypothesesLoading(true);
      return;
    }

    let isMounted = true;

    async function loadHypotheses() {
      try {
        setHypothesesLoading(true);
        setHypothesesError(null);

        const payload = await requestHypotheses(promptState);
        if (isMounted) {
          setDecisionHypotheses(payload.hypotheses);
        }
      } catch {
        if (isMounted) {
          setDecisionHypotheses([]);
          setHypothesesError("Unable to generate candidate hypotheses from the API.");
        }
      } finally {
        if (isMounted) {
          setHypothesesLoading(false);
        }
      }
    }

    void loadHypotheses();

    return () => {
      isMounted = false;
    };
  }, [
    decisionPromptState,
    hypothesisPrefetch,
    isDecisionOpen,
    requestHypotheses,
    sessionId,
  ]);

  const logLoad = useEffectEvent(() => {
    if (!sessionId) {
      return;
    }

    void provenance.recordInteraction("load_data", "Load dataset", vizState, {
      sessionId,
      rows: dataset.rows.length,
    });
  });

  useEffect(() => {
    if (sessionId && !dataset.loading && dataset.rows.length > 0 && !hasLoggedLoad.current) {
      hasLoggedLoad.current = true;
      logLoad();
    }
  }, [dataset.loading, dataset.rows.length, sessionId]);

  useEffect(() => {
    const manualAddButton = manualAddButtonRef.current;

    if (!manualAddButton || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setManualAddDockVisible(!entry.isIntersecting);
      },
      {
        root: null,
        rootMargin: "-12px 0px 0px 0px",
        threshold: 1,
      },
    );

    observer.observe(manualAddButton);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const timelineSection = timelineSectionRef.current;

    if (!timelineSection || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setTimelineDockVisible(!entry.isIntersecting);
      },
      {
        root: null,
        rootMargin: "-72px 0px -72px 0px",
        threshold: 0,
      },
    );

    observer.observe(timelineSection);

    return () => {
      observer.disconnect();
    };
  }, []);

  function toggleState(state: string) {
    const next = dataset.selectedStates.includes(state)
      ? dataset.selectedStates.filter((item) => item !== state)
      : [...dataset.selectedStates, state];

    dataset.setSelectedStates(next);
    void recordInteractionAndMaybeTrigger(
      "filter",
      `Filter: State = ${next.join(", ") || "All"}`,
      buildVizState(metric, next, dataset.selectedYears, dataset.selectedRowIds),
      {
        states: next,
      },
      {
        autoTriggerEligible: next.length > 0 && next.length <= 5,
        ineligibleReason: "filter change not strong enough",
      },
    );
  }

  function toggleYear(year: number) {
    const allYears = dataset.allYears;
    const currentYears = allYearsShortcutSelected ? allYears : dataset.selectedYears;
    const nextYears = currentYears.includes(year)
      ? currentYears.filter((item) => item !== year)
      : [...currentYears, year].sort((left, right) => left - right);
    const next = nextYears;

    setAllYearsShortcutSelected(next.length === allYears.length);
    dataset.setSelectedYears(next);
  }

  function toggleAllYears() {
    const nextShortcutSelected = !allYearsShortcutSelected;
    const nextYears = nextShortcutSelected ? dataset.allYears : [];

    setAllYearsShortcutSelected(nextShortcutSelected);
    dataset.setSelectedYears(nextYears);
  }

  function handleYearFilterOpenChange(open: boolean) {
    if (open) {
      yearFilterOpenSnapshot.current = normalizeYearsForFilter(dataset.selectedYears, dataset.allYears);
      return;
    }

    const startYears = yearFilterOpenSnapshot.current;
    yearFilterOpenSnapshot.current = null;

    if (!startYears) {
      return;
    }

    const endYears = normalizeYearsForFilter(dataset.selectedYears, dataset.allYears);

    if (areYearsEqual(startYears, endYears)) {
      return;
    }

    void recordInteractionAndMaybeTrigger(
      "filter",
      `Filter: Year = ${endYears.length === dataset.allYears.length ? "All" : endYears.join(", ")}`,
      buildVizState(metric, dataset.selectedStates, dataset.selectedYears, dataset.selectedRowIds),
      {
        years: dataset.selectedYears,
      },
      {
        autoTriggerEligible:
          endYears.length > 0 &&
          endYears.length < dataset.allYears.length &&
          dataset.allYears.length - endYears.length >= 2,
        ineligibleReason: "filter change not strong enough",
      },
    );
  }

  function handleMetricChange(nextMetric: MetricKey) {
    setMetric(nextMetric);
    void recordInteractionAndMaybeTrigger(
      "compare",
      `Compare metric: ${nextMetric}`,
      buildVizState(nextMetric, dataset.selectedStates, dataset.selectedYears, dataset.selectedRowIds),
      {
        metric: nextMetric,
      },
      {
        autoTriggerEligible: true,
        ineligibleReason: "interaction type not eligible",
      },
    );
  }

  function handleXMetricChange(nextMetric: MetricKey) {
    setXMetric(nextMetric);
    void recordInteractionAndMaybeTrigger(
      "compare",
      `Compare x-axis metric: ${nextMetric}`,
      buildVizState(metric, dataset.selectedStates, dataset.selectedYears, dataset.selectedRowIds),
      {
        xMetric: nextMetric,
      },
      {
        autoTriggerEligible: true,
        ineligibleReason: "interaction type not eligible",
      },
    );
  }

  function handleSelectRow(rowId: string, state: string) {
    const nextStates = dataset.selectedStates.includes(state)
      ? dataset.selectedStates
      : [...dataset.selectedStates, state];

    dataset.setSelectedRowIds([rowId]);
    dataset.setSelectedStates(nextStates);
    void provenance.recordInteraction(
      "select",
      `Select row: ${state}`,
      buildVizState(metric, nextStates, dataset.selectedYears, [rowId]),
      {
        rowId,
        state,
      },
    );
  }

  function clearSelection() {
    if (dataset.selectedStates.length === 0 && dataset.selectedRowIds.length === 0) {
      return;
    }

    dataset.setSelectedStates([]);
    dataset.setSelectedRowIds([]);
    void provenance.recordInteraction("select", "Clear selection", buildVizState(metric, [], dataset.selectedYears, []), {});
  }

  function handleBrushSelection(states: string[]) {
    if (states.length === 0) {
      clearSelection();
      return;
    }

    const nextStates = Array.from(new Set(states));
    const nextRowIds = scatterRows
      .filter((row) => nextStates.includes(row.State))
      .map((row) => row.id);

    dataset.setSelectedStates(nextStates);
    dataset.setSelectedRowIds(nextRowIds);
    void recordInteractionAndMaybeTrigger(
      "select",
      `Brush select: ${nextStates.length} states`,
      buildVizState(metric, nextStates, dataset.selectedYears, nextRowIds),
      {
        states: nextStates,
        rows: nextRowIds.slice(0, 20),
      },
      {
        autoTriggerEligible: nextStates.length >= 1,
        ineligibleReason: "interaction type not eligible",
      },
    );
  }

  function buildTableInteractionPayload(
    overrides: Record<string, InteractionPayloadValue> = {},
  ): Record<string, InteractionPayloadValue> {
    return {
      workspaceView: "dataset",
      tableFilteredStates: dataset.tableFilteredStates,
      tableFilteredYears: dataset.tableFilteredYears,
      tableSelectedRows: dataset.tableSelectedRowIds.slice(0, 50),
      tableSelectedColumns: dataset.tableSelectedColumnKeys.map(String),
      hiddenRowCount: dataset.hiddenTableRowIds.length,
      hiddenColumnCount: dataset.hiddenTableColumnKeys.length,
      tableSort:
        dataset.tableSortConfig ? `${String(dataset.tableSortConfig.key)}:${dataset.tableSortConfig.direction}` : null,
      ...overrides,
    };
  }

  function recordTableInteraction(
    type: "filter" | "select" | "compare",
    label: string,
    overrides: Record<string, InteractionPayloadValue> = {},
  ) {
    void provenance.recordInteraction(type, label, vizState, buildTableInteractionPayload(overrides));
  }

  async function recordTableInteractionAndMaybeTrigger(
    type: "filter" | "select" | "compare",
    label: string,
    overrides: Record<string, InteractionPayloadValue> = {},
    options?: { autoTriggerEligible?: boolean; ineligibleReason?: TriggerEligibilityReason },
    tableSelection = dataset.tableSelectedRowIds,
  ) {
    const interactionPayload = buildTableInteractionPayload(overrides);
    const interactionId = await provenance.recordInteraction(type, label, vizState, interactionPayload);

    if (!options?.autoTriggerEligible) {
      debugDecisionTrigger("skipped", {
        type,
        label,
        interactionId,
        reason: options?.ineligibleReason ?? "interaction type not eligible",
      });
      return interactionId;
    }

    const triggerCheck = shouldAutoTriggerDecisionPrompt();
    if (!triggerCheck.allowed) {
      debugDecisionTrigger("skipped", {
        type,
        label,
        interactionId,
        reason: triggerCheck.reason,
        remainingMs: triggerCheck.remainingMs,
      });
      return interactionId;
    }

    lastAutoTriggerAt.current = Date.now();
    showDecisionNudge({
      source: "interaction_trigger",
      triggerInteractionId: interactionId ?? undefined,
      context: buildDecisionContext(vizState, tableSelection, {
        id: interactionId ?? `pending-${Date.now()}`,
        type,
        label,
        timestamp: new Date().toISOString(),
        payload: interactionPayload,
        vizState,
      }),
    });
    debugDecisionTrigger("triggered", {
      type,
      label,
      interactionId,
    });

    return interactionId;
  }

  function handleToggleTableStateFilter(state: string) {
    dataset.toggleTableStateFilter(state);
  }

  function handleToggleTableYearFilter(year: number) {
    dataset.toggleTableYearFilter(year);
  }

  function handleTableStateFilterOpenChange(open: boolean) {
    if (open) {
      tableStateFilterOpenSnapshot.current = normalizeStringSelection(dataset.tableFilteredStates);
      return;
    }

    const startStates = tableStateFilterOpenSnapshot.current;
    tableStateFilterOpenSnapshot.current = null;

    if (!startStates) {
      return;
    }

    const endStates = normalizeStringSelection(dataset.tableFilteredStates);
    if (areStringsEqual(startStates, endStates)) {
      return;
    }

    void recordTableInteractionAndMaybeTrigger(
      "filter",
      `Table filter: State = ${endStates.join(", ") || "All"}`,
      {
        tableFilteredStates: endStates,
        tableFilteredYears: dataset.tableFilteredYears,
        filterField: "State",
      },
      {
        autoTriggerEligible: endStates.length > 0 && endStates.length <= 5,
        ineligibleReason: "filter change not strong enough",
      },
    );
  }

  function handleTableYearFilterOpenChange(open: boolean) {
    if (open) {
      tableYearFilterOpenSnapshot.current = normalizeYearsForFilter(
        dataset.tableFilteredYears,
        dataset.allYears,
      );
      return;
    }

    const startYears = tableYearFilterOpenSnapshot.current;
    tableYearFilterOpenSnapshot.current = null;

    if (!startYears) {
      return;
    }

    const endYears = normalizeYearsForFilter(dataset.tableFilteredYears, dataset.allYears);
    if (areYearsEqual(startYears, endYears)) {
      return;
    }

    void recordTableInteractionAndMaybeTrigger(
      "filter",
      `Table filter: Year = ${endYears.join(", ") || "All"}`,
      {
        tableFilteredStates: dataset.tableFilteredStates,
        tableFilteredYears: dataset.tableFilteredYears,
        filterField: "Year",
      },
      {
        autoTriggerEligible:
          endYears.length > 0 &&
          endYears.length < dataset.allYears.length &&
          dataset.allYears.length - endYears.length >= 2,
        ineligibleReason: "filter change not strong enough",
      },
    );
  }

  function handleClearTableValueFilters() {
    if (dataset.tableFilteredStates.length === 0 && dataset.tableFilteredYears.length === 0) {
      return;
    }

    dataset.clearTableValueFilters();
    recordTableInteraction("filter", "Table filter: Clear state and year filters", {
      tableFilteredStates: [],
      tableFilteredYears: [],
    });
  }

  function handleToggleTableRowSelection(rowId: string) {
    const nextRowIds = dataset.tableSelectedRowIds.includes(rowId)
      ? dataset.tableSelectedRowIds.filter((item) => item !== rowId)
      : [...dataset.tableSelectedRowIds, rowId];

    dataset.toggleTableRowSelection(rowId);
    recordTableInteraction("select", `Table select: ${nextRowIds.length} row${nextRowIds.length === 1 ? "" : "s"}`, {
      tableSelectedRows: nextRowIds.slice(0, 50),
      selectedCount: nextRowIds.length,
    });
  }

  function handleToggleAllVisibleTableRows() {
    const visibleRowIds = dataset.tableRows.map((row) => row.id);

    if (visibleRowIds.length === 0) {
      return;
    }

    const allVisibleSelected =
      visibleRowIds.length > 0 && visibleRowIds.every((rowId) => dataset.tableSelectedRowIds.includes(rowId));
    const nextRowIds = allVisibleSelected
      ? dataset.tableSelectedRowIds.filter((rowId) => !visibleRowIds.includes(rowId))
      : Array.from(new Set([...dataset.tableSelectedRowIds, ...visibleRowIds]));

    dataset.toggleAllVisibleTableRows();
    recordTableInteraction(
      "select",
      allVisibleSelected ? "Table select: Clear visible rows" : `Table select: ${visibleRowIds.length} visible rows`,
      {
        tableSelectedRows: nextRowIds.slice(0, 50),
        selectedCount: nextRowIds.length,
      },
    );
  }

  function handleToggleTableColumnSelection(columnKey: keyof CrimeDatum) {
    const nextColumnKeys = dataset.tableSelectedColumnKeys.includes(columnKey)
      ? dataset.tableSelectedColumnKeys.filter((item) => item !== columnKey)
      : [...dataset.tableSelectedColumnKeys, columnKey];

    dataset.toggleTableColumnSelection(columnKey);
    recordTableInteraction(
      "select",
      `Table select: ${nextColumnKeys.length} column${nextColumnKeys.length === 1 ? "" : "s"}`,
      {
        tableSelectedColumns: nextColumnKeys.map(String),
        selectedCount: nextColumnKeys.length,
      },
    );
  }

  function handleHideSelectedRows() {
    if (dataset.tableSelectedRowIds.length === 0) {
      return;
    }

    const hiddenCount = dataset.tableSelectedRowIds.length;
    dataset.hideSelectedTableRows();
    void recordTableInteractionAndMaybeTrigger(
      "filter",
      `Table view: Hide ${hiddenCount} selected rows`,
      {
        tableSelectedRows: [],
        hiddenRowCount: dataset.hiddenTableRowIds.length + hiddenCount,
        rowFilterMode: "all",
      },
      {
        autoTriggerEligible: true,
        ineligibleReason: "interaction type not eligible",
      },
      [],
    );
  }

  function handleShowOnlySelectedRows() {
    if (dataset.tableSelectedRowIds.length === 0) {
      return;
    }

    dataset.showOnlySelectedTableRows();
    void recordTableInteractionAndMaybeTrigger(
      "filter",
      `Table view: Only ${dataset.tableSelectedRowIds.length} selected rows`,
      {
        tableSelectedRows: dataset.tableSelectedRowIds.slice(0, 50),
        rowFilterMode: "selected",
      },
      {
        autoTriggerEligible: true,
        ineligibleReason: "interaction type not eligible",
      },
      dataset.tableSelectedRowIds,
    );
  }

  function handleClearTableRowFilter() {
    if (dataset.tableRowFilterMode === "all") {
      return;
    }

    dataset.clearTableRowFilter();
    recordTableInteraction("filter", "Table view: Show all rows", {
      rowFilterMode: "all",
    });
  }

  function handleHideSelectedColumns() {
    const visibleColumnKeySet = new Set(dataset.tableColumns.map((column) => column.key));
    const columnKeysToHide = dataset.tableSelectedColumnKeys.filter((columnKey) => visibleColumnKeySet.has(columnKey));

    if (columnKeysToHide.length === 0 || columnKeysToHide.length === dataset.tableColumns.length) {
      return;
    }

    dataset.hideSelectedTableColumns();
    void recordTableInteractionAndMaybeTrigger(
      "filter",
      `Table view: Hide ${columnKeysToHide.length} selected columns`,
      {
        tableSelectedColumns: dataset.tableSelectedColumnKeys
          .filter((columnKey) => !columnKeysToHide.includes(columnKey))
          .map(String),
        hiddenColumnCount: dataset.hiddenTableColumnKeys.length + columnKeysToHide.length,
        columnFilterMode: "all",
      },
      {
        autoTriggerEligible: true,
        ineligibleReason: "interaction type not eligible",
      },
    );
  }

  function handleShowOnlySelectedColumns() {
    if (dataset.tableSelectedColumnKeys.length === 0) {
      return;
    }

    dataset.showOnlySelectedTableColumns();
    void recordTableInteractionAndMaybeTrigger(
      "filter",
      `Table view: Only ${dataset.tableSelectedColumnKeys.length} selected columns`,
      {
        tableSelectedColumns: dataset.tableSelectedColumnKeys.map(String),
        columnFilterMode: "selected",
      },
      {
        autoTriggerEligible: true,
        ineligibleReason: "interaction type not eligible",
      },
    );
  }

  function handleClearTableColumnFilter() {
    if (dataset.tableColumnFilterMode === "all") {
      return;
    }

    dataset.clearTableColumnFilter();
    recordTableInteraction("filter", "Table view: Show all columns", {
      columnFilterMode: "all",
    });
  }

  function handleSortSelectedColumn(direction: "asc" | "desc") {
    const columnKey = dataset.tableSelectedColumnKeys[dataset.tableSelectedColumnKeys.length - 1];

    if (!columnKey) {
      return;
    }

    const columnLabel = TABLE_COLUMN_LABELS.get(columnKey) ?? String(columnKey);

    dataset.setTableSort(columnKey, direction);
    void recordTableInteractionAndMaybeTrigger(
      "compare",
      `Table sort: ${columnLabel} ${direction}`,
      {
        tableSort: `${String(columnKey)}:${direction}`,
        sortColumn: String(columnKey),
        sortDirection: direction,
      },
      {
        autoTriggerEligible: true,
        ineligibleReason: "interaction type not eligible",
      },
    );
  }

  function handleClearTableSort() {
    if (!dataset.tableSortConfig) {
      return;
    }

    dataset.clearTableSort();
    recordTableInteraction("compare", "Table sort: Clear sort", {
      tableSort: null,
      sortColumn: null,
      sortDirection: null,
    });
  }

  function handleResetTableView() {
    const hadActiveTableState =
      dataset.tableFilteredStates.length > 0 ||
      dataset.tableFilteredYears.length > 0 ||
      dataset.tableSelectedRowIds.length > 0 ||
      dataset.tableSelectedColumnKeys.length > 0 ||
      dataset.hiddenTableRowIds.length > 0 ||
      dataset.hiddenTableColumnKeys.length > 0 ||
      dataset.tableRowFilterMode !== "all" ||
      dataset.tableColumnFilterMode !== "all" ||
      dataset.tableSortConfig !== null;

    if (!hadActiveTableState) {
      return;
    }

    dataset.resetTableView();
    recordTableInteraction("filter", "Table view: Reset table actions", {
      tableFilteredStates: [],
      tableFilteredYears: [],
      tableSelectedRows: [],
      tableSelectedColumns: [],
      hiddenRowCount: 0,
      hiddenColumnCount: 0,
      tableSort: null,
      rowFilterMode: "all",
      columnFilterMode: "all",
    });
  }

  function buildDecisionContext(
    nextVizState: typeof vizState,
    tableSelection: string[],
    recentInteraction?: TimelineInteraction,
  ): AnalyticContext {
    const recentInteractions = recentInteraction
      ? [...provenance.interactions.slice(-4), recentInteraction]
      : provenance.interactions.slice(-5);

    return {
      vizState: nextVizState,
      tableSelection,
      recentInteractions: recentInteractions.slice(-5),
    };
  }

  async function startHypothesisPrefetch(promptState: DecisionPromptState) {
    if (
      promptState.source !== "interaction_trigger" ||
      !sessionId ||
      !promptState.triggerInteractionId
    ) {
      return;
    }

    if (
      hypothesisPrefetch.triggerInteractionId === promptState.triggerInteractionId &&
      (hypothesisPrefetch.loading || hypothesisPrefetch.hypotheses.length > 0)
    ) {
      console.debug(
        `[decision-trigger] prefetch skipped: already ${
          hypothesisPrefetch.loading ? "loading" : "loaded"
        } for ${promptState.triggerInteractionId}`,
      );
      return;
    }

    setHypothesisPrefetch({
      triggerInteractionId: promptState.triggerInteractionId,
      hypotheses: [],
      loading: true,
      error: null,
    });

    console.debug(`[decision-trigger] prefetch started: ${promptState.triggerInteractionId}`);

    try {
      const payload = await requestHypotheses(promptState);
      setHypothesisPrefetch({
        triggerInteractionId: promptState.triggerInteractionId,
        hypotheses: payload.hypotheses,
        loading: false,
        error: null,
      });
      console.debug(`[decision-trigger] prefetch resolved: ${promptState.triggerInteractionId}`);
    } catch {
      setHypothesisPrefetch({
        triggerInteractionId: promptState.triggerInteractionId,
        hypotheses: [],
        loading: false,
        error: "Unable to prefetch candidate hypotheses from the API.",
      });
      console.debug(`[decision-trigger] prefetch failed: ${promptState.triggerInteractionId}`);
    }
  }

  async function handleSaveDecision(payload: {
    decisionType: "adopt" | "reject" | "revise";
    hypothesisId?: string;
    hypothesisText: string;
    revisedHypothesisText?: string;
    userExplanation?: string;
  }) {
    await provenance.recordDecision({
      ...payload,
      source: decisionPromptState?.source ?? "manual_add",
      triggerInteractionId: decisionPromptState?.triggerInteractionId,
      context: decisionPromptState?.context ?? buildDecisionContext(vizState, dataset.selectedRowIds),
    });

    setDecisionPromptState(null);
    setIsDecisionOpen(false);
  }

  async function handleInspectNode(node: TimelineNode) {
    setInspectedNode(node);
    setInspectionDetails(null);
    setInspectionError(null);

    if (!sessionId) {
      setInspectionError("No active session is available for timeline inspection.");
      return;
    }

    try {
      setInspectionLoading(true);
      const response = await fetch(`/api/sessions/${sessionId}/timeline/${node.id}`);
      if (!response.ok) {
        throw new Error("Unable to load timeline inspection details.");
      }

      const payload = (await response.json()) as TimelineInspectionResponse;
      setInspectionDetails(payload);
    } catch {
      setInspectionError("Unable to load timeline inspection details from the API.");
    } finally {
      setInspectionLoading(false);
    }
  }

  function closeInspectionPanel() {
    setInspectedNode(null);
    setInspectionDetails(null);
    setInspectionError(null);
    setInspectionLoading(false);
  }

  function shouldAutoTriggerDecisionPrompt(): TriggerCheckResult {
    if (!sessionId) {
      return { allowed: false, reason: "session not ready" };
    }

    if (dataset.loading) {
      return { allowed: false, reason: "dataset still loading" };
    }

    if (isDecisionOpen) {
      return { allowed: false, reason: "modal already open" };
    }

    if (hypothesesLoading) {
      return { allowed: false, reason: "hypotheses already loading" };
    }

    if (pendingDecisionPrompt) {
      return { allowed: false, reason: "prompt already visible" };
    }

    const now = Date.now();
    const triggerRemaining = AUTO_TRIGGER_COOLDOWN_MS - (now - lastAutoTriggerAt.current);
    if (triggerRemaining > 0) {
      return { allowed: false, reason: "in cooldown", remainingMs: triggerRemaining };
    }

    const dismissRemaining = AUTO_TRIGGER_DISMISS_COOLDOWN_MS - (now - lastAutoDismissAt.current);
    if (dismissRemaining > 0) {
      return { allowed: false, reason: "in dismiss silence window", remainingMs: dismissRemaining };
    }

    return { allowed: true };
  }

  function openDecisionPrompt(promptState: DecisionPromptState) {
    setDecisionHypotheses([]);
    setHypothesesError(null);
    setPendingDecisionPrompt(null);
    setDecisionPromptState(promptState);
    setIsDecisionOpen(true);
  }

  function showDecisionNudge(promptState: DecisionPromptState) {
    setPendingDecisionPrompt(promptState);
    void startHypothesisPrefetch(promptState);
  }

  function dismissDecisionNudge() {
    lastAutoDismissAt.current = Date.now();
    console.debug("[decision-trigger] dismissed: interaction-trigger prompt postponed");
    setPendingDecisionPrompt(null);
  }

  async function recordInteractionAndMaybeTrigger(
    type: "filter" | "select" | "compare",
    label: string,
    nextVizState: typeof vizState,
    payload?: Record<string, InteractionPayloadValue>,
    options?: { autoTriggerEligible?: boolean; ineligibleReason?: TriggerEligibilityReason },
  ) {
    const interactionId = await provenance.recordInteraction(type, label, nextVizState, payload);

    if (!options?.autoTriggerEligible) {
      debugDecisionTrigger("skipped", {
        type,
        label,
        interactionId,
        reason: options?.ineligibleReason ?? "interaction type not eligible",
      });
      return interactionId;
    }

    const triggerCheck = shouldAutoTriggerDecisionPrompt();
    if (!triggerCheck.allowed) {
      debugDecisionTrigger("skipped", {
        type,
        label,
        interactionId,
        reason: triggerCheck.reason,
        remainingMs: triggerCheck.remainingMs,
      });
      return interactionId;
    }

    lastAutoTriggerAt.current = Date.now();
    showDecisionNudge({
      source: "interaction_trigger",
      triggerInteractionId: interactionId ?? undefined,
      context: buildDecisionContext(nextVizState, nextVizState.selectedDataIds, {
        id: interactionId ?? `pending-${Date.now()}`,
        type,
        label,
        timestamp: new Date().toISOString(),
        payload,
        vizState: nextVizState,
      }),
    });
    debugDecisionTrigger("triggered", {
      type,
      label,
      interactionId,
    });

    return interactionId;
  }

  function openManualAdd() {
    void (async () => {
      const interactionId = await provenance.recordInteraction(
        "manual_add",
        "Manual Add",
        vizState,
        {
          metric,
          selectedStates: dataset.selectedStates,
        },
      );
      openDecisionPrompt({
        source: "manual_add",
        triggerInteractionId: interactionId ?? undefined,
        context: buildDecisionContext(vizState, dataset.selectedRowIds, {
          id: interactionId ?? `manual-${Date.now()}`,
          type: "manual_add",
          label: "Manual Add",
          timestamp: new Date().toISOString(),
          payload: {
            metric,
            selectedStates: dataset.selectedStates,
          },
          vizState,
        }),
      });
    })();
  }

  function scrollToTimeline() {
    setTimelineDockVisible(false);
    timelineSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  const timelineNodePositions = useMemo(
    () => buildTimelineNodePositionMap(provenance.interactions, provenance.decisions),
    [provenance.decisions, provenance.interactions],
  );

  const compactTimelineNodes = useMemo(() => {
    const timelineNodes = [
      ...provenance.interactions.map((interaction) => ({
        id: interaction.id,
        label: interaction.label,
        timestamp: interaction.timestamp,
        layer: "interaction" as const,
        tone: "neutral" as const,
        description: interaction.type,
      })),
      ...provenance.decisions.map((decision) => ({
        id: decision.id,
        label: decision.revisedHypothesisText ?? decision.hypothesisText,
        timestamp: decision.timestamp,
        layer: "decision" as const,
        tone: decision.decisionType,
        description: decision.userExplanation ?? "Decision recorded",
        anchorId: decision.triggerInteractionId,
      })),
    ].sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());

    return new Map(
      timelineNodes.map((node) => [
        node.id,
        {
          ...node,
          inspectPosition: timelineNodePositions.get(node.id) ?? 0.5,
        },
      ]),
    );
  }, [provenance.decisions, provenance.interactions, timelineNodePositions]);

  function handleCompactTimelineSelect(nodeId: string) {
    const node = compactTimelineNodes.get(nodeId);

    scrollToTimeline();
    setTimelineScrollTargetId(nodeId);

    if (node) {
      void handleInspectNode(node);
    }
  }

  const selectedDecisionType = inspectionDetails?.finalDecision?.decisionType;
  const selectedDecisionStyles = selectedDecisionType
    ? DECISION_INSPECTION_STYLES[selectedDecisionType]
    : null;
  const timelineInspectionContent = inspectedNode ? (
    <div className="w-full rounded-[24px]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
              selectedDecisionStyles?.badge ?? "bg-slate-100 text-slate-600"
            }`}
          >
            Inspection
          </span>
          <p className="text-xs text-slate-500">
            Review the selected interpretation and supporting context.
          </p>
        </div>
        <button
          type="button"
          onClick={closeInspectionPanel}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500"
        >
          Close
        </button>
      </div>

      {inspectionLoading ? (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
          Loading inspection details...
        </div>
      ) : null}

      {!inspectionLoading && inspectionError ? (
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
          {inspectionError}
        </div>
      ) : null}

      {!inspectionLoading && !inspectionError ? (
        <div className="mt-3 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            {inspectionDetails?.candidateHypotheses?.length ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Interpretation Options
                </p>
                <div className="mt-3 space-y-2">
                  {inspectionDetails.candidateHypotheses.map((hypothesis) => {
                    const isSelected =
                      hypothesis.id === inspectionDetails.finalDecision?.hypothesisId ||
                      hypothesis.text === inspectionDetails.finalDecision?.hypothesisText ||
                      hypothesis.text === inspectionDetails.finalDecision?.revisedHypothesisText;

                    return (
                      <div
                        key={hypothesis.id}
                        className={`rounded-xl border px-3 py-2 text-xs text-slate-700 ${
                          isSelected
                            ? (selectedDecisionStyles?.hypothesis ?? "border-slate-300 bg-slate-100")
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span>{hypothesis.text}</span>
                          {isSelected && inspectionDetails.finalDecision ? (
                            <span
                              className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                                selectedDecisionStyles?.badge ?? "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {inspectionDetails.finalDecision.decisionType}
                            </span>
                          ) : null}
                        </div>
                        {isSelected && inspectionDetails.finalDecision?.userExplanation ? (
                          <p className="mt-2 text-xs text-slate-500">
                            {inspectionDetails.finalDecision.userExplanation}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

          </div>

          <div className="space-y-4">
            {inspectionDetails?.analyticContext ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Analytic Context
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600">
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">View</p>
                    <p className="mt-1 text-xs text-slate-800">{inspectionDetails.analyticContext.vizState.activeView}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Metric</p>
                    <p className="mt-1 break-all text-xs text-slate-800">
                      {inspectionDetails.analyticContext.vizState.metric}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">States</p>
                    <p className="mt-1 text-xs text-slate-800">
                      {inspectionDetails.analyticContext.vizState.filters.states.join(", ") || "All"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Years</p>
                    <p className="mt-1 text-xs text-slate-800">
                      {inspectionDetails.analyticContext.vizState.filters.years.join(", ") || "All"}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Interaction
              </p>
              <p className="mt-2 text-xs font-semibold text-slate-800">
                {inspectionDetails?.interaction?.label ?? "No linked interaction"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {inspectionDetails?.interaction?.type ?? inspectedNode.description}
              </p>
              <p className="mt-3 text-xs font-medium text-slate-700">
                {new Date(
                  inspectionDetails?.interaction?.timestamp ?? inspectedNode.timestamp,
                ).toLocaleString("en-US")}
              </p>
            </div>

            {inspectionDetails?.finalDecision && !inspectionDetails.candidateHypotheses?.length ? (
              <div
                className={`rounded-2xl border p-4 ${
                  selectedDecisionStyles?.card ?? "border-slate-200 bg-slate-50/80"
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Interpretation
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                      selectedDecisionStyles?.badge ?? "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {inspectionDetails.finalDecision.decisionType}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-700">
                  {inspectionDetails.finalDecision.revisedHypothesisText ??
                    inspectionDetails.finalDecision.hypothesisText}
                </p>
                {inspectionDetails.finalDecision.userExplanation ? (
                  <p className="mt-2 text-xs text-slate-500">
                    {inspectionDetails.finalDecision.userExplanation}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
      <Panel
        title="Decision Provenance Workspace"
        subtitle="State crime exploration with linked visual analysis, editable source data, and decision capture."
        actions={
          <>
            <button
              ref={manualAddButtonRef}
              type="button"
              onClick={openManualAdd}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Manual Add
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-full bg-white p-1 ring-1 ring-slate-200">
              <button
                type="button"
                onClick={() => setWorkspaceView("analysis")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  workspaceView === "analysis" ? "bg-slate-900 text-white" : "text-slate-500"
                }`}
              >
                Chart view
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceView("dataset")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  workspaceView === "dataset" ? "bg-slate-900 text-white" : "text-slate-500"
                }`}
              >
                Table view
              </button>
            </div>

            {workspaceView === "analysis" ? (
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <label
                  style={TOOL_BUTTON_STYLE}
                  className={`${ANALYSIS_CONTROL_CLASS_NAME} ${ANALYSIS_AXIS_CONTROL_CLASS_NAME}`}
                >
                  <span className="text-[9px] text-slate-400">X</span>
                  <select
                    value={xMetric}
                    onChange={(event) => handleXMetricChange(event.target.value as MetricKey)}
                    style={ANALYSIS_SELECT_STYLE}
                    className={ANALYSIS_SELECT_CLASS_NAME}
                  >
                    {METRIC_OPTIONS.map((option) => (
                      <option key={`x-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label
                  style={TOOL_BUTTON_STYLE}
                  className={`${ANALYSIS_CONTROL_CLASS_NAME} ${ANALYSIS_AXIS_CONTROL_CLASS_NAME}`}
                >
                  <span className="text-[9px] text-slate-400">Y</span>
                  <select
                    value={metric}
                    onChange={(event) => handleMetricChange(event.target.value as MetricKey)}
                    style={ANALYSIS_SELECT_STYLE}
                    className={ANALYSIS_SELECT_CLASS_NAME}
                  >
                    {METRIC_OPTIONS.map((option) => (
                      <option key={`y-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label
                  style={TOOL_BUTTON_STYLE}
                  className={`${ANALYSIS_CONTROL_CLASS_NAME} ${ANALYSIS_META_CONTROL_CLASS_NAME}`}
                >
                  <span className="text-[9px] text-slate-400">Color</span>
                  <select
                    value={scatterColorMode}
                    onChange={(event) => setScatterColorMode(event.target.value as ScatterColorMode)}
                    style={ANALYSIS_SELECT_STYLE}
                    className={ANALYSIS_SELECT_CLASS_NAME}
                  >
                    <option value="region">Region</option>
                    <option value="selection">Selected State</option>
                  </select>
                </label>

                <div className={ANALYSIS_STATUS_CLASS_NAME}>
                  {allYearsShortcutSelected || dataset.selectedYears.length === 0
                    ? "Averaging all 20 years"
                    : `Averaging ${dataset.selectedYears.length} selected year${dataset.selectedYears.length === 1 ? "" : "s"}`}
                </div>

                <MultiSelectFilter
                  label="Year"
                  selectedCount={
                    allYearsShortcutSelected
                      ? 0
                      : dataset.selectedYears.length
                  }
                  allOption={{
                    label: "All",
                    checked: allYearsShortcutSelected,
                    onToggle: toggleAllYears,
                  }}
                  onOpenChange={handleYearFilterOpenChange}
                  widthClassName="w-24 shrink-0 justify-center"
                  options={dataset.allYears.map((year) => ({
                    label: String(year),
                    value: String(year),
                    checked: dataset.selectedYears.includes(year),
                  }))}
                  onToggle={(year) => toggleYear(Number(year))}
                />
              </div>
            ) : null}
          </div>

          {workspaceView === "analysis" ? (
            <section className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-2">
                <ScatterChart
                  items={scatterPoints}
                  xMetric={xMetric}
                  yMetric={metric}
                  colorMode={scatterColorMode}
                  selectedStates={dataset.selectedStates}
                  onSelectState={toggleState}
                  onClearSelection={clearSelection}
                  onBrushSelection={handleBrushSelection}
                />
                <GeoBubbleMap
                  items={stateAggregates}
                  metric={metric}
                  selectedStates={dataset.selectedStates}
                  onSelectState={toggleState}
                  onClearSelection={clearSelection}
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <RankingBarChart
                  items={stateAggregates}
                  selectedStates={dataset.selectedStates}
                  onSelectState={toggleState}
                  onClearSelection={clearSelection}
                />
                <TrendLineChart items={stateAggregates} selectedStates={dataset.selectedStates} />
              </div>
            </section>
          ) : (
            <section>
              <DatasetTable
                rows={dataset.tableRows}
                columns={dataset.tableColumns}
                totalRowCount={dataset.rows.length}
                allStates={dataset.allStates}
                allYears={dataset.allYears}
                activeRowIds={dataset.selectedRowIds}
                selectedTableStates={dataset.tableFilteredStates}
                selectedTableYears={dataset.tableFilteredYears}
                selectedTableRowIds={dataset.tableSelectedRowIds}
                selectedColumnKeys={dataset.tableSelectedColumnKeys}
                hiddenRowCount={dataset.hiddenTableRowIds.length}
                hiddenColumnCount={dataset.hiddenTableColumnKeys.length}
                tableSortConfig={dataset.tableSortConfig}
                rowFilterActive={dataset.tableRowFilterMode === "selected"}
                columnFilterActive={dataset.tableColumnFilterMode === "selected"}
                onFocusRow={handleSelectRow}
                onToggleRowSelection={handleToggleTableRowSelection}
                onToggleAllVisibleRows={handleToggleAllVisibleTableRows}
                onToggleColumnSelection={handleToggleTableColumnSelection}
                onHideSelectedRows={handleHideSelectedRows}
                onShowOnlySelectedRows={handleShowOnlySelectedRows}
                onClearRowFilter={handleClearTableRowFilter}
                onHideSelectedColumns={handleHideSelectedColumns}
                onShowOnlySelectedColumns={handleShowOnlySelectedColumns}
                onClearColumnFilter={handleClearTableColumnFilter}
                onSortSelectedColumn={handleSortSelectedColumn}
                onClearSort={handleClearTableSort}
                onResetView={handleResetTableView}
                onCommitRowUpdate={(rowId, key, value) => {
                  dataset.updateRow(rowId, key, value);
                  void provenance.recordInteraction("edit", `Edit cell: ${String(key)}`, vizState, {
                    rowId,
                    field: String(key),
                  });
                }}
                onToggleTableStateFilter={handleToggleTableStateFilter}
                onToggleTableYearFilter={handleToggleTableYearFilter}
                onClearTableValueFilters={handleClearTableValueFilters}
                onTableStateFilterOpenChange={handleTableStateFilterOpenChange}
                onTableYearFilterOpenChange={handleTableYearFilterOpenChange}
              />
            </section>
          )}
        </div>
      </Panel>

      <section
        ref={timelineSectionRef}
        className="rounded-[28px] border border-white/60 bg-white/75 p-4 shadow-[0_18px_45px_rgba(148,163,184,0.18)] backdrop-blur-xl md:p-5"
      >
        <header className="mb-3">
          <h2 className="mt-1 text-xl font-semibold text-slate-800">Provenance Timeline</h2>
          <div className="mt-1 flex items-start justify-between gap-4">
            <p className="text-sm text-slate-500">
              Interaction drive the analysis forward, while decisions capture key insights and interpretations. Click on any node to inspect details and linked context.
            </p>
            <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500">
              {provenance.interactions.length + provenance.decisions.length} events
            </div>
          </div>
        </header>
        <ProvenanceTimeline
          interactions={provenance.interactions}
          decisions={provenance.decisions}
          onInspectNode={(node) => void handleInspectNode(node)}
          inspectedNode={inspectedNode}
          inspectionToneClassName={selectedDecisionStyles?.card ?? "border-slate-200 bg-white/95"}
          inspectionContent={timelineInspectionContent}
          scrollToNodeId={timelineScrollTargetId}
          onScrollToNodeHandled={() => setTimelineScrollTargetId(null)}
          embedded
        />
      </section>

      <CompactProvenanceTimeline
        interactions={provenance.interactions}
        decisions={provenance.decisions}
        visible={timelineDockVisible}
        onSelectMarker={(marker) => handleCompactTimelineSelect(marker.id)}
        activeMarkerId={inspectedNode?.id ?? null}
      />

      <DecisionNudge
        visible={pendingDecisionPrompt !== null && !isDecisionOpen}
        onOpenDecision={() => {
          if (!pendingDecisionPrompt) {
            return;
          }

          openDecisionPrompt(pendingDecisionPrompt);
          setPendingDecisionPrompt(null);
        }}
        onDismiss={dismissDecisionNudge}
      />

      <div
        className={`fixed right-4 top-4 z-40 transition-all duration-300 md:right-6 lg:right-8 ${
          manualAddDockVisible && !isDecisionOpen
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-3 opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={openManualAdd}
          aria-label="Manual Add"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-[0_16px_38px_rgba(15,23,42,0.22)] transition hover:-translate-y-0.5"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 5V19"
              stroke="currentColor"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
            <path
              d="M5 12H19"
              stroke="currentColor"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {isDecisionOpen ? (
        <DecisionModal
          key={`${metric}-${dataset.selectedStates.join("-")}-${decisionHypotheses[0]?.id ?? "empty"}`}
          isOpen={isDecisionOpen}
          hypotheses={decisionHypotheses}
          loading={hypothesesLoading}
          error={hypothesesError}
          onClose={() => {
            if (decisionPromptState?.source === "interaction_trigger") {
              lastAutoDismissAt.current = Date.now();
            }
            setDecisionPromptState(null);
            setIsDecisionOpen(false);
          }}
          onSave={handleSaveDecision}
        />
      ) : null}

      {dataset.loading ? (
        <div className="fixed inset-x-0 top-4 mx-auto w-fit rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Loading dataset...
        </div>
      ) : null}

      {dataset.error ? (
        <div className="fixed inset-x-0 top-4 mx-auto w-fit rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white">
          {dataset.error}
        </div>
      ) : null}

      {sessionError || provenance.error ? (
        <div className="fixed inset-x-0 top-16 mx-auto w-fit rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white">
          {sessionError ?? provenance.error}
        </div>
      ) : null}
    </main>
  );
}
