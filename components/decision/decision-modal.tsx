import { useState } from "react";
import type { DecisionType, Hypothesis } from "@/lib/types";

const DECISION_STYLES: Record<DecisionType, string> = {
  adopt: "bg-emerald-100 text-emerald-700 border-emerald-200",
  reject: "bg-rose-100 text-rose-700 border-rose-200",
  revise: "bg-blue-100 text-blue-700 border-blue-200",
};

export function DecisionModal({
  isOpen,
  hypotheses,
  loading,
  error,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  hypotheses: Hypothesis[];
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (payload: {
    decisionType: DecisionType;
    hypothesisId?: string;
    hypothesisText: string;
    revisedHypothesisText?: string;
    userExplanation?: string;
  }) => void;
}) {
  const [selectedId, setSelectedId] = useState<string>(hypotheses[0]?.id ?? "");
  const [decisionType, setDecisionType] = useState<DecisionType>("adopt");
  const [revisedText, setRevisedText] = useState("");
  const [explanation, setExplanation] = useState("");

  if (!isOpen) {
    return null;
  }

  const selectedHypothesis = hypotheses.find((item) => item.id === selectedId) ?? hypotheses[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[30px] border border-white/80 bg-white/95 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.2)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Decision Modal
            </p>
            <h3 className="mt-1 text-2xl font-semibold text-slate-800">Record Interpretation</h3>
            <p className="mt-1 text-sm text-slate-500">
              Capture the explanation that should be pinned to the provenance timeline.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 px-3 py-2 text-sm text-slate-500"
          >
            Close
          </button>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500">
              Generating candidate hypotheses...
            </div>
          ) : null}

          {!loading && error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {!loading && !error && hypotheses.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500">
              No hypotheses were returned for the current analytic context.
            </div>
          ) : null}

          {!loading && !error
            ? hypotheses.map((hypothesis) => {
                const active = hypothesis.id === selectedId;
                return (
                  <button
                    key={hypothesis.id}
                    type="button"
                    onClick={() => setSelectedId(hypothesis.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      active ? "border-blue-400 bg-blue-50/80" : "border-slate-200 bg-slate-50/70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-medium text-slate-800">{hypothesis.text}</span>
                      <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-500">
                        {(hypothesis.score * 100).toFixed(0)}%
                      </span>
                    </div>
                  </button>
                );
              })
            : null}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {(["adopt", "reject", "revise"] as DecisionType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setDecisionType(type)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold capitalize transition ${
                decisionType === type ? DECISION_STYLES[type] : "border-slate-200 bg-white text-slate-500"
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {decisionType === "revise" ? (
          <textarea
            value={revisedText}
            onChange={(event) => setRevisedText(event.target.value)}
            placeholder="Refine the hypothesis before saving"
            className="mt-5 min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-blue-400"
          />
        ) : null}

        <textarea
          value={explanation}
          onChange={(event) => setExplanation(event.target.value)}
          placeholder="Optional explanation"
          className="mt-4 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-blue-400"
        />

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              onSave({
                decisionType,
                hypothesisId: selectedHypothesis?.id,
                hypothesisText: selectedHypothesis?.text ?? "",
                revisedHypothesisText: decisionType === "revise" ? revisedText : undefined,
                userExplanation: explanation,
              })
            }
            disabled={loading || !!error || hypotheses.length === 0}
            className="rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white"
          >
            Save Decision
          </button>
        </div>
      </div>
    </div>
  );
}
