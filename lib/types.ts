export type CrimeDatum = {
  id: string;
  State: string;
  Year: number;
  "Data.Population": number;
  "Data.Rates.Property.All": number;
  "Data.Rates.Property.Burglary": number;
  "Data.Rates.Property.Larceny": number;
  "Data.Rates.Property.Motor": number;
  "Data.Rates.Violent.All": number;
  "Data.Rates.Violent.Assault": number;
  "Data.Rates.Violent.Murder": number;
  "Data.Rates.Violent.Rape": number;
  "Data.Rates.Violent.Robbery": number;
  "Data.Totals.Property.All": number;
  "Data.Totals.Property.Burglary": number;
  "Data.Totals.Property.Larceny": number;
  "Data.Totals.Property.Motor": number;
  "Data.Totals.Violent.All": number;
  "Data.Totals.Violent.Assault": number;
  "Data.Totals.Violent.Murder": number;
  "Data.Totals.Violent.Rape": number;
  "Data.Totals.Violent.Robbery": number;
};

export type MetricKey =
  | "Data.Rates.Property.All"
  | "Data.Rates.Property.Burglary"
  | "Data.Rates.Property.Larceny"
  | "Data.Rates.Property.Motor"
  | "Data.Rates.Violent.All"
  | "Data.Rates.Violent.Assault"
  | "Data.Rates.Violent.Murder"
  | "Data.Rates.Violent.Rape"
  | "Data.Rates.Violent.Robbery"
  | "Data.Totals.Property.All"
  | "Data.Totals.Property.Burglary"
  | "Data.Totals.Property.Larceny"
  | "Data.Totals.Property.Motor"
  | "Data.Totals.Violent.All"
  | "Data.Totals.Violent.Assault"
  | "Data.Totals.Violent.Murder"
  | "Data.Totals.Violent.Rape"
  | "Data.Totals.Violent.Robbery";

export type ViewMode = "scatter" | "ranking" | "geography" | "trend";

export type WorkspaceSelectionState = {
  selectedStates: string[];
  selectedYears: number[];
  selectedRowIds: string[];
};

export type VizFilters = {
  states: string[];
  years: number[];
};

export type VizState = {
  activeView: ViewMode;
  metric: MetricKey;
  filters: VizFilters;
  selectedDataIds: string[];
};

export type InteractionType =
  | "load_data"
  | "filter"
  | "zoom"
  | "select"
  | "cluster"
  | "compare"
  | "edit"
  | "inspect"
  | "manual_add";

export type InteractionPayloadValue = string | number | boolean | string[] | number[] | null;

export type DecisionSource = "interaction_trigger" | "manual_add";

export type TimelineInteraction = {
  id: string;
  type: InteractionType;
  label: string;
  timestamp: string;
  payload?: Record<string, InteractionPayloadValue>;
  vizState?: VizState;
};

export type DecisionType = "adopt" | "reject" | "revise";

export type TimelineDecision = {
  id: string;
  source?: DecisionSource;
  triggerInteractionId?: string;
  decisionType: DecisionType;
  hypothesisId?: string;
  hypothesisText: string;
  revisedHypothesisText?: string;
  userExplanation?: string;
  candidateHypotheses?: Hypothesis[];
  context?: AnalyticContext;
  timestamp: string;
};

export type HypothesisSource = "llm" | "heuristic";

export type Hypothesis = {
  id: string;
  text: string;
  score: number;
  source: HypothesisSource;
};

export type ContextSummary = {
  activeView: ViewMode;
  selectedCount: number;
  filtersApplied: number;
};

export type AnalyticContext = {
  vizState: VizState;
  recentInteractions?: TimelineInteraction[];
  tableSelection?: string[];
};

export type TimelineNode = {
  id: string;
  label: string;
  timestamp: string;
  layer: "interaction" | "decision";
  tone: "neutral" | DecisionType;
  description: string;
  anchorId?: string;
  inspectPosition?: number;
};

export type StateAggregate = {
  state: string;
  region: string;
  averageMetric: number;
  peakMetric: number;
  population: number;
  records: number;
  trend: Array<{ year: number; value: number }>;
};

export type ScatterColorMode = "region" | "selection";

export type ScatterPointAggregate = {
  state: string;
  region: string;
  xValue: number;
  yValue: number;
  population: number;
  records: number;
};

export type Session = {
  sessionId: string;
  datasetId: string;
  createdAt: string;
};

export type CreateSessionRequest = {
  datasetId: string;
};

export type CreateSessionResponse = Session;

export type DatasetRowsQuery = {
  page?: number;
  pageSize?: number;
  sortBy?: keyof CrimeDatum;
  sortOrder?: "asc" | "desc";
  filters?: Partial<Record<keyof VizFilters, string[] | number[]>>;
};

export type DatasetRowsResponse = {
  rows: CrimeDatum[];
  total: number;
};

export type TableSortDirection = "asc" | "desc";

export type TableSortConfig = {
  key: keyof CrimeDatum;
  direction: TableSortDirection;
};

export type CreateInteractionRequest = {
  type: InteractionType;
  label: string;
  payload?: Record<string, InteractionPayloadValue>;
  vizState: VizState;
  timestamp?: string;
};

export type CreateInteractionResponse = {
  interactionId: string;
  stored: boolean;
};

export type GenerateHypothesesRequest = {
  source: DecisionSource;
  triggerInteractionId?: string;
  context: AnalyticContext;
};

export type GenerateHypothesesResponse = {
  hypotheses: Hypothesis[];
  contextSummary: ContextSummary;
};

export type CreateDecisionRequest = {
  source: DecisionSource;
  triggerInteractionId?: string;
  decisionType: DecisionType;
  hypothesisId?: string;
  hypothesisText: string;
  revisedHypothesisText?: string;
  userExplanation?: string;
  context: AnalyticContext;
  timestamp?: string;
};

export type CreateDecisionResponse = {
  decisionId: string;
  stored: boolean;
  timestamp: string;
};

export type TimelineResponse = {
  interactions: TimelineInteraction[];
  decisions: TimelineDecision[];
};

export type TimelineInspectionResponse = {
  nodeId: string;
  nodeType: "interaction" | "decision";
  interaction?: TimelineInteraction;
  candidateHypotheses?: Hypothesis[];
  finalDecision?: TimelineDecision;
  analyticContext?: AnalyticContext;
};
