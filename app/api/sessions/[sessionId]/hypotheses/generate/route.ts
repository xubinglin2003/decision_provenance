import {
  buildHypothesisResponse,
  errorResponse,
  isAnalyticContext,
  jsonResponse,
} from "@/lib/server/api";
import {
  getSession,
  listRecentInteractions,
  recordHypothesisGeneration,
} from "@/lib/server/provenance-store";
import type { GenerateHypothesesRequest } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  routeContext: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await routeContext.params;
  const session = getSession(sessionId);

  if (!session) {
    return errorResponse(404, `Session ${sessionId} was not found.`);
  }

  const body = (await request.json().catch(() => null)) as GenerateHypothesesRequest | null;

  if (
    !body ||
    (body.source !== "interaction_trigger" && body.source !== "manual_add") ||
    !isAnalyticContext(body.context)
  ) {
    return errorResponse(400, "Hypothesis generation payload is invalid.");
  }

  const enrichedContext = {
    ...body.context,
    recentInteractions:
      body.context.recentInteractions && body.context.recentInteractions.length > 0
        ? body.context.recentInteractions
        : listRecentInteractions(sessionId),
  };
  const generation = await buildHypothesisResponse(session.datasetId, {
    ...body,
    context: enrichedContext,
  });

  recordHypothesisGeneration(sessionId, {
    source: body.source,
    triggerInteractionId: body.triggerInteractionId,
    hypotheses: generation.response.hypotheses,
    context: enrichedContext,
    contextSummary: generation.response.contextSummary,
    provider: generation.metadata.provider,
    model: generation.metadata.model,
    fallbackUsed: generation.metadata.fallbackUsed,
    latencyMs: generation.metadata.latencyMs,
  });

  return jsonResponse(generation.response, { status: 201 });
}
