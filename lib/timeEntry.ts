// Earlier entries have opaque IDs and no recorded source. New writers namespace
// their IDs so history can distinguish minutes earned from a replacement total.
export type TimeEntrySource = "focus" | "manual";

export function timeEntryId(source: TimeEntrySource, token: string) {
  return `${source}_${token}`;
}

export function timeEntrySource(id: string): TimeEntrySource | null {
  if (id.startsWith("focus_")) return "focus";
  if (id.startsWith("manual_")) return "manual";
  return null;
}
