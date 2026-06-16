import { errorResponse, isInteractionPayload, isVizState, jsonResponse } from "@/lib/server/api";
import { getSession, recordInteraction } from "@/lib/server/provenance-store";
import type { CreateInteractionRequest } from "@/lib/types";

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

  const body = (await request.json().catch(() => null)) as CreateInteractionRequest | null;

  if (!body || typeof body.type !== "string" || typeof body.label !== "string" || !isVizState(body.vizState)) {
    return errorResponse(400, "Interaction payload is invalid.");
  }

  if (!isInteractionPayload(body.payload)) {
    return errorResponse(400, "Interaction payload must be an object when provided.");
  }

  const interaction = recordInteraction(sessionId, body);
  return jsonResponse(
    {
      interactionId: interaction.id,
      stored: true,
    },
    { status: 201 },
  );
}
