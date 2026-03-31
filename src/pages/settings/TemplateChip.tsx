import { X } from 'lucide-react';

type TemplateChipProps = {
  label: string;
  disabled?: boolean;
  onRemove?: () => void;
};

export function TemplateChip({ label, disabled = false, onRemove }: TemplateChipProps) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-zinc-200 bg-[#ECEEF2] px-2 py-1 text-sm font-medium text-[#030213]">
      <span className="truncate">{label}</span>
      {onRemove ? (
        <button
          type="button"
          className="rounded-full text-zinc-500 transition-colors hover:text-zinc-900 disabled:cursor-not-allowed disabled:text-zinc-300"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${label}`}>
          <X className="h-3.5 w-3.5" color="#030213" />
        </button>
      ) : null}
    </span>
  );
}

