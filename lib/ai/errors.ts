/**
 * One error type for every LLM provider.
 *
 * It lives in its own file so that `provider.ts` can import the adapters and the
 * adapters can import the error without a cycle. The route only ever sees this
 * type, so swapping providers never changes error handling upstream.
 */

export class AiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AiError";
    this.status = status;
  }
}

/**
 * What to write in the server log about a provider's error reply. Error
 * bodies can repeat the user's question, so in production only the error code
 * is kept (audit RG-28); in development the start of the body helps debugging.
 */
export function providerErrorForLog(body: string): string {
  if (process.env.NODE_ENV !== "production") return body.slice(0, 500);

  try {
    const parsed = JSON.parse(body) as {
      error?: { status?: string; type?: string; code?: string | number };
    };
    const error = parsed.error;
    return String(error?.status || error?.type || error?.code || "no error code");
  } catch {
    return "error body is not JSON";
  }
}

/** The shape every adapter accepts. Modelled on a tool/function declaration. */
export type ToolSpec = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type GenerateArgs = {
  system: string;
  userMessage: string;
  tool: ToolSpec;
  maxTokens?: number;
  timeoutMs?: number;
  /**
   * Override the provider's default model for this one call. Used by the cheap
   * routing step, which does not need the model that writes the answers.
   */
  model?: string;
};

export type GenerateStreamArgs = GenerateArgs & {
  /**
   * Name of the top-level string property in the tool schema whose value should
   * be reported as it arrives — "answer", here.
   */
  partialField: string;
  /**
   * Called with the WHOLE value so far, not the newest fragment. Cumulative
   * snapshots cost a few hundred extra bytes on a 5-sentence answer and remove
   * every partial-escape and split-token edge case from the client.
   */
  onPartial: (textSoFar: string) => void;
};
