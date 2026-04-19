import { WatchList } from "./WatchList";
import { ReadList } from "./ReadList";

export default function ListsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">Lists</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <WatchList />
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <ReadList />
        </div>
      </div>
    </div>
  );
}
