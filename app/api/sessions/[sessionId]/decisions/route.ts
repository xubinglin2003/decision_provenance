import { errorResponse, isAnalyticContext, jsonResponse } from "@/lib/server/api";
import { getSession, recordDecision } from "@/lib/server/provenance-store";
import type { CreateDecisionRequest } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  const session = getSession(sessionId);

  if (!session) {
    return errorResponse(404, `Session ${sessionId} was not found.`);
  }

  const body = (await request.json().catch(() => null)) as CreateDecisionRequest | null;

  if (
    !body ||
    (body.source !== "interaction_trigger" && body.source !== "manual_add") ||
    !["adopt", "reject", "revise"].includes(body.decisionType) ||
    typeof body.hypothesisText !== "string" ||
    !isAnalyticContext(body.context)
  ) {
    return errorResponse(400, "Decision payload is invalid.");
  }

  if (body.decisionType === "revise" && !body.revisedHypothesisText?.trim()) {
    return errorResponse(400, "revisedHypothesisText is required when decisionType is revise.");
  }

  const decision = recordDecision(sessionId, body);

  return jsonResponse(
    {
      decisionId: decision.id,
      stored: true,
      timestamp: decision.timestamp,
    },
    { status: 201 },
  );
}
