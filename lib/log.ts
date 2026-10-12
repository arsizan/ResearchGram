/*
 * Developer logging for the browser (audit RG-28). Messages are printed while
 * developing (`npm run dev`) and dropped in production, so users' consoles do
 * not show database details, and nothing personal ends up in shared logs.
 */

const showLogs = process.env.NODE_ENV !== "production";

export function logDev(label: string, ...details: unknown[]) {
  if (showLogs) {
    console.log(label, ...details);
  }
}
