import { errorResponse, jsonResponse } from "@/lib/server/api";
import { getSession, getTimelineInspection } from "@/lib/server/provenance-store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string; nodeId: string }> },
) {
  const { sessionId, nodeId } = await context.params;

  if (!getSession(sessionId)) {
    return errorResponse(404, `Session ${sessionId} was not found.`);
  }

  const inspection = getTimelineInspection(sessionId, nodeId);
  if (!inspection) {
    return errorResponse(404, `Timeline node ${nodeId} was not found.`);
  }

  return jsonResponse(inspection);
}
