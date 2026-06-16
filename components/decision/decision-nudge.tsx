"use client";

type DecisionNudgeProps = {
  visible: boolean;
  onOpenDecision: () => void;
  onDismiss: () => void;
};

export function DecisionNudge({ visible, onOpenDecision, onDismiss }: DecisionNudgeProps) {
  return (
    <div
      className={`fixed bottom-20 right-4 z-40 transition-all duration-300 md:bottom-6 md:right-6 lg:right-8 ${
        visible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <div className="w-[22rem] max-w-[calc(100vw-2rem)] rounded-[24px] border border-amber-200 bg-white/95 p-4 shadow-[0_20px_45px_rgba(15,23,42,0.18)] backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 7V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="16" r="1.1" fill="currentColor" />
              <path
                d="M10.29 3.86L1.82 18A2 2 0 0 0 3.53 21h16.94a2 2 0 0 0 1.71-3l-8.47-14.14a2 2 0 0 0-3.42 0Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">
              Possible Decision Point
            </p>
            <h3 className="mt-1 text-sm font-semibold text-slate-900">
              Would you like to record an interpretation?
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              A recent high-signal interaction may be worth capturing while the context is still fresh.
            </p>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenDecision}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Open Decision
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
