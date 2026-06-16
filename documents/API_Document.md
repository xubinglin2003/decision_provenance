
---

# API Interface Documentation

## 1. Session API

|Method|Endpoint|Purpose|Request Body / Params|Response|
|---|---|---|---|---|
|POST|`/api/sessions`|Create a new analysis session when the user opens the system|Body: `{ datasetId }`|`{ sessionId, datasetId, createdAt }`|

### Example request

```json
{
  "datasetId": "sales_demo"
}
```

### Example response

```json
{
  "sessionId": "sess_001",
  "datasetId": "sales_demo",
  "createdAt": "2026-04-08T15:00:00Z"
}
```

---

## 2. Dataset API

|Method|Endpoint|Purpose|Request Body / Params|Response|
|---|---|---|---|---|
|GET|`/api/datasets/:datasetId/rows`|Load raw dataset rows for visualization and table view|Query: `page`, `pageSize`, `sortBy`, `sortOrder`, optional filters|`{ rows, total }`|

### Example request

```text
GET /api/datasets/sales_demo/rows?page=1&pageSize=100
```

### Example response

```json
{
  "rows": [
    {
      "id": "r_1",
      "date": "2025-01-01",
      "region": "US",
      "category": "A",
      "sales": 1200,
      "cluster": "B"
    }
  ],
  "total": 1200
}
```

---

## 3. Interaction API

This API records user interactions such as filtering, zooming, selecting, clustering, and comparing. These interaction events form the upper layer of the provenance timeline.

|Method|Endpoint|Purpose|Request Body / Params|Response|
|---|---|---|---|---|
|POST|`/api/sessions/:sessionId/interactions`|Store one interaction event during analysis|Body: interaction event object|`{ interactionId, stored }`|

### Request body fields

|Field|Type|Required|Description|
|---|---|---|---|
|`type`|string|Yes|Interaction type, e.g. `filter`, `zoom`, `select`, `cluster`, `compare`|
|`label`|string|Yes|Human-readable label for timeline display|
|`payload`|object|No|Detailed interaction payload|
|`vizState`|object|Yes|Visualization state at the time of interaction|
|`timestamp`|string|No|ISO timestamp; backend can also generate it|

### Example request

```json
{
  "type": "filter",
  "label": "Filter: Region = US",
  "payload": {
    "field": "region",
    "operator": "=",
    "value": "US"
  },
  "vizState": {
    "filters": {
      "region": "US"
    },
    "selectedDataIds": [],
    "activeView": "scatter"
  },
  "timestamp": "2026-04-08T15:10:12Z"
}
```

### Example response

```json
{
  "interactionId": "evt_001",
  "stored": true
}
```

---

## 4. Hypothesis Generation API

This API supports the shared decision pipeline. It is used both when a key interaction triggers decision recording and when the user manually clicks “Manual Add.” The backend gathers current analytic context and returns candidate explanations for the Decision Modal.

|Method|Endpoint|Purpose|Request Body / Params|Response|
|---|---|---|---|---|
|POST|`/api/sessions/:sessionId/hypotheses/generate`|Generate candidate hypotheses based on current analytic context|Body: `{ source, triggerInteractionId?, context }`|`{ hypotheses, contextSummary }`|

### Request body fields

|Field|Type|Required|Description|
|---|---|---|---|
|`source`|string|Yes|Entry source: `interaction_trigger` or `manual_add`|
|`triggerInteractionId`|string|No|Present when triggered by a key interaction|
|`context`|object|Yes|Current analytic context including viz state, selected data, and recent interactions|

### Example request

```json
{
  "source": "interaction_trigger",
  "triggerInteractionId": "evt_001",
  "context": {
    "vizState": {
      "filters": {
        "region": "US"
      },
      "selectedDataIds": ["r_11", "r_23", "r_44"],
      "activeView": "scatter"
    },
    "recentInteractions": [
      {
        "id": "evt_000",
        "type": "load_data",
        "label": "Load dataset"
      },
      {
        "id": "evt_001",
        "type": "filter",
        "label": "Filter: Region = US"
      }
    ],
    "tableSelection": ["r_11", "r_23", "r_44"]
  }
}
```

### Example response

```json
{
  "hypotheses": [
    {
      "id": "hyp_001",
      "text": "Sales decline may be associated with seasonal demand.",
      "source": "llm",
      "score": 0.84
    },
    {
      "id": "hyp_002",
      "text": "The selected cluster may reflect region-specific underperformance.",
      "source": "llm",
      "score": 0.78
    },
    {
      "id": "hyp_003",
      "text": "The pattern may indicate a temporary anomaly rather than a persistent trend.",
      "source": "llm",
      "score": 0.69
    }
  ],
  "contextSummary": {
    "activeView": "scatter",
    "selectedCount": 3,
    "filtersApplied": 1
  }
}
```

---

## 5. Decision API

This API stores structured decision events such as adopt, reject, and revise. These decision events form the lower layer of the provenance timeline and are linked to analytic context and, when available, the triggering interaction.

|Method|Endpoint|Purpose|Request Body / Params|Response|
|---|---|---|---|---|
|POST|`/api/sessions/:sessionId/decisions`|Submit and store a decision event from the Decision Modal|Body: decision event object|`{ decisionId, stored, timestamp }`|

### Request body fields

