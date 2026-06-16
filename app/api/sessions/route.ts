import { isKnownDatasetId } from "@/lib/server/dataset-store";
import { createSession } from "@/lib/server/provenance-store";
import { errorResponse, jsonResponse } from "@/lib/server/api";
import type { CreateSessionRequest } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CreateSessionRequest | null;

  if (!body?.datasetId || typeof body.datasetId !== "string") {
    return errorResponse(400, "A valid datasetId is required.");
  }

  if (!isKnownDatasetId(body.datasetId)) {
    return errorResponse(404, `Dataset ${body.datasetId} was not found.`);
  }

  return jsonResponse(createSession(body.datasetId), { status: 201 });
}
