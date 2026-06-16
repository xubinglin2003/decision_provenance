import type {
  AnalyticContext,
  ContextSummary,
  CreateDecisionRequest,
  CreateInteractionRequest,
  CreateSessionResponse,
  DecisionSource,
  Hypothesis,
  TimelineDecision,
  TimelineInspectionResponse,
  TimelineInteraction,
  TimelineResponse,
} from "@/lib/types";

type HypothesisGenerationRecord = {
  id: string;
  source: DecisionSource;
  triggerInteractionId?: string;
  hypotheses: Hypothesis[];
  context: AnalyticContext;
  contextSummary: ContextSummary;
  provider?: string;
  model?: string;
  fallbackUsed?: boolean;
  latencyMs?: number;
  createdAt: string;
};

type StoreState = {
  sessions: Map<string, CreateSessionResponse>;
  interactionsBySession: Map<string, TimelineInteraction[]>;
  decisionsBySession: Map<string, TimelineDecision[]>;
  hypothesisGenerationsBySession: Map<string, HypothesisGenerationRecord[]>;
};

const globalStore = globalThis as typeof globalThis & {
  __decisionProvenanceStore?: StoreState;
};

function createStore(): StoreState {
  return {
    sessions: new Map(),
    interactionsBySession: new Map(),
    decisionsBySession: new Map(),
    hypothesisGenerationsBySession: new Map(),
  };
}

function getStore() {
  if (!globalStore.__decisionProvenanceStore) {
    globalStore.__decisionProvenanceStore = createStore();
  }

  return globalStore.__decisionProvenanceStore;
}

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureSessionCollections(sessionId: string) {
  const store = getStore();

  if (!store.interactionsBySession.has(sessionId)) {
    store.interactionsBySession.set(sessionId, []);
  }

  if (!store.decisionsBySession.has(sessionId)) {
    store.decisionsBySession.set(sessionId, []);
  }

  if (!store.hypothesisGenerationsBySession.has(sessionId)) {
    store.hypothesisGenerationsBySession.set(sessionId, []);
  }
}

export function createSession(datasetId: string) {
  const store = getStore();
  const session: CreateSessionResponse = {
    sessionId: createId("sess"),
    datasetId,
    createdAt: new Date().toISOString(),
  };

  store.sessions.set(session.sessionId, session);
  ensureSessionCollections(session.sessionId);

  return session;
}

export function getSession(sessionId: string) {
  return getStore().sessions.get(sessionId);
}

export function recordInteraction(sessionId: string, request: CreateInteractionRequest) {
  ensureSessionCollections(sessionId);

  const interaction: TimelineInteraction = {
    id: createId("evt"),
    type: request.type,
    label: request.label,
    payload: request.payload,
    vizState: request.vizState,
    timestamp: request.timestamp ?? new Date().toISOString(),
  };

  getStore().interactionsBySession.get(sessionId)?.push(interaction);
  return interaction;
}

export function listRecentInteractions(sessionId: string, limit = 5) {
  const interactions = getStore().interactionsBySession.get(sessionId) ?? [];
  return [...interactions]
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
    .slice(-limit);
}

export function recordHypothesisGeneration(
  sessionId: string,
  record: Omit<HypothesisGenerationRecord, "id" | "createdAt">,
) {
  ensureSessionCollections(sessionId);

  const storedRecord: HypothesisGenerationRecord = {
    id: createId("gen"),
    createdAt: new Date().toISOString(),
    ...record,
  };

  getStore().hypothesisGenerationsBySession.get(sessionId)?.push(storedRecord);
  return storedRecord;
}

export function recordDecision(sessionId: string, request: CreateDecisionRequest) {
  ensureSessionCollections(sessionId);

  const decision: TimelineDecision = {
    id: createId("dec"),
    source: request.source,
    triggerInteractionId: request.triggerInteractionId,
    decisionType: request.decisionType,
    hypothesisId: request.hypothesisId,
    hypothesisText: request.hypothesisText,
    revisedHypothesisText: request.revisedHypothesisText,
    userExplanation: request.userExplanation,
    context: request.context,
    timestamp: request.timestamp ?? new Date().toISOString(),
  };

  getStore().decisionsBySession.get(sessionId)?.push(decision);
  return decision;
}

export function getTimeline(sessionId: string): TimelineResponse {
  return {
    interactions: [...(getStore().interactionsBySession.get(sessionId) ?? [])].sort(
      (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
    ),
    decisions: [...(getStore().decisionsBySession.get(sessionId) ?? [])].sort(
      (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
    ),
  };
}

function findRelevantGeneration(sessionId: string, nodeId: string, decision?: TimelineDecision) {
  const records = getStore().hypothesisGenerationsBySession.get(sessionId) ?? [];

  if (decision?.triggerInteractionId) {
    return records.findLast((record) => record.triggerInteractionId === decision.triggerInteractionId);
  }

  const directMatch = records.findLast((record) => record.triggerInteractionId === nodeId);
  if (directMatch) {
    return directMatch;
  }

  if (decision) {
    return records.findLast(
      (record) =>
        record.hypotheses.some((hypothesis) => hypothesis.id === decision.hypothesisId) ||
        record.hypotheses.some((hypothesis) => hypothesis.text === decision.hypothesisText),
    );
  }

  return undefined;
}

export function getTimelineInspection(sessionId: string, nodeId: string): TimelineInspectionResponse | null {
  const timeline = getTimeline(sessionId);
  const interaction = timeline.interactions.find((item) => item.id === nodeId);
  const finalDecision = timeline.decisions.find((item) => item.id === nodeId);

  if (!interaction && !finalDecision) {
    return null;
  }

  const linkedInteraction =
    interaction ??
    (finalDecision?.triggerInteractionId
      ? timeline.interactions.find((item) => item.id === finalDecision.triggerInteractionId)
      : undefined);

  const generation = findRelevantGeneration(sessionId, nodeId, finalDecision);
  const vizState =
    finalDecision?.context?.vizState ??
    generation?.context.vizState ??
    linkedInteraction?.vizState;
  const analyticContext = vizState
    ? {
        vizState,
        recentInteractions: generation?.context.recentInteractions,
        tableSelection: generation?.context.tableSelection,
      }
    : undefined;

  return {
    nodeId,
    nodeType: interaction ? "interaction" : "decision",
    interaction: linkedInteraction,
    candidateHypotheses: generation?.hypotheses,
    finalDecision,
    analyticContext,
  };
}
