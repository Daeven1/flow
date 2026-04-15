import { TemplateManager } from "@/components/TemplateManager";

export default function TemplatesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Templates</h1>
        <p className="text-xs text-zinc-500 mt-1">Edit task lists for any template, or create your own.</p>
      </div>
      <TemplateManager />
    </div>
  );
}
