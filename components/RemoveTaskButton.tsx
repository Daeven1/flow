import { X } from "lucide-react";

// The little red x at the end of a task row. Always visible (hover doesn't exist on a phone).
export default function RemoveTaskButton({ onRemove }: { onRemove: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
      title="Remove task"
      aria-label="Remove task"
      className="p-1 rounded text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors shrink-0"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
