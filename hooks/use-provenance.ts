"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildDecisionLabel, mergeTimeline } from "@/lib/analytics";
import type {
  AnalyticContext,
  CreateDecisionResponse,
  CreateInteractionResponse,
  DecisionType,
  InteractionPayloadValue,
  TimelineDecision,
  TimelineInteraction,
  TimelineResponse,
  VizState,
} from "@/lib/types";

export function useProvenance(sessionId: string | null) {
  const [interactions, setInteractions] = useState<TimelineInteraction[]>([]);
  const [decisions, setDecisions] = useState<TimelineDecision[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refreshTimeline = useCallback(async () => {
    if (!sessionId) {
      setInteractions([]);
      setDecisions([]);
      return;
    }

    const response = await fetch(`/api/sessions/${sessionId}/timeline`);
    if (!response.ok) {
      throw new Error("Unable to load the timeline.");
    }

    const payload = (await response.json()) as TimelineResponse;
    setInteractions(payload.interactions);
    setDecisions(payload.decisions);
  }, [sessionId]);

  useEffect(() => {
    let isMounted = true;

    async function loadTimeline() {
      try {
        setError(null);
        await refreshTimeline();
      } catch {
        if (isMounted) {
          setError("Unable to load provenance timeline.");
        }
      }
    }

    void loadTimeline();

    return () => {
      isMounted = false;
    };
  }, [refreshTimeline]);

  async function recordInteraction(
    type: TimelineInteraction["type"],
    label: string,
    vizState: VizState,
    payload?: Record<string, InteractionPayloadValue>,
  ) {
    if (!sessionId) {
      return null;
    }

    const response = await fetch(`/api/sessions/${sessionId}/interactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type,
        label,
        payload,
        vizState,
      }),
    });

    if (!response.ok) {
      throw new Error("Unable to record interaction.");
    }

    const result = (await response.json()) as CreateInteractionResponse;
    await refreshTimeline();
    return result.interactionId;
  }

  async function recordDecision({
    source,
    decisionType,
    hypothesisId,
    hypothesisText,
    revisedHypothesisText,
    userExplanation,
    triggerInteractionId,
    context,
  }: {
    source: "interaction_trigger" | "manual_add";
    decisionType: DecisionType;
    hypothesisId?: string;
    hypothesisText: string;
    revisedHypothesisText?: string;
    userExplanation?: string;
    triggerInteractionId?: string;
    context: AnalyticContext;
  }) {
    if (!sessionId) {
      return null;
    }

    const response = await fetch(`/api/sessions/${sessionId}/decisions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source,
        decisionType,
        hypothesisId,
        hypothesisText,
        revisedHypothesisText,
        userExplanation,
        triggerInteractionId,
        context,
      }),
    });

    if (!response.ok) {
      throw new Error("Unable to record decision.");
    }

    const result = (await response.json()) as CreateDecisionResponse;
    await refreshTimeline();
    return result.decisionId;
  }

  const timeline = useMemo(() => mergeTimeline(interactions, decisions), [interactions, decisions]);

  return {
    error,
    interactions,
    decisions,
    timeline,
    recordInteraction,
    recordDecision,
    refreshTimeline,
    buildDecisionLabel,
  };
}
