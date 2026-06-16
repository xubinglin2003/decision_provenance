import { errorResponse, jsonResponse } from "@/lib/server/api";
import { getSession, getTimeline } from "@/lib/server/provenance-store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;

  if (!getSession(sessionId)) {
    return errorResponse(404, `Session ${sessionId} was not found.`);
  }

  return jsonResponse(getTimeline(sessionId));
}
