export const TOOL_BUTTON_BASE =
  "inline-flex h-6 items-center rounded-[9px] border px-2 font-extrabold uppercase tracking-[0.16em] leading-none text-slate-700 transition";
export const TOOL_BUTTON_IDLE =
  "border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-slate-300 hover:text-slate-900";
export const TOOL_BUTTON_ACTIVE =
  "border-cyan-200 bg-cyan-50/90 text-cyan-900 shadow-[0_1px_2px_rgba(6,182,212,0.08)]";
export const TOOL_BUTTON_DISABLED =
  "disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300 disabled:shadow-none";
export const TOOL_BUTTON_STYLE = { fontSize: "9px", lineHeight: "10px", fontWeight: 800 } as const;
export const TOOL_BUTTON_ICON_STYLE = { fontSize: "12px", lineHeight: "12px", fontWeight: 800 } as const;
export const TOOL_TITLE_STYLE = { fontSize: "9px", lineHeight: "10px" } as const;
export const TOOL_BUTTON_SMALL = "w-8 justify-center";
export const TOOL_BUTTON_MEDIUM = "w-24 justify-center";
export const TOOL_BUTTON_LONG = "w-40 justify-center";
