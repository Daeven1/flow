import { WatchList } from "./WatchList";
import { ReadList } from "./ReadList";

export default function ListsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Lists</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Personal reference lists — things to watch and things to read, outside of your task flow.</p>
      </div>
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
