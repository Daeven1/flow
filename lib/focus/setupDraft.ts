import { SPECIES, type Species, type Spot } from "@/lib/grove/layout";
import { DEFAULT_LENGTH, LENGTHS, type FocusRule, type PlannedMinutes } from "./session";

export type SetupOptions = {
  length: PlannedMinutes;
  rule: FocusRule | null;
  choice: Species | "TEND";
  spot: Spot | null;
  treeId: string | null;
  customizingPlant: boolean;
};
export type SetupDraft = { taskIds: string[]; choosing: boolean; options: SetupOptions };

export function emptyDraft(): SetupDraft {
  return { taskIds: [], choosing: false, options: {
    length: DEFAULT_LENGTH, rule: null, choice: "WILDFLOWERS", spot: null, treeId: null, customizingPlant: false,
  } };
}

// A setup belongs to the account and workspace in this browser tab. Only save
// IDs and choices; the task list supplies current names and eligibility on return.
const memory = new Map<string, SetupDraft>();
export function readDraft(key: string): SetupDraft {
  if (memory.has(key)) return memory.get(key)!;
  const draft = emptyDraft();
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (!saved || !Array.isArray(saved.taskIds)) return draft;
    draft.taskIds = [...new Set<string>(saved.taskIds.filter((id: unknown) => typeof id === "string" && id.length))];
    if (!draft.taskIds.length) return draft;
    draft.choosing = saved.choosing === true;
    const options = saved.options ?? {};
    if (LENGTHS.includes(options.length)) draft.options.length = options.length;
    if (options.rule === "STRICT" || options.rule === "GENTLE") draft.options.rule = options.rule;
    if (options.choice === "TEND" || SPECIES.includes(options.choice)) draft.options.choice = options.choice;
    if (Number.isInteger(options.spot?.x) && Number.isInteger(options.spot?.y)) {
      draft.options.spot = { x: options.spot.x, y: options.spot.y };
    }
    if (typeof options.treeId === "string") draft.options.treeId = options.treeId;
    draft.options.customizingPlant = options.customizingPlant === true;
  } catch { /* Unavailable storage or an older unreadable draft: use the picker. */ }
  return draft;
}

export function writeDraft(key: string, draft: SetupDraft) {
  try {
    if (draft.taskIds.length) sessionStorage.setItem(key, JSON.stringify(draft));
    else sessionStorage.removeItem(key);
    memory.delete(key);
  } catch {
    memory.set(key, draft);
  }
}
