"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  TOOL_BUTTON_ACTIVE,
  TOOL_BUTTON_BASE,
  TOOL_BUTTON_IDLE,
  TOOL_BUTTON_MEDIUM,
  TOOL_BUTTON_STYLE,
} from "@/components/ui/tool-button-styles";

type MultiSelectOption = {
  label: string;
  value: string;
  checked: boolean;
};

type MultiSelectAllOption = {
  label: string;
  checked: boolean;
  onToggle: () => void;
};

export function MultiSelectFilter({
  label,
  selectedCount,
  options,
  onToggle,
  allOption,
  onOpenChange,
  widthClassName = TOOL_BUTTON_MEDIUM,
}: {
  label: string;
  selectedCount: number;
  options: MultiSelectOption[];
  onToggle: (value: string) => void;
  allOption?: MultiSelectAllOption;
  onOpenChange?: (open: boolean) => void;
  widthClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const updateOpen = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange],
  );

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        updateOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [updateOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => updateOpen(!open)}
        style={TOOL_BUTTON_STYLE}
        className={`${TOOL_BUTTON_BASE} ${widthClassName} justify-between gap-2 ${
          open || selectedCount > 0 ? TOOL_BUTTON_ACTIVE : TOOL_BUTTON_IDLE
        }`}
      >
        <span>
          {label}
          {selectedCount > 0 ? ` (${selectedCount})` : ""}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
        >
          <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+8px)] z-20 max-h-72 w-56 overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_36px_rgba(15,23,42,0.12)]">
          {allOption ? (
            <>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-semibold text-slate-800 transition hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={allOption.checked}
                  onChange={allOption.onToggle}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                />
                <span>{allOption.label}</span>
              </label>
              <div className="mx-2 my-1 h-px bg-slate-100" />
            </>
          ) : null}
          {options.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-[13px] text-slate-700 transition hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={option.checked}
                onChange={() => onToggle(option.value)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
