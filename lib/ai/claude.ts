/**
 * Anthropic Claude adapter — the alternative provider.
 *
 * Not the default: the Anthropic Console requires a prepaid credit balance
 * before it will issue a working key, and this project runs on a free tier. Kept
 * because the Messages API's forced tool call is the strongest structured-output
 * guarantee available, so this is the file to switch back to the moment there is
 * a budget. Set AI_PROVIDER=anthropic and it takes over with no other change.
 *
 * Deliberately plain `fetch` against the Messages API rather than the SDK: this
 * feature adds no npm dependency, and the request is small enough that the SDK
 * would only hide it.
 */

import { AiError, type GenerateArgs } from "./errors";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

type ContentBlock = { type: string; name?: string; input?: unknown };

/**
 * Ask Claude to fill in a tool's schema and return that object.
 *
 * Forcing a tool call is how we guarantee valid JSON. Asking for "JSON in your
 * reply" and parsing the text works most of the time, which is worse than
 * something that either works or fails loudly.
 */
export async function generateStructured<T>({
  system,
  userMessage,
  tool,
  maxTokens = 1400,
  timeoutMs = 30000,
  model,
}: GenerateArgs): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const modelId = model || MODEL;

  if (!apiKey) {
    throw new AiError("ANTHROPIC_API_KEY is not set on the server", 500);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        tools: [tool],
        tool_choice: { type: "tool", name: tool.name },
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      // Read the body for the server log, but never hand it to the client:
      // provider errors can echo prompt content.
      const detail = await response.text();
      console.error("CLAUDE API ERROR:", response.status, detail.slice(0, 500));
      throw new AiError(`Claude returned ${response.status}`, response.status);
    }

    const payload = (await response.json()) as { content?: ContentBlock[] };
    const block = (payload.content || []).find(
      (item) => item.type === "tool_use" && item.name === tool.name,
    );

    if (!block || typeof block.input !== "object" || block.input === null) {
      throw new AiError("Claude did not return the expected structure", 502);
    }

    return block.input as T;
  } catch (error) {
    if (error instanceof AiError) throw error;

    if (error instanceof Error && error.name === "AbortError") {
      throw new AiError("Claude timed out", 504);
    }

    throw new AiError("Could not reach Claude", 502);
  } finally {
    clearTimeout(timer);
  }
}
