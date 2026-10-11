/**
 * One password rule for sign-up and password reset (audit RG-14).
 *
 * Keep it identical to Supabase Dashboard -> Authentication -> Sign In / Providers
 * -> Email: "Minimum password length" 8 and "Password requirements" lowercase,
 * uppercase letters and digits. The dashboard setting is what actually protects
 * the account; this check only gives the user a clear message before the request.
 */
export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_HINT =
  "At least 8 characters, with an uppercase letter, a lowercase letter and a number.";

/** Returns what is wrong with the password, or "" when it is acceptable. */
export function passwordProblem(password: string): string {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[A-Z]/.test(password)) return "Add at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Add at least one lowercase letter.";
  if (!/[0-9]/.test(password)) return "Add at least one number.";
  return "";
}
