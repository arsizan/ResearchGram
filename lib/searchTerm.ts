/**
 * Makes typed text safe to place inside a PostgREST or() filter (audit RG-16).
 *
 * In `full_name.ilike.%TEXT%,email.ilike.%TEXT%` a comma, parenthesis, quote or
 * backslash in TEXT can close the condition and add new ones; % _ * are wildcards.
 * All of them become spaces. Letters, digits, spaces, dots, @ and - stay, which is
 * everything a name, department or email search needs.
 */
export function safeFilterTerm(input: string, maxLength = 60) {
  return input
    .replace(/[,()"'\\%_*:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
