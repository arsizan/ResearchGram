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
};
