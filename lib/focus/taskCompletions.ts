const LEGACY_KEY = "grove-focus-unsaved-tasks";
type StorageAccess = () => Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Task = { id: string; done: boolean; userId?: string };

/** Only outstanding task IDs live in this tab. Session ticks are never replayed. */
export class TaskCompletionQueue {
  private key: string;
  private pending: Set<string>;
  private saving = new Set<string>();
  private listeners = new Set<() => void>();
  private available: string[] = [];

  constructor(private owner: string, private storage: StorageAccess) {
    this.key = `${LEGACY_KEY}:${owner}`;
    this.pending = this.read(this.key);
    this.available = [...this.pending];
  }

  private read(key: string): Set<string> {
    try {
      const saved: unknown = JSON.parse(this.storage().getItem(key) ?? "[]");
      if (Array.isArray(saved)) {
        return new Set(saved.filter((id): id is string => typeof id === "string" && id.length > 0));
      }
    } catch {
      // Storage can be unavailable. The open tab still holds its retry list.
    }
    return new Set();
  }

  snapshot = () => this.available;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private write(key: string, entries: Set<string>): boolean {
    try {
      if (entries.size) this.storage().setItem(key, JSON.stringify([...entries]));
      else this.storage().removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  private publish() {
    const saved = this.write(this.key, this.pending);
    this.available = [...this.pending].filter(id => !this.saving.has(id));
    this.listeners.forEach(listener => listener());
    return saved;
  }

  remember(id: string) {
    if (this.pending.has(id)) return;
    this.pending.add(id);
    this.publish();
  }

  dismiss(id: string) {
    if (this.pending.delete(id)) this.publish();
  }

  reconcile(tasks: Task[]) {
    if (tasks.some(task => task.userId !== undefined && task.userId !== this.owner)) return;
    const open = new Set(tasks.filter(task => !task.done).map(task => task.id));
    let changed = false;
    for (const id of this.pending) {
      if (!open.has(id)) { this.pending.delete(id); changed = true; }
    }
    // Legacy entries have no owner. Retire or adopt only IDs confirmed by this account's task rows.
    const legacy = this.read(LEGACY_KEY);
    let migrated = false;
    for (const task of tasks) {
      if (task.userId !== this.owner || !legacy.delete(task.id)) continue;
      if (!task.done) this.pending.add(task.id);
      migrated = true;
    }
    if (changed || migrated) {
      const saved = this.publish();
      if (migrated && saved) this.write(LEGACY_KEY, legacy);
    }
  }

  async save(id: string, patch: () => Promise<boolean>): Promise<boolean> {
    if (!this.pending.has(id) || this.saving.has(id)) return false;
    this.saving.add(id);
    this.publish();
    try {
      if (!(await patch())) return false;
      this.pending.delete(id);
      return true;
    } catch {
      return false;
    } finally {
      this.saving.delete(id);
      this.publish();
    }
  }
}