|Field|Type|Required|Description|
|---|---|---|---|
|`source`|string|Yes|`interaction_trigger` or `manual_add`|
|`triggerInteractionId`|string|No|Related interaction event id if available|
|`decisionType`|string|Yes|`adopt`, `reject`, or `revise`|
|`hypothesisId`|string|No|Selected hypothesis id|
|`hypothesisText`|string|Yes|Original hypothesis text|
|`revisedHypothesisText`|string|No|Required when `decisionType = revise`|
|`userExplanation`|string|No|Optional user-provided rationale|
|`context`|object|Yes|Visualization state and other context at decision time|
|`timestamp`|string|No|ISO timestamp; backend can also generate it|

### Example request

```json
{
  "source": "interaction_trigger",
  "triggerInteractionId": "evt_001",
  "decisionType": "adopt",
  "hypothesisId": "hyp_001",
  "hypothesisText": "Sales decline may be associated with seasonal demand.",
  "userExplanation": "The same pattern appears in similar months from previous records.",
  "context": {
    "vizState": {
      "filters": {
        "region": "US"
      },
      "selectedDataIds": ["r_11", "r_23", "r_44"],
      "activeView": "scatter"
    }
  },
  "timestamp": "2026-04-08T15:11:20Z"
}
```

### Example response

```json
{
  "decisionId": "dec_001",
  "stored": true,
  "timestamp": "2026-04-08T15:11:20Z"
}
```

---

## 6. Timeline API

This API returns the provenance timeline used in the bottom panel. It combines interaction events and decision events into one response so the frontend can easily refresh the timeline after a new decision is stored.

|Method|Endpoint|Purpose|Request Body / Params|Response|
|---|---|---|---|---|
|GET|`/api/sessions/:sessionId/timeline`|Load the full provenance timeline for a session|Path param: `sessionId`|`{ interactions, decisions }`|

### Example response

```json
{
  "interactions": [
    {
      "id": "evt_000",
      "type": "load_data",
      "label": "Load dataset",
      "timestamp": "2026-04-08T15:00:05Z"
    },
    {
      "id": "evt_001",
      "type": "filter",
      "label": "Filter: Region = US",
      "timestamp": "2026-04-08T15:10:12Z"
    }
  ],
  "decisions": [
    {
      "id": "dec_001",
      "triggerInteractionId": "evt_001",
      "decisionType": "adopt",
      "hypothesisText": "Sales decline may be associated with seasonal demand.",
      "timestamp": "2026-04-08T15:11:20Z"
    }
  ]
}
```

---

## 7. Timeline Inspection API

This API supports retrospective inspection when the user clicks a node in the timeline. It returns the interaction context, candidate hypotheses, final decision, and analytic state for that node. This matches your design where timeline inspection can happen at any time after the main interface is rendered.

|Method|Endpoint|Purpose|Request Body / Params|Response|
|---|---|---|---|---|
|GET|`/api/sessions/:sessionId/timeline/:nodeId`|Get detailed information for one timeline node|Path params: `sessionId`, `nodeId`|Detailed inspection object|

### Example response

```json
{
  "nodeId": "dec_001",
  "nodeType": "decision",
  "interaction": {
    "id": "evt_001",
    "type": "filter",
    "label": "Filter: Region = US",
    "timestamp": "2026-04-08T15:10:12Z"
  },
  "candidateHypotheses": [
    {
      "id": "hyp_001",
      "text": "Sales decline may be associated with seasonal demand."
    },
    {
      "id": "hyp_002",
      "text": "The selected cluster may reflect region-specific underperformance."
    }
  ],
  "finalDecision": {
    "id": "dec_001",
    "decisionType": "adopt",
    "hypothesisId": "hyp_001",
    "hypothesisText": "Sales decline may be associated with seasonal demand.",
    "userExplanation": "The same pattern appears in similar months from previous records."
  },
  "analyticContext": {
    "vizState": {
      "filters": {
        "region": "US"
      },
      "selectedDataIds": ["r_11", "r_23", "r_44"],
      "activeView": "scatter"
    }
  }
}
```

---

# Summary of Final API List

|Method|Endpoint|Purpose|
|---|---|---|
|POST|`/api/sessions`|Create a session|
|GET|`/api/datasets/:datasetId/rows`|Load dataset rows|
|POST|`/api/sessions/:sessionId/interactions`|Store interaction event|
|POST|`/api/sessions/:sessionId/hypotheses/generate`|Generate candidate hypotheses|
|POST|`/api/sessions/:sessionId/decisions`|Store decision event|
|GET|`/api/sessions/:sessionId/timeline`|Load full provenance timeline|
|GET|`/api/sessions/:sessionId/timeline/:nodeId`|Load one node’s inspection details|

---

# Suggested Frontend Usage Order

|Scenario|API Call Order|
|---|---|
|Initial load|`POST /api/sessions` → `GET /api/datasets/:datasetId/rows` → `GET /api/sessions/:sessionId/timeline`|
|Normal interaction, no trigger|`POST /api/sessions/:sessionId/interactions`|
|Interaction-triggered decision|`POST /interactions` → `POST /hypotheses/generate` → `POST /decisions` → `GET /timeline`|
|Manual Add|`POST /hypotheses/generate` with `source=manual_add` → `POST /decisions` → `GET /timeline`|
|Timeline inspection|`GET /timeline/:nodeId`|

---
