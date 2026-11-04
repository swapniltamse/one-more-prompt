/** Structured JSON logs: one line per event, so CloudWatch Logs Insights can query them. */
export function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, event, ts: new Date().toISOString(), ...fields });
  if (process.env.NODE_ENV === "test") return;
  (level === "error" ? console.error : console.log)(line);
}
