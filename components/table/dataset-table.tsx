import { TABLE_COLUMNS, formatNumber } from "@/lib/analytics";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import {
  TOOL_BUTTON_ACTIVE,
  TOOL_BUTTON_BASE,
  TOOL_BUTTON_DISABLED,
  TOOL_BUTTON_IDLE,
  TOOL_BUTTON_LONG,
  TOOL_BUTTON_MEDIUM,
  TOOL_BUTTON_STYLE,
  TOOL_TITLE_STYLE,
} from "@/components/ui/tool-button-styles";
import type { CrimeDatum, TableSortConfig, TableSortDirection } from "@/lib/types";

function getColumnLabel(columnKey: keyof CrimeDatum) {
  return TABLE_COLUMNS.find((column) => column.key === columnKey)?.label ?? String(columnKey);
}

const TABLE_SELECT_ALL_STYLE = { fontSize: "9px", lineHeight: "10px" } as const;

export function DatasetTable({
  rows,
  columns,
  totalRowCount,
  allStates,
  allYears,
  activeRowIds,
  selectedTableStates,
  selectedTableYears,
  selectedTableRowIds,
  selectedColumnKeys,
  hiddenRowCount,
  hiddenColumnCount,
  tableSortConfig,
  rowFilterActive,
  columnFilterActive,
  onFocusRow,
  onToggleRowSelection,
  onToggleAllVisibleRows,
  onToggleColumnSelection,
  onHideSelectedRows,
  onShowOnlySelectedRows,
  onClearRowFilter,
  onHideSelectedColumns,
  onShowOnlySelectedColumns,
  onClearColumnFilter,
  onSortSelectedColumn,
  onClearSort,
  onResetView,
  onCommitRowUpdate,
  onToggleTableStateFilter,
  onToggleTableYearFilter,
  onClearTableValueFilters,
  onTableStateFilterOpenChange,
  onTableYearFilterOpenChange,
}: {
  rows: CrimeDatum[];
  columns: Array<{ key: keyof CrimeDatum; label: string; editable?: boolean }>;
  totalRowCount: number;
  allStates: string[];
  allYears: number[];
  activeRowIds: string[];
  selectedTableStates: string[];
  selectedTableYears: number[];
  selectedTableRowIds: string[];
  selectedColumnKeys: Array<keyof CrimeDatum>;
  hiddenRowCount: number;
  hiddenColumnCount: number;
  tableSortConfig: TableSortConfig | null;
  rowFilterActive: boolean;
  columnFilterActive: boolean;
  onFocusRow: (rowId: string, state: string) => void;
  onToggleRowSelection: (rowId: string) => void;
  onToggleAllVisibleRows: () => void;
  onToggleColumnSelection: (columnKey: keyof CrimeDatum) => void;
  onHideSelectedRows: () => void;
  onShowOnlySelectedRows: () => void;
  onClearRowFilter: () => void;
  onHideSelectedColumns: () => void;
  onShowOnlySelectedColumns: () => void;
  onClearColumnFilter: () => void;
  onSortSelectedColumn: (direction: TableSortDirection) => void;
  onClearSort: () => void;
  onResetView: () => void;
  onCommitRowUpdate: (rowId: string, key: keyof CrimeDatum, value: string) => void;
  onToggleTableStateFilter: (state: string) => void;
  onToggleTableYearFilter: (year: number) => void;
  onClearTableValueFilters: () => void;
  onTableStateFilterOpenChange: (open: boolean) => void;
  onTableYearFilterOpenChange: (open: boolean) => void;
}) {
  const allVisibleRowsSelected =
    rows.length > 0 && rows.every((row) => selectedTableRowIds.includes(row.id));
  const selectedSortColumnKey = selectedColumnKeys[selectedColumnKeys.length - 1];
  const selectedSortColumnLabel = selectedSortColumnKey ? getColumnLabel(selectedSortColumnKey) : null;
  const disableHideColumns = selectedColumnKeys.length === 0 || selectedColumnKeys.length >= columns.length;
  const valueFilterActive = selectedTableStates.length > 0 || selectedTableYears.length > 0;

  return (
    <div className="flex h-full max-h-[640px] min-h-[640px] flex-col rounded-[24px] border border-slate-200/80 bg-slate-50/85 p-3">
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Raw Dataset Table</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500">
              {rows.length} / {totalRowCount} rows
            </div>
            {hiddenRowCount > 0 ? (
              <div className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                {hiddenRowCount} hidden rows
              </div>
            ) : null}
            {hiddenColumnCount > 0 ? (
              <div className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                {hiddenColumnCount} hidden columns
              </div>
            ) : null}
          </div>
        </div>

        <div className="px-1 py-1">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-[12px] bg-transparent px-1 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
              <span style={TOOL_TITLE_STYLE} className="font-semibold uppercase tracking-[0.18em] text-slate-500">
                Table Operations
              </span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <MultiSelectFilter
              label="State"
              selectedCount={selectedTableStates.length}
              options={allStates.map((state) => ({
                label: state,
                value: state,
                checked: selectedTableStates.includes(state),
              }))}
              onToggle={onToggleTableStateFilter}
              onOpenChange={onTableStateFilterOpenChange}
            />
            <MultiSelectFilter
              label="Year"
              selectedCount={selectedTableYears.length}
              options={allYears.map((year) => ({
                label: String(year),
                value: String(year),
                checked: selectedTableYears.includes(year),
              }))}
              onToggle={(year) => onToggleTableYearFilter(Number(year))}
              onOpenChange={onTableYearFilterOpenChange}
            />
            {valueFilterActive ? (
              <button
                type="button"
                onClick={onClearTableValueFilters}
                style={TOOL_BUTTON_STYLE}
                className={`${TOOL_BUTTON_BASE} ${TOOL_BUTTON_MEDIUM} ${TOOL_BUTTON_ACTIVE}`}
              >
                Clear Filters
              </button>
            ) : null}
              <button
                type="button"
                onClick={onHideSelectedRows}
                disabled={selectedTableRowIds.length === 0}
                style={TOOL_BUTTON_STYLE}
                className={`${TOOL_BUTTON_BASE} ${TOOL_BUTTON_LONG} ${TOOL_BUTTON_IDLE} ${TOOL_BUTTON_DISABLED}`}
              >
                Hide Selected Rows
            </button>
              <button
                type="button"
                onClick={onShowOnlySelectedRows}
                disabled={selectedTableRowIds.length === 0}
                style={TOOL_BUTTON_STYLE}
                className={`${TOOL_BUTTON_BASE} ${TOOL_BUTTON_LONG} ${TOOL_BUTTON_IDLE} ${TOOL_BUTTON_DISABLED}`}
              >
                Only Selected Rows
            </button>
            {rowFilterActive ? (
              <button
                type="button"
                onClick={onClearRowFilter}
                style={TOOL_BUTTON_STYLE}
                className={`${TOOL_BUTTON_BASE} ${TOOL_BUTTON_LONG} ${TOOL_BUTTON_ACTIVE}`}
              >
                Show All Rows
              </button>
            ) : null}
              <button
                type="button"
                onClick={onHideSelectedColumns}
                disabled={disableHideColumns}
                style={TOOL_BUTTON_STYLE}
                className={`${TOOL_BUTTON_BASE} ${TOOL_BUTTON_LONG} ${TOOL_BUTTON_IDLE} ${TOOL_BUTTON_DISABLED}`}
              >
                Hide Selected Columns
            </button>
              <button
                type="button"
                onClick={onShowOnlySelectedColumns}
                disabled={selectedColumnKeys.length === 0}
                style={TOOL_BUTTON_STYLE}
                className={`${TOOL_BUTTON_BASE} ${TOOL_BUTTON_LONG} ${TOOL_BUTTON_IDLE} ${TOOL_BUTTON_DISABLED}`}
              >
                Only Selected Columns
            </button>
            {columnFilterActive ? (
              <button
                type="button"
                onClick={onClearColumnFilter}
                style={TOOL_BUTTON_STYLE}
                className={`${TOOL_BUTTON_BASE} ${TOOL_BUTTON_LONG} ${TOOL_BUTTON_ACTIVE}`}
              >
                Show All Columns
              </button>
            ) : null}
              <button
                type="button"
                onClick={() => onSortSelectedColumn("asc")}
                disabled={!selectedSortColumnKey}
                style={TOOL_BUTTON_STYLE}
                className={`${TOOL_BUTTON_BASE} ${TOOL_BUTTON_MEDIUM} ${TOOL_BUTTON_IDLE} ${TOOL_BUTTON_DISABLED}`}
              >
                {selectedSortColumnLabel ? `Sort ${selectedSortColumnLabel} Asc` : "Sort Asc"}
            </button>
              <button
                type="button"
                onClick={() => onSortSelectedColumn("desc")}
                disabled={!selectedSortColumnKey}
                style={TOOL_BUTTON_STYLE}
                className={`${TOOL_BUTTON_BASE} ${TOOL_BUTTON_MEDIUM} ${TOOL_BUTTON_IDLE} ${TOOL_BUTTON_DISABLED}`}
              >
                {selectedSortColumnLabel ? `Sort ${selectedSortColumnLabel} Desc` : "Sort Desc"}
            </button>
            {tableSortConfig ? (
              <button
                type="button"
                onClick={onClearSort}
                style={TOOL_BUTTON_STYLE}
                className={`${TOOL_BUTTON_BASE} ${TOOL_BUTTON_MEDIUM} ${TOOL_BUTTON_ACTIVE}`}
              >
                Clear Sort
              </button>
            ) : null}
            <button
              type="button"
              onClick={onResetView}
              style={TOOL_BUTTON_STYLE}
              className={`${TOOL_BUTTON_BASE} ${TOOL_BUTTON_MEDIUM} border-slate-900 bg-slate-900 text-white shadow-[0_1px_2px_rgba(15,23,42,0.08)] hover:bg-slate-800 hover:text-white`}
            >
              Reset View
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-100 text-left text-[10px] uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="w-16 px-3 py-2.5 font-semibold">
                <button
                  type="button"
                  onClick={onToggleAllVisibleRows}
                  style={TABLE_SELECT_ALL_STYLE}
                  className={`inline-flex h-7 w-12 items-center justify-center rounded-[9px] font-medium leading-none transition ${
                    allVisibleRowsSelected
                      ? "border border-cyan-200 bg-cyan-50 text-cyan-800"
                      : "border border-slate-200 bg-white text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-slate-300 hover:text-slate-700"
                  }`}
                >
                  {allVisibleRowsSelected ? "Clear" : "All"}
                </button>
              </th>
              {columns.map((column) => {
                const selectedColumn = selectedColumnKeys.includes(column.key);
                const sortedColumn = tableSortConfig?.key === column.key;

                return (
                  <th key={column.key} className="px-3 py-2.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => onToggleColumnSelection(column.key)}
                      className={`inline-flex items-center gap-1.5 -ml-1 rounded-md px-1 py-1 text-left text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
                        selectedColumn
                          ? "bg-cyan-50 text-cyan-800"
                          : "text-slate-500 hover:bg-white hover:text-slate-700"
                      }`}
                    >
                      <span>{column.label}</span>
                      {sortedColumn ? (
                        <span className="text-[9px] font-semibold uppercase tracking-[0.08em]">
                          {tableSortConfig?.direction === "asc" ? "ASC" : "DESC"}
                        </span>
                      ) : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const analysisSelected = activeRowIds.includes(row.id);
              const tableSelected = selectedTableRowIds.includes(row.id);
              const rowTone = analysisSelected
                ? "bg-blue-50/90"
                : tableSelected
                  ? "bg-slate-100"
                  : "hover:bg-slate-50";

              return (
                <tr key={row.id} className={`border-t border-slate-100 transition ${rowTone}`}>
                  <td className="w-16 px-3 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => onToggleRowSelection(row.id)}
                      className={`mx-auto flex h-5 w-5 items-center justify-center rounded border text-[10px] font-bold transition ${
                        tableSelected
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-transparent hover:border-slate-400"
                      }`}
                    >
                      ✓
                    </button>
                  </td>
                  {columns.map((column, columnIndex) => {
                    const rawValue = row[column.key];
                    const value =
                      typeof rawValue === "number" ? formatNumber(rawValue) : String(rawValue);

                    if (column.editable) {
                      return (
                        <td key={column.key} className="px-3 py-2.5">
                          <input
                            key={`${row.id}-${String(column.key)}-${String(rawValue)}`}
                            defaultValue={String(rawValue)}
                            onFocus={() => onFocusRow(row.id, row.State)}
                            onBlur={(event) => {
                              if (event.target.value === String(rawValue)) {
                                return;
                              }

                              onCommitRowUpdate(row.id, column.key, event.target.value);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.currentTarget.blur();
                              }

                              if (event.key === "Escape") {
                                event.currentTarget.value = String(rawValue);
                                event.currentTarget.blur();
                              }
                            }}
                            className="w-24 rounded-lg border border-slate-200 bg-transparent px-2 py-1 text-xs text-slate-700 outline-none focus:border-blue-400"
                          />
                        </td>
                      );
                    }

                    return (
                      <td
                        key={column.key}
                        className={`px-3 py-2.5 ${columnIndex === 0 ? "font-semibold text-slate-800" : "text-slate-600"}`}
                      >
                        <button
                          type="button"
                          onClick={() => onFocusRow(row.id, row.State)}
                          className="text-left"
                        >
                          {value}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 ? (
          <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-slate-500">
            No rows match the current table view. Try resetting the view or clearing some filters.
          </div>
        ) : null}
      </div>
    </div>
  );
}
