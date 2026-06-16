import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseCrimeCsv } from "@/lib/csv";
import type { CrimeDatum, DatasetRowsQuery } from "@/lib/types";

const DATASET_FILE_MAP: Record<string, string> = {
  state_crime_small: "state_crime_small.csv",
};

const datasetCache = new Map<string, Promise<CrimeDatum[]>>();

function getDatasetFileName(datasetId: string) {
  return DATASET_FILE_MAP[datasetId];
}

function compareValues(left: string | number, right: string | number, sortOrder: "asc" | "desc") {
  if (typeof left === "number" && typeof right === "number") {
    return sortOrder === "asc" ? left - right : right - left;
  }

  const normalizedLeft = String(left);
  const normalizedRight = String(right);
  return sortOrder === "asc"
    ? normalizedLeft.localeCompare(normalizedRight)
    : normalizedRight.localeCompare(normalizedLeft);
}

export function isKnownDatasetId(datasetId: string) {
  return datasetId in DATASET_FILE_MAP;
}

export async function loadDatasetRows(datasetId: string) {
  const fileName = getDatasetFileName(datasetId);

  if (!fileName) {
    throw new Error(`Unknown dataset: ${datasetId}`);
  }

  let cached = datasetCache.get(datasetId);
  if (!cached) {
    const csvPath = path.join(process.cwd(), "public", fileName);
    cached = readFile(csvPath, "utf8").then(parseCrimeCsv);
    datasetCache.set(datasetId, cached);
  }

  return cached;
}

export async function queryDatasetRows(datasetId: string, query: DatasetRowsQuery) {
  const rows = await loadDatasetRows(datasetId);
  const sortOrder = query.sortOrder ?? "asc";

  let filteredRows = rows;

  if (query.filters?.states?.length) {
    const stateSet = new Set(query.filters.states.map(String));
    filteredRows = filteredRows.filter((row) => stateSet.has(row.State));
  }

  if (query.filters?.years?.length) {
    const yearSet = new Set(query.filters.years.map(Number));
    filteredRows = filteredRows.filter((row) => yearSet.has(row.Year));
  }

  if (query.sortBy) {
    const sortBy = query.sortBy;
    filteredRows = [...filteredRows].sort((left, right) =>
      compareValues(left[sortBy] as string | number, right[sortBy] as string | number, sortOrder),
    );
  }

  const total = filteredRows.length;
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.max(1, query.pageSize ?? (total || 1));
  const start = (page - 1) * pageSize;
  const pagedRows = filteredRows.slice(start, start + pageSize);

  return {
    rows: pagedRows,
    total,
  };
}
