import type { CrimeDatum } from "@/lib/types";

type NumericCrimeKey = Exclude<keyof CrimeDatum, "id" | "State">;

const NUMERIC_COLUMNS: NumericCrimeKey[] = [
  "Year",
  "Data.Population",
  "Data.Rates.Property.All",
  "Data.Rates.Property.Burglary",
  "Data.Rates.Property.Larceny",
  "Data.Rates.Property.Motor",
  "Data.Rates.Violent.All",
  "Data.Rates.Violent.Assault",
  "Data.Rates.Violent.Murder",
  "Data.Rates.Violent.Rape",
  "Data.Rates.Violent.Robbery",
  "Data.Totals.Property.All",
  "Data.Totals.Property.Burglary",
  "Data.Totals.Property.Larceny",
  "Data.Totals.Property.Motor",
  "Data.Totals.Violent.All",
  "Data.Totals.Violent.Assault",
  "Data.Totals.Violent.Murder",
  "Data.Totals.Violent.Rape",
  "Data.Totals.Violent.Robbery",
];

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

export function parseCrimeCsv(csvText: string): CrimeDatum[] {
  const lines = csvText.trim().split(/\r?\n/);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line, rowIndex) => {
    const cells = parseCsvLine(line);
    const rawRecord = headers.reduce<Record<string, string>>((record, header, headerIndex) => {
      record[header] = cells[headerIndex] ?? "";
      return record;
    }, {});

    const baseRecord = {
      id: `${rawRecord.State}-${rawRecord.Year}-${rowIndex}`,
      State: rawRecord.State,
    } as CrimeDatum;

    for (const key of NUMERIC_COLUMNS) {
      (baseRecord as Record<NumericCrimeKey, number>)[key] = Number(rawRecord[key] ?? 0);
    }

    return baseRecord;
  });
}
