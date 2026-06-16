import { generateHypothesesFromContext, type HypothesisGenerationResult } from "@/lib/server/hypothesis-generator";
import type {
  AnalyticContext,
  GenerateHypothesesRequest,
  InteractionPayloadValue,
  VizState,
} from "@/lib/types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, init);
}

export function errorResponse(status: number, message: string) {
  return jsonResponse({ error: message }, { status });
}

export function isVizState(value: unknown): value is VizState {
  if (!isObject(value) || !isObject(value.filters)) {
    return false;
  }

  return (
    typeof value.activeView === "string" &&
    typeof value.metric === "string" &&
    Array.isArray(value.filters.states) &&
    Array.isArray(value.filters.years) &&
    Array.isArray(value.selectedDataIds)
  );
}

export function isInteractionPayload(value: unknown): value is Record<string, InteractionPayloadValue> {
  return value === undefined || isObject(value);
}

export function isAnalyticContext(value: unknown): value is AnalyticContext {
  if (!isObject(value) || !isVizState(value.vizState)) {
    return false;
  }

  if (value.recentInteractions !== undefined && !Array.isArray(value.recentInteractions)) {
    return false;
  }

  if (value.tableSelection !== undefined && !Array.isArray(value.tableSelection)) {
    return false;
  }

  return true;
}

export async function buildHypothesisResponse(
  datasetId: string,
  request: GenerateHypothesesRequest,
): Promise<HypothesisGenerationResult> {
  return generateHypothesesFromContext(datasetId, request);
}
