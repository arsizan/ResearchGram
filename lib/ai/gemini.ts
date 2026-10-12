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
 *
 * GEMINI_MODEL is a LIST, not a name. Free-tier quota is counted per model per
 * day and the numbers differ by more than an order of magnitude, so running out
 * on one model is not a reason to stop — it is a reason to use the next one.
 */

import {
  AiError,
  providerErrorForLog,
  type GenerateArgs,
  type GenerateStreamArgs,
} from "./errors";
import {
  availableModels,
  markRateLimited,
  parseModelChain,
  parseRetryAfterSeconds,
} from "./modelRotation";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/**
 * flash-lite rather than flash on purpose: on the free tier flash allows 20
 * requests a day and flash-lite allows 500, for a job that is summarising
 * abstracts rather than doing hard reasoning.
 */
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

const MODEL_CHAIN = parseModelChain(process.env.GEMINI_MODEL, DEFAULT_MODEL);

function chainFor(override?: string): string[] {
  return override ? parseModelChain(override, DEFAULT_MODEL) : MODEL_CHAIN;
}

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
  "propertyOrdering",
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

      // Gemini generates properties in whatever order it likes unless told
      // otherwise, and the streaming path can only show text once the field it
      // is watching has started. If "answer" came last, the panel sat on
      // "Writing the answer…" for the whole call and then everything appeared
      // at once — exactly what streaming was added to prevent. Declaration
      // order is the order we want, so pass it through.
      out.propertyOrdering = Object.keys(props);
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

function requireKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AiError("GEMINI_API_KEY is not set on the server", 500);
  }
  return apiKey;
}

function buildGenerationConfig(
  tool: GenerateArgs["tool"],
  maxTokens: number,
): Record<string, unknown> {
  const config: Record<string, unknown> = {
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
    config.thinkingConfig = { thinkingBudget: Number(thinkingBudget) };
  }

  return config;
}

/**
 * Record the quota failure and turn it into an AiError.
 *
 * Split out because the two call paths must treat a 429 identically — the whole
 * rotation depends on the cooldown being written exactly once, wherever the 429
 * surfaced.
 */
async function toApiError(
  response: Response,
  modelId: string,
  label: string,
): Promise<AiError> {
  // Read the body for the log, never for the client: provider errors echo
  // prompt content back, so production logs keep only the error code.
  const detail = await response.text();
  console.error(`${label}:`, response.status, providerErrorForLog(detail));

  if (response.status === 429) {
    markRateLimited(
      modelId,
      parseRetryAfterSeconds(detail, response.headers.get("retry-after")),
    );
  }

  return new AiError(`Gemini returned ${response.status}`, response.status);
}

/**
 * Try each model in turn, moving on only when one is out of quota.
 *
 * Any other failure — a bad schema, a blocked prompt, a timeout — would fail the
 * same way on the next model, so it stops immediately rather than burning the
 * rest of the chain to arrive at the same error three times slower.
 */
async function withRotation<T>(
  chain: string[],
  attempt: (modelId: string) => Promise<T>,
): Promise<T> {
  const candidates = availableModels(chain);
  let lastError: AiError = new AiError("No Gemini model available", 502);

  for (const modelId of candidates) {
    try {
      return await attempt(modelId);
    } catch (error) {
      if (!(error instanceof AiError)) throw error;

      lastError = error;
      if (error.status !== 429) throw error;
    }
  }

  throw lastError;
}

export async function generateStructured<T>({
  system,
  userMessage,
  tool,
  maxTokens = 4096,
  timeoutMs = 20000,
  model,
}: GenerateArgs): Promise<T> {
  const apiKey = requireKey();

  return withRotation(chainFor(model), async (modelId) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        `${BASE_URL}/models/${encodeURIComponent(modelId)}:generateContent`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            // Header rather than ?key= so the key never lands in a URL, and so
            // it stays out of proxy and access logs.
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: userMessage }] }],
            generationConfig: buildGenerationConfig(tool, maxTokens),
          }),
        },
      );

      if (!response.ok) {
        throw await toApiError(response, modelId, "GEMINI API ERROR");
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
        console.error("GEMINI EMPTY RESPONSE:", modelId, reason);

        throw new AiError(
          reason === "MAX_TOKENS"
            ? "Gemini ran out of output budget before answering"
            : "Gemini returned no usable content",
          502,
        );
      }

      const parsed = parseJsonObject(text);

      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
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
  });
}

/**
 * Extract the value of one top-level string property out of JSON that is still
 * arriving.
 *
 * `JSON.parse` cannot help: until the final brace the document is invalid. So
 * this walks the prefix looking for `"<field>"` followed by a string literal and
 * decodes as much of that literal as has turned up, handling escapes so a
 * half-written `\uXXXX` never reaches the screen as mojibake.
 *
 * Returns "" when the field has not started yet, which is the correct thing to
 * show at that point.
 */
