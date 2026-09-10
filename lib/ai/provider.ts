/**
 * The single seam between this app and whichever LLM is behind it.
 *
 * Everything upstream — researchAnswer.ts, the route handler, every component —
 * imports from here and knows nothing about Gemini, Claude, or what comes next.
 * Adding a provider means writing one adapter file and one line in the switch.
 *
 * Default is Gemini because Google AI Studio issues a key with no card and no
 * billing account. Set AI_PROVIDER=anthropic to use Claude instead.
 */

import { AiError, type GenerateArgs } from "./errors";
import { generateStructured as gemini } from "./gemini";
import { generateStructured as anthropic } from "./claude";

export { AiError };
export type { GenerateArgs, ToolSpec } from "./errors";

const PROVIDER = (process.env.AI_PROVIDER || "gemini").toLowerCase();

export function activeProvider(): string {
  return PROVIDER;
}

export function generateStructured<T>(args: GenerateArgs): Promise<T> {
  switch (PROVIDER) {
    case "gemini":
      return gemini<T>(args);
    case "anthropic":
    case "claude":
      return anthropic<T>(args);
    default:
      return Promise.reject(
        new AiError(`Unknown AI_PROVIDER: ${PROVIDER}`, 500),
      );
  }
}
