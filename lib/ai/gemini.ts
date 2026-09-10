/**
 * Google Gemini adapter.
 *
 * Uses the native REST endpoint with `responseMimeType: "application/json"` plus
 * a `responseSchema`, which is Gemini's equivalent of forcing a tool call: the
 * model is constrained to emit an object matching the schema rather than asked
 * politely to produce JSON.
 *
 * Plain `fetch`, no SDK — this feature still adds zero npm dependencies.
 *
 * Why Gemini is the default: Google AI Studio issues an API key with no card and
 * no billing account, so the assistant runs at zero cost. `provider.ts` can
 * switch to Claude with one environment variable if that ever changes.
 */

import { AiError, type GenerateArgs } from "./errors";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

/**
 * Gemini's `responseSchema` accepts a subset of OpenAPI 3.0, not all of JSON
 * Schema. Unknown keys are rejected with a 400, so strip everything the schema
 * dialect does not define rather than forwarding our tool schema verbatim.
 */
const ALLOWED_SCHEMA_KEYS = new Set([
  "type",
  "format",
  "description",
  "nullable",
  "enum",
  "items",
  "properties",
  "required",
  "minItems",
  "maxItems",
]);

function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (typeof node !== "object" || node === null) return node;

  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (!ALLOWED_SCHEMA_KEYS.has(key)) continue;

    if (key === "properties" && typeof value === "object" && value !== null) {
      const props: Record<string, unknown> = {};
      for (const [name, child] of Object.entries(
        value as Record<string, unknown>,
      )) {
        props[name] = toGeminiSchema(child);
      }
      out[key] = props;
    } else if (key === "items") {
      out[key] = toGeminiSchema(value);
    } else {
      out[key] = value;
    }
  }

  return out;
}

/**
 * Pull the JSON object out of the model's reply.
 *
 * `responseMimeType` should make this a plain `JSON.parse`. It is wrapped anyway
 * because a model that fences its output in ```json is a bad day, not an outage,
 * and this recovers from it in three lines.
 */
function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");

    if (start === -1 || end <= start) {
      throw new AiError("The model did not return JSON", 502);
    }

    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      throw new AiError("The model returned malformed JSON", 502);
    }
  }
}

type GeminiPart = { text?: string };
type GeminiCandidate = {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
};
type GeminiResponse = {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
};

export async function generateStructured<T>({
  system,
  userMessage,
  tool,
  maxTokens = 4096,
  timeoutMs = 40000,
}: GenerateArgs): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new AiError("GEMINI_API_KEY is not set on the server", 500);
  }

  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
    responseSchema: toGeminiSchema(tool.input_schema),
    maxOutputTokens: maxTokens,
    temperature: 0.2,
  };

  // Gemini 2.5+ models spend output tokens on hidden reasoning, which can eat
  // the whole budget before any answer is written. Only sent when explicitly
  // configured: models that do not accept the field reject the request outright.
  const thinkingBudget = process.env.GEMINI_THINKING_BUDGET;
  if (thinkingBudget !== undefined && thinkingBudget !== "") {
    generationConfig.thinkingConfig = {
      thinkingBudget: Number(thinkingBudget),
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${BASE_URL}/models/${encodeURIComponent(MODEL)}:generateContent`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          // Header rather than ?key= so the key never lands in a URL, and so it
          // stays out of proxy and access logs.
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          generationConfig,
        }),
      },
    );

    if (!response.ok) {
      // Logged for the server, never returned: provider errors echo prompt text.
      const detail = await response.text();
      console.error("GEMINI API ERROR:", response.status, detail.slice(0, 500));
      throw new AiError(`Gemini returned ${response.status}`, response.status);
    }

    const payload = (await response.json()) as GeminiResponse;

    if (payload.promptFeedback?.blockReason) {
      throw new AiError(
        `Gemini blocked the request (${payload.promptFeedback.blockReason})`,
        400,
      );
    }

    const candidate = payload.candidates?.[0];
    const text = (candidate?.content?.parts || [])
      .map((part) => part.text || "")
      .join("")
      .trim();

    if (!text) {
      const reason = candidate?.finishReason || "no candidate";
      console.error("GEMINI EMPTY RESPONSE:", reason);

      if (reason === "MAX_TOKENS") {
        throw new AiError(
          "Gemini ran out of output budget before answering",
          502,
        );
      }

      throw new AiError("Gemini returned no usable content", 502);
    }

    const parsed = parseJsonObject(text);

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new AiError("Gemini did not return the expected structure", 502);
    }

    return parsed as T;
  } catch (error) {
    if (error instanceof AiError) throw error;

    if (error instanceof Error && error.name === "AbortError") {
      throw new AiError("Gemini timed out", 504);
    }

    throw new AiError("Could not reach Gemini", 502);
  } finally {
    clearTimeout(timer);
  }
}
