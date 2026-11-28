"use client";

import { useEffect, useSyncExternalStore } from "react";
import { TaskCompletionQueue } from "./taskCompletions";

type Task = { id: string; done: boolean; userId?: string };
const empty: string[] = [];
const queues = new Map<string, TaskCompletionQueue>();
// A request can outlive the Focus page during client navigation.
function queueFor(owner: string) {
  let queue = queues.get(owner);
  if (!queue) {
    queue = new TaskCompletionQueue(owner, () => window.sessionStorage);
    queues.set(owner, queue);
  }
  return queue;
}
const serverSnapshot = () => empty;

export function useTaskCompletions<T extends Task>(owner: string, verifiedTasks: T[] | null, verifiedModeTasks: T[] | null, onSaved: (id: string) => void) {
  const queue = queueFor(owner);
  const ids = useSyncExternalStore(queue.subscribe, queue.snapshot, serverSnapshot);
  useEffect(() => {
    if (verifiedTasks) queue.reconcile(verifiedTasks);
  }, [queue, verifiedTasks]);

  const belongs = (task: T) => task.userId === undefined || task.userId === owner;
  const unsavedTasks = verifiedTasks?.filter(task => belongs(task) && !task.done && ids.includes(task.id)) ?? [];

  async function save(id: string) {
    const saved = await queue.save(id, async () => {
      const response = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: true }),
      });
      return response.ok;
    });
    if (saved) onSaved(id);
  }

  function retry(id: string) {
    if (verifiedTasks?.some(task => belongs(task) && task.id === id && !task.done)) void save(id);
  }

  function completeTask(id: string) {
    const visible = verifiedTasks ?? verifiedModeTasks;
    if (!visible?.some(task => belongs(task) && task.id === id && !task.done)) return;
    queue.remember(id);
    void save(id);
  }

  return { unsavedTasks, completeTask, retry, dismiss: (id: string) => queue.dismiss(id) };
}
