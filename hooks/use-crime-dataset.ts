"use client";

import { useEffect, useMemo, useState } from "react";
import { TABLE_COLUMNS } from "@/lib/analytics";
import type { CrimeDatum, DatasetRowsResponse, MetricKey, TableSortConfig, TableSortDirection } from "@/lib/types";

type EditableValue = string | number;
type TableFilterMode = "all" | "selected";

const DEFAULT_DATASET_ID = "state_crime_small";

function sortRows(rows: CrimeDatum[], sortConfig: TableSortConfig | null) {
  if (!sortConfig) {
    return rows;
  }

  const directionMultiplier = sortConfig.direction === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const leftValue = left[sortConfig.key];
    const rightValue = right[sortConfig.key];

    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return (leftValue - rightValue) * directionMultiplier;
    }

    return String(leftValue).localeCompare(String(rightValue), "en-US", { numeric: true }) * directionMultiplier;
  });
}

export function useCrimeDataset(metric: MetricKey, datasetId = DEFAULT_DATASET_ID) {
  const [rows, setRows] = useState<CrimeDatum[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [tableFilteredStates, setTableFilteredStates] = useState<string[]>([]);
  const [tableFilteredYears, setTableFilteredYears] = useState<number[]>([]);
  const [tableSelectedRowIds, setTableSelectedRowIds] = useState<string[]>([]);
  const [tableSelectedColumnKeys, setTableSelectedColumnKeys] = useState<Array<keyof CrimeDatum>>([]);
  const [hiddenTableRowIds, setHiddenTableRowIds] = useState<string[]>([]);
  const [hiddenTableColumnKeys, setHiddenTableColumnKeys] = useState<Array<keyof CrimeDatum>>([]);
  const [tableRowFilterMode, setTableRowFilterMode] = useState<TableFilterMode>("all");
  const [tableColumnFilterMode, setTableColumnFilterMode] = useState<TableFilterMode>("all");
  const [tableSortConfig, setTableSortConfig] = useState<TableSortConfig | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadRows() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/datasets/${datasetId}/rows?page=1&pageSize=5000`);
        if (!response.ok) {
          throw new Error("Unable to load dataset rows.");
        }
        const payload = (await response.json()) as DatasetRowsResponse;
        if (!isMounted) {
          return;
        }
        const availableYears = Array.from(new Set(payload.rows.map((row) => row.Year))).sort(
          (left, right) => left - right,
        );
        setRows(payload.rows);
        setSelectedYears(availableYears);
        setTableSelectedRowIds([]);
        setTableSelectedColumnKeys([]);
        setHiddenTableRowIds([]);
        setHiddenTableColumnKeys([]);
        setTableRowFilterMode("all");
        setTableColumnFilterMode("all");
        setTableSortConfig(null);
        setTableFilteredStates([]);
        setTableFilteredYears([]);
      } catch {
        if (!isMounted) {
          return;
        }
        setError("Unable to load dataset rows from the API.");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadRows();

    return () => {
      isMounted = false;
    };
  }, [datasetId]);

  const allYears = useMemo(
    () => Array.from(new Set(rows.map((row) => row.Year))).sort((left, right) => left - right),
    [rows],
  );

  const allStates = useMemo(
    () => Array.from(new Set(rows.map((row) => row.State))).sort((left, right) => left.localeCompare(right)),
    [rows],
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const stateMatch = selectedStates.length === 0 || selectedStates.includes(row.State);
      const yearMatch = selectedYears.length === 0 || selectedYears.includes(row.Year);

      return stateMatch && yearMatch;
    });
  }, [rows, selectedStates, selectedYears]);

  const tableRows = useMemo(() => {
    const hiddenRowIds = new Set(hiddenTableRowIds);
    const selectedTableRows = new Set(tableSelectedRowIds);

    const visibleRows = rows.filter((row) => {
      const stateFilterMatch =
        tableFilteredStates.length === 0 || tableFilteredStates.includes(row.State);
      const yearFilterMatch =
        tableFilteredYears.length === 0 || tableFilteredYears.includes(row.Year);
      const rowFilterMatch = tableRowFilterMode === "all" || selectedTableRows.has(row.id);

      return !hiddenRowIds.has(row.id) && stateFilterMatch && yearFilterMatch && rowFilterMatch;
    });

    return sortRows(visibleRows, tableSortConfig);
  }, [
    hiddenTableRowIds,
    rows,
    tableFilteredStates,
    tableFilteredYears,
    tableRowFilterMode,
    tableSelectedRowIds,
    tableSortConfig,
  ]);

  const tableColumns = useMemo(() => {
    const hiddenColumns = new Set(hiddenTableColumnKeys);
    const selectedColumns = new Set(tableSelectedColumnKeys);

    return TABLE_COLUMNS.filter((column) => {
      const hidden = hiddenColumns.has(column.key);
      const selected = tableColumnFilterMode === "all" || selectedColumns.has(column.key);
      return !hidden && selected;
    });
  }, [hiddenTableColumnKeys, tableColumnFilterMode, tableSelectedColumnKeys]);

  const highlightedRows = useMemo(
    () =>
      selectedRowIds.length > 0
        ? filteredRows.filter((row) => selectedRowIds.includes(row.id))
        : filteredRows.slice(0, 25),
    [filteredRows, selectedRowIds],
  );

  const topMetricValue = useMemo(
    () => filteredRows.reduce((max, row) => Math.max(max, row[metric]), 0),
    [filteredRows, metric],
  );

  function updateRow(rowId: string, key: keyof CrimeDatum, value: EditableValue) {
    setRows((currentRows) =>
      currentRows.map((row) => {
        if (row.id !== rowId) {
          return row;
        }

        if (typeof row[key] === "number") {
          return {
            ...row,
            [key]: Number(value),
          };
        }

        return {
          ...row,
          [key]: String(value),
        };
      }),
    );
  }

  function toggleTableRowSelection(rowId: string) {
    setTableSelectedRowIds((currentRowIds) =>
      currentRowIds.includes(rowId)
        ? currentRowIds.filter((currentRowId) => currentRowId !== rowId)
        : [...currentRowIds, rowId],
    );
  }

  function toggleAllVisibleTableRows() {
    const visibleRowIds = tableRows.map((row) => row.id);

    setTableSelectedRowIds((currentRowIds) => {
      if (visibleRowIds.length === 0) {
        return currentRowIds;
      }

      const visibleRowIdSet = new Set(visibleRowIds);
      const allVisibleSelected = visibleRowIds.every((rowId) => currentRowIds.includes(rowId));

      if (allVisibleSelected) {
        return currentRowIds.filter((rowId) => !visibleRowIdSet.has(rowId));
      }

      return Array.from(new Set([...currentRowIds, ...visibleRowIds]));
    });
  }

  function toggleTableColumnSelection(columnKey: keyof CrimeDatum) {
    setTableSelectedColumnKeys((currentColumnKeys) =>
      currentColumnKeys.includes(columnKey)
        ? currentColumnKeys.filter((currentColumnKey) => currentColumnKey !== columnKey)
        : [...currentColumnKeys, columnKey],
    );
  }

  function hideSelectedTableRows() {
    if (tableSelectedRowIds.length === 0) {
      return;
    }

    const selectedTableRowIdSet = new Set(tableSelectedRowIds);

    setHiddenTableRowIds((currentRowIds) => Array.from(new Set([...currentRowIds, ...tableSelectedRowIds])));
    setSelectedRowIds((currentRowIds) => currentRowIds.filter((rowId) => !selectedTableRowIdSet.has(rowId)));
    setTableSelectedRowIds([]);
    setTableRowFilterMode("all");
  }

  function showOnlySelectedTableRows() {
    if (tableSelectedRowIds.length === 0) {
      return;
    }

    setTableRowFilterMode("selected");
  }

  function clearTableRowFilter() {
    setTableRowFilterMode("all");
  }

  function hideSelectedTableColumns() {
    if (tableSelectedColumnKeys.length === 0) {
      return;
    }

    const currentVisibleColumnKeys = new Set(tableColumns.map((column) => column.key));
    const columnKeysToHide = tableSelectedColumnKeys.filter((columnKey) => currentVisibleColumnKeys.has(columnKey));

    if (columnKeysToHide.length === 0 || columnKeysToHide.length === tableColumns.length) {
      return;
    }

    const selectedColumnKeySet = new Set(columnKeysToHide);

    setHiddenTableColumnKeys((currentColumnKeys) => Array.from(new Set([...currentColumnKeys, ...columnKeysToHide])));
    setTableSelectedColumnKeys((currentColumnKeys) =>
      currentColumnKeys.filter((columnKey) => !selectedColumnKeySet.has(columnKey)),
    );
    setTableColumnFilterMode("all");
    setTableSortConfig((currentSortConfig) =>
      currentSortConfig && selectedColumnKeySet.has(currentSortConfig.key) ? null : currentSortConfig,
    );
  }

  function showOnlySelectedTableColumns() {
    if (tableSelectedColumnKeys.length === 0) {
      return;
    }

    setTableColumnFilterMode("selected");
    setTableSortConfig((currentSortConfig) =>
      currentSortConfig && !tableSelectedColumnKeys.includes(currentSortConfig.key) ? null : currentSortConfig,
    );
  }

  function clearTableColumnFilter() {
    setTableColumnFilterMode("all");
  }

  function setTableSort(key: keyof CrimeDatum, direction: TableSortDirection) {
    setTableSortConfig({ key, direction });
  }

  function clearTableSort() {
    setTableSortConfig(null);
  }

  function toggleTableStateFilter(state: string) {
    setTableFilteredStates((currentStates) =>
      currentStates.includes(state)
        ? currentStates.filter((currentState) => currentState !== state)
        : [...currentStates, state],
    );
  }

  function toggleTableYearFilter(year: number) {
    setTableFilteredYears((currentYears) =>
      currentYears.includes(year)
        ? currentYears.filter((currentYear) => currentYear !== year)
        : [...currentYears, year].sort((left, right) => left - right),
    );
  }

  function clearTableValueFilters() {
    setTableFilteredStates([]);
    setTableFilteredYears([]);
  }

  function resetTableView() {
    setTableFilteredStates([]);
    setTableFilteredYears([]);
    setTableSelectedRowIds([]);
    setTableSelectedColumnKeys([]);
    setHiddenTableRowIds([]);
    setHiddenTableColumnKeys([]);
    setTableRowFilterMode("all");
    setTableColumnFilterMode("all");
    setTableSortConfig(null);
  }

  return {
    rows,
    filteredRows,
    highlightedRows,
    tableRows,
    tableColumns,
    allYears,
    allStates,
    topMetricValue,
    loading,
    error,
    selectedRowIds,
    selectedStates,
    selectedYears,
    tableFilteredStates,
    tableFilteredYears,
    tableSelectedRowIds,
    tableSelectedColumnKeys,
    hiddenTableRowIds,
    hiddenTableColumnKeys,
    tableRowFilterMode,
    tableColumnFilterMode,
    tableSortConfig,
    setSelectedRowIds,
    setSelectedStates,
    setSelectedYears,
    toggleTableStateFilter,
    toggleTableYearFilter,
    clearTableValueFilters,
    toggleTableRowSelection,
    toggleAllVisibleTableRows,
    toggleTableColumnSelection,
    hideSelectedTableRows,
    showOnlySelectedTableRows,
    clearTableRowFilter,
    hideSelectedTableColumns,
    showOnlySelectedTableColumns,
    clearTableColumnFilter,
    setTableSort,
    clearTableSort,
    resetTableView,
    updateRow,
  };
}