export function extractPartialString(prefix: string, field: string): string {
  const key = `"${field}"`;
  const keyAt = prefix.indexOf(key);
  if (keyAt === -1) return "";

  let i = keyAt + key.length;

  // Skip whitespace, the colon, more whitespace, then require the opening quote.
  while (i < prefix.length && /\s/.test(prefix[i])) i += 1;
  if (prefix[i] !== ":") return "";
  i += 1;
  while (i < prefix.length && /\s/.test(prefix[i])) i += 1;
  if (prefix[i] !== '"') return "";
  i += 1;

  let out = "";

  while (i < prefix.length) {
    const char = prefix[i];

    if (char === '"') return out; // string closed — this is the final value
    if (char !== "\\") {
      out += char;
      i += 1;
      continue;
    }

    // An escape that has not fully arrived: stop, rather than emit half of it.
    if (i + 1 >= prefix.length) return out;

    const next = prefix[i + 1];

    if (next === "u") {
      const hex = prefix.slice(i + 2, i + 6);
      if (hex.length < 4) return out;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 6;
      continue;
    }

    const simple: Record<string, string> = {
      n: "\n",
      t: "\t",
      r: "\r",
      b: "\b",
      f: "\f",
      '"': '"',
      "\\": "\\",
      "/": "/",
    };

    out += simple[next] ?? next;
    i += 2;
  }

  return out;
}

/**
 * Same request, streamed.
 *
 * The wait is the worst thing about this feature: the user stares at a spinner
 * for the better part of twenty seconds and then everything appears at once.
 * Streaming does not make it faster — it makes the answer visible while it is
 * being written, which is the part people actually feel.
 *
 * `onPartial` is called with the answer text so far. Everything else — the
 * citations, the follow-ups — is only valid once the document closes, so the
 * fully parsed object is still what gets returned.
 */
export async function generateStructuredStream<T>({
  system,
  userMessage,
  tool,
  maxTokens = 4096,
  timeoutMs = 20000,
  model,
  partialField,
  onPartial,
}: GenerateStreamArgs): Promise<T> {
  const apiKey = requireKey();

  return withRotation(chainFor(model), async (modelId) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        `${BASE_URL}/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: userMessage }] }],
            generationConfig: buildGenerationConfig(tool, maxTokens),
          }),
        },
      );

      if (!response.ok) {
        throw await toApiError(response, modelId, "GEMINI STREAM ERROR");
      }

      if (!response.body) {
        throw new AiError("Gemini returned no stream", 502);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";
      let json = "";
      let lastSent = "";
      let finishReason = "";

      // Server-sent events: blank-line-separated records whose payload lines
      // start with "data: ". Chunks split anywhere, so hold the tail until it
      // completes.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newline = buffer.indexOf("\n");
        while (newline !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");

          if (!line.startsWith("data:")) continue;

          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;

          let chunk: GeminiResponse;
          try {
            chunk = JSON.parse(payload) as GeminiResponse;
          } catch {
            // A record we cannot read is not a reason to lose the ones we can.
            continue;
          }

          if (chunk.promptFeedback?.blockReason) {
            throw new AiError(
              `Gemini blocked the request (${chunk.promptFeedback.blockReason})`,
              400,
            );
          }

          const candidate = chunk.candidates?.[0];
          if (candidate?.finishReason) finishReason = candidate.finishReason;

          json += (candidate?.content?.parts || [])
            .map((part) => part.text || "")
            .join("");

          const soFar = extractPartialString(json, partialField);
          if (soFar !== lastSent) {
            lastSent = soFar;
            onPartial(soFar);
          }
        }
      }

      if (!json.trim()) {
        console.error(
          "GEMINI STREAM EMPTY:",
          modelId,
          finishReason || "no candidate",
        );
        throw new AiError(
          finishReason === "MAX_TOKENS"
            ? "Gemini ran out of output budget before answering"
            : "Gemini returned no usable content",
          502,
        );
      }

      try {
        const parsed = parseJsonObject(json);

        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          throw new AiError("Gemini did not return the expected structure", 502);
        }

        return parsed as T;
      } catch (error) {
        // The document never closed — the model hit MAX_TOKENS mid-sentence, or
        // the connection dropped. The user has been watching this text arrive
        // for the last ten seconds; throwing it away and showing a red error box
        // instead is the worst of both. Hand back what was written. Everything
        // else is absent, which is correct: no citations were claimed, so none
        // are shown.
        const salvaged = extractPartialString(json, partialField);

        if (!salvaged.trim()) throw error;

        console.warn(
          `GEMINI STREAM TRUNCATED on ${modelId} (${finishReason || "no finishReason"}) — keeping ${salvaged.length} chars`,
        );

        return { [partialField]: salvaged } as T;
      }
    } catch (error) {
      if (error instanceof AiError) throw error;

      if (error instanceof Error && error.name === "AbortError") {
        throw new AiError("Gemini timed out", 504);
      }

      throw new AiError("Could not reach Gemini", 502);
    } finally {
      clearTimeout(timer);
    }
  });
}
