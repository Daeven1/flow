import { expect, test, vi } from "vitest";
import { TaskCompletionQueue } from "./taskCompletions";

function tabStorage() {
  const entries = new Map<string, string>();
  return () => ({
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); },
  });
}

test("a failed or interrupted completion survives reload and retires after manual retry", async () => {
  const storage = tabStorage();
  const first = new TaskCompletionQueue("a", storage);
  first.remember("open-a");
  expect(await first.save("open-a", () => Promise.reject(Error("offline")))).toBe(false);
  first.remember("open-b");
  const restored = new TaskCompletionQueue("a", storage);
  restored.reconcile([{ id: "open-a", done: false }, { id: "open-b", done: false }]);
  expect(restored.snapshot()).toEqual(["open-a", "open-b"]);
  expect(await restored.save("open-a", async () => true)).toBe(true);
  expect(new TaskCompletionQueue("a", storage).snapshot()).toEqual(["open-b"]);
});

test("a fresh task list removes missing and already-finished scoped IDs without replay", () => {
  const storage = tabStorage();
  const queue = new TaskCompletionQueue("a", storage);
  for (const id of ["other-account", "already-done", "missing", "open"]) queue.remember(id);
  queue.reconcile([{ id: "already-done", done: true }, { id: "open", done: false }]);
  expect(new TaskCompletionQueue("a", storage).snapshot()).toEqual(["open"]);
});

test("reopening an acknowledged or dismissed task never recreates its completion", async () => {
  const storage = tabStorage();
  const queue = new TaskCompletionQueue("a", storage);
  queue.remember("reopened"); queue.remember("dismissed");
  await queue.save("reopened", async () => true);
  queue.dismiss("dismissed");
  const restored = new TaskCompletionQueue("a", storage);
  restored.reconcile([{ id: "reopened", done: false }, { id: "dismissed", done: false }]);
  const patch = vi.fn(async () => true);
  expect(await restored.save("reopened", patch)).toBe(false);
  expect(await restored.save("dismissed", patch)).toBe(false);
  expect(patch).not.toHaveBeenCalled();
});

test("multiple retries share one outstanding PATCH per task and persist the intent during it", async () => {
  const storage = tabStorage();
  const queue = new TaskCompletionQueue("a", storage);
  queue.remember("a");
  let release!: (result: boolean) => void;
  const patch = vi.fn(() => new Promise<boolean>((resolve) => { release = resolve; }));
  const saving = queue.save("a", patch);
  expect(queue.snapshot()).toEqual([]);
  expect(new TaskCompletionQueue("a", storage).snapshot()).toEqual(["a"]);
  expect(await queue.save("a", patch)).toBe(false);
  expect(patch).toHaveBeenCalledTimes(1);
  release(false);
  await saving;
  expect(queue.snapshot()).toEqual(["a"]);
});

test("signing into another account preserves the original account's failed in-flight completion", async () => {
  const storage = tabStorage();
  const a = new TaskCompletionQueue("a", storage);
  a.remember("a-task");
  let release!: (ok: boolean) => void;
  const saving = a.save("a-task", () => new Promise<boolean>(resolve => { release = resolve; }));
  const b = new TaskCompletionQueue("b", storage);
  b.reconcile([{ id: "b-task", userId: "b", done: false }]);
  b.remember("b-task");
  release(false);
  await saving;
  expect(b.snapshot()).toEqual(["b-task"]);
  expect(new TaskCompletionQueue("a", storage).snapshot()).toEqual(["a-task"]);
  await a.save("a-task", async () => true);
  expect(new TaskCompletionQueue("b", storage).snapshot()).toEqual(["b-task"]);
});

test("legacy completions migrate only when an account's task row confirms ownership", () => {
  const storage = tabStorage();
  const legacy = "grove-focus-unsaved-tasks";
  storage().setItem(legacy, JSON.stringify(["a-open", "a-done", "b-open", "unmatched", "no-owner"]));
  const a = new TaskCompletionQueue("a", storage);
  a.reconcile([{ id: "a-open", userId: "a", done: false }, { id: "a-done", userId: "a", done: true },
    { id: "no-owner", done: false }]);
  expect(a.snapshot()).toEqual(["a-open"]);
  expect(JSON.parse(storage().getItem(legacy)!)).toEqual(["b-open", "unmatched", "no-owner"]);
  const b = new TaskCompletionQueue("b", storage);
  b.reconcile([{ id: "b-open", userId: "b", done: false }]);
  expect(b.snapshot()).toEqual(["b-open"]);
  expect(new TaskCompletionQueue("a", storage).snapshot()).toEqual(["a-open"]);
  expect(JSON.parse(storage().getItem(legacy)!)).toEqual(["unmatched", "no-owner"]);
});

test("a mismatched account response and a storage failure both preserve recoverable entries", () => {
  const storage = tabStorage();
  const legacy = "grove-focus-unsaved-tasks";
  storage().setItem(legacy, JSON.stringify(["a-task", "b-task"]));
  const a = new TaskCompletionQueue("a", storage);
  a.remember("a-other");
  a.reconcile([{ id: "b-task", userId: "b", done: false }]);
  expect(a.snapshot()).toEqual(["a-other"]);
  const full = new TaskCompletionQueue("a", () => ({
    ...storage(), setItem: () => { throw new Error("quota"); },
  }));
  full.reconcile([{ id: "a-task", userId: "a", done: false }]);
  expect(full.snapshot()).toEqual(["a-task"]);
  expect(JSON.parse(storage().getItem(legacy)!)).toEqual(["a-task", "b-task"]);
});
