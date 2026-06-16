import { createPortal } from "react-dom";

export function ChartTooltip({
  x,
  y,
  title,
  lines,
}: {
  x: number;
  y: number;
  title: string;
  lines: string[];
}) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="pointer-events-none fixed z-[100] min-w-36 rounded-2xl border border-slate-200/90 bg-white/95 px-3 py-2 shadow-[0_14px_28px_rgba(15,23,42,0.12)]"
      style={{
        left: x,
        top: y,
        transform: "translate(2px, 2px)",
      }}
    >
      <p className="text-xs font-semibold text-slate-800">{title}</p>
      {lines.map((line, index) => (
        <p key={`${index}-${line}`} className="mt-1 text-xs text-slate-500">
          {line}
        </p>
      ))}
    </div>,
    document.body,
  );
}
