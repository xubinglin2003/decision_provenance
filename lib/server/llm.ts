import "server-only";

type LlmProvider = "qwen" | "openai-compatible";

type ProviderConfig = {
  provider: LlmProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
};

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type OpenAiCompatibleResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

export type LlmJsonCompletionRequest = {
  systemPrompt: string;
  userPrompt: string;
};

export type LlmCallMetadata = {
  provider: LlmProvider;
  model: string;
  latencyMs: number;
};

function readProviderConfig(): ProviderConfig | null {
  const provider = (process.env.LLM_PROVIDER?.trim() || "qwen") as LlmProvider;
  const model = process.env.LLM_MODEL?.trim();
  const apiKey = process.env.LLM_API_KEY?.trim();
  const baseUrl = process.env.LLM_BASE_URL?.trim();
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? 12000);

  if (!model || !apiKey || !baseUrl) {
    return null;
  }

  if (provider !== "qwen" && provider !== "openai-compatible") {
    return null;
  }

  return {
    provider,
    model,
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 12000,
  };
}

function buildEndpoint(config: ProviderConfig) {
  switch (config.provider) {
    case "qwen":
    case "openai-compatible":
      return `${config.baseUrl}/chat/completions`;
    default:
      return `${config.baseUrl}/chat/completions`;
  }
}

function extractTextContent(content: string | Array<{ type?: string; text?: string }> | undefined) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }

  return "";
}

function buildPayload(config: ProviderConfig, messages: ChatMessage[]) {
  switch (config.provider) {
    case "qwen":
    case "openai-compatible":
      return {
        model: config.model,
        messages,
        temperature: 0.2,
        response_format: {
          type: "json_object",
        },
      };
    default:
      return {
        model: config.model,
        messages,
      };
  }
}

function stripCodeFences(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export function getLlmAvailability() {
  const config = readProviderConfig();

  return {
    configured: config !== null,
    provider: config?.provider,
    model: config?.model,
  };
}

export async function requestStructuredJson(
  request: LlmJsonCompletionRequest,
): Promise<{ content: unknown; metadata: LlmCallMetadata }> {
  const config = readProviderConfig();
  if (!config) {
    throw new Error("LLM provider is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(buildEndpoint(config), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(
        buildPayload(config, [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt },
        ]),
      ),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`LLM request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as OpenAiCompatibleResponse;
    const rawContent = extractTextContent(payload.choices?.[0]?.message?.content);
    if (!rawContent) {
      throw new Error("LLM response did not contain any message content.");
    }

    const parsed = JSON.parse(stripCodeFences(rawContent)) as unknown;

    return {
      content: parsed,
      metadata: {
        provider: config.provider,
        model: config.model,
        latencyMs: Date.now() - startedAt,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("LLM request timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
