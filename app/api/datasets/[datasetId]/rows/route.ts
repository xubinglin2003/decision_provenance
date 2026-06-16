import { type NextRequest } from "next/server";
import { errorResponse, jsonResponse } from "@/lib/server/api";
import { isKnownDatasetId, queryDatasetRows } from "@/lib/server/dataset-store";
import type { CrimeDatum, DatasetRowsQuery } from "@/lib/types";

export const runtime = "nodejs";

function parseFilters(request: NextRequest): DatasetRowsQuery["filters"] {
  const states = request.nextUrl.searchParams.get("states");
  const years = request.nextUrl.searchParams.get("years");

  return {
    states: states ? states.split(",").filter(Boolean) : undefined,
    years: years ? years.split(",").map(Number).filter((value) => !Number.isNaN(value)) : undefined,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ datasetId: string }> },
) {
  const { datasetId } = await context.params;

  if (!isKnownDatasetId(datasetId)) {
    return errorResponse(404, `Dataset ${datasetId} was not found.`);
  }

  const sortByParam = request.nextUrl.searchParams.get("sortBy");
  const query: DatasetRowsQuery = {
    page: Number(request.nextUrl.searchParams.get("page") ?? 1),
    pageSize: Number(request.nextUrl.searchParams.get("pageSize") ?? 100),
    sortBy: (sortByParam as keyof CrimeDatum | null) ?? undefined,
    sortOrder: request.nextUrl.searchParams.get("sortOrder") === "desc" ? "desc" : "asc",
    filters: parseFilters(request),
  };

  return jsonResponse(await queryDatasetRows(datasetId, query));
}
