import { useEffect, useMemo, useState } from 'react';

import { Input } from 'components/input';
import { Button } from 'components/ui/button';
import { Checkbox } from 'components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from 'components/ui/dialog';

import type { CommTemplate } from './types';
import { getTemplateLabel } from './utils';

type AssignTemplatesDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  templates: CommTemplate[];
  initialSelectedIds: string[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (ids: string[]) => Promise<void>;
};

export function AssignTemplatesDialog({ open, title, description, templates, initialSelectedIds, saving, onOpenChange, onSave }: AssignTemplatesDialogProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(new Set(initialSelectedIds));
  }, [initialSelectedIds, open]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return templates;

    return templates.filter((template) => {
      const id = String(template.id).toLowerCase();
      const label = getTemplateLabel(template).toLowerCase();
      return id.includes(normalizedQuery) || label.includes(normalizedQuery);
    });
  }, [query, templates]);

  const toggleTemplate = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <div className="space-y-4">
          <Input placeholder="Search templates by name or ID..." value={query} onChange={(e) => setQuery(e.target.value)} />

          <div className="max-h-[55vh] overflow-auto rounded-md border border-zinc-200 p-2">
            {filtered.map((template) => {
              const id = String(template.id);
              const checked = selected.has(id);

              return (
                <div
                  key={id}
                  className={['mb-2 flex items-start gap-3 rounded-md px-3 py-2', 'hover:bg-zinc-50', checked ? 'bg-zinc-50 ring-1 ring-zinc-200' : ''].join(' ')}>
                  <Checkbox checked={checked} onCheckedChange={() => toggleTemplate(id)} className="mt-1" />

                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <div className="truncate text-sm font-medium text-zinc-900">{getTemplateLabel(template)}</div>
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 ? <div className="p-6 text-sm text-zinc-600">No templates match your search.</div> : null}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-zinc-600">
              Selected: <span className="font-semibold">{selected.size}</span>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelected(new Set())} disabled={selected.size === 0 || saving}>
                Clear
              </Button>

              <Button size="sm" onClick={() => onSave(Array.from(selected))} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

