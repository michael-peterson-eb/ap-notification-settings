import { useEffect, useMemo, useState } from 'react';
import { Checkbox } from 'components/ui/checkbox';
import { Button } from 'components/ui/button';
import { useCommTemplates } from 'hooks/useCommTemplates';
import { useEverbridgeToken } from 'hooks/useEverbridgeToken';
import { params } from 'utils/consts';
import { usePlanTemplateCategory } from 'hooks/usePlanTemplateCategory';
import { useUpdatePlanTemplateCategory } from 'hooks/useUpdatePlanTemplateCategory';

function csvToSet(csv: string | null | undefined) {
  if (!csv) return new Set<string>();
  return new Set(
    csv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function intersectWithValidIds(input: Set<string>, validIds: Set<string>) {
  const next = new Set<string>();
  //@ts-ignore
  for (const id of input) {
    if (validIds.has(id)) next.add(id);
  }
  return next;
}

export default function Settings() {
  const isDev = process.env.NODE_ENV === 'development';

  const tokenResponse = useEverbridgeToken();
  const commTemplates = useCommTemplates(tokenResponse?.data?.id_token);

  const planCategoryQuery = usePlanTemplateCategory({
    planType: params.id,
    enabled: !!params.id,
    isDev,
  });

  const updateCategory = useUpdatePlanTemplateCategory({
    planTypeId: params.id,
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  // Build set of valid template IDs from API
  const validTemplateIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of commTemplates.data ?? []) ids.add(String(t.id));
    return ids;
  }, [commTemplates.data]);

  // Initialize checkbox state from stored CSV, BUT prune anything not in templates
  useEffect(() => {
    if (planCategoryQuery.isSuccess) {
      const fromCsv = csvToSet(planCategoryQuery.data);
      setSelected(intersectWithValidIds(fromCsv, validTemplateIds));
    }
    // include validTemplateIds so we initialize correctly even if templates arrive after category
  }, [planCategoryQuery.isSuccess, planCategoryQuery.data, validTemplateIds]);

  // If templates change later, prune selection so stale IDs never remain
  useEffect(() => {
    setSelected((prev) => intersectWithValidIds(prev, validTemplateIds));
  }, [validTemplateIds]);

  const toggleTemplate = (id: string) => {
    // ignore toggles for ids that aren't valid (extra safety)
    if (!validTemplateIds.has(id)) return;

    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Selected CSV is now guaranteed to only contain valid template IDs
  const selectedCsv = useMemo(() => Array.from(selected).join(', '), [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = commTemplates.data ?? [];
    if (!q) return list;

    return list.filter((t) => {
      const id = String(t.id);
      const label = String(t.name ?? t.title ?? '');
      return id.toLowerCase().includes(q) || label.toLowerCase().includes(q);
    });
  }, [commTemplates.data, query]);

  const onSave = async () => {
    // save pruned list only
    const csv = Array.from(selected).join(', ');
    await updateCategory.mutateAsync(csv);
  };

  const isLoading = commTemplates.isLoading || planCategoryQuery.isLoading;
  const isError = !!commTemplates.error || !!planCategoryQuery.error;

  if (isLoading) return <div className="p-6">Loading…</div>;
  if (isError) return <div className="p-6 text-red-600">Failed to load</div>;

  return (
    <div className="w-full h-full">
      <div className="flex flex-col gap-2 p-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold text-zinc-900">Plan Comm Templates</h2>
            <div className="text-sm text-zinc-600">Select templates below. Current selection is shown as a CSV string.</div>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-800">
              Selected: <span className="font-semibold">{selected.size}</span>
            </div>

            <Button onClick={onSave} disabled={updateCategory.isPending || !params.id}>
              {updateCategory.isPending ? 'Saving…' : 'Save'}
            </Button>

            <Button variant="outline" onClick={() => setSelected(new Set())} disabled={selected.size === 0 || updateCategory.isPending}>
              Clear
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-2 text-sm font-medium text-zinc-900">Original value</div>
          <textarea
            className="h-20 w-full resize-none rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs text-zinc-800 outline-none focus:ring-1 focus:ring-zinc-300"
            value={planCategoryQuery.data ?? ''}
            readOnly
            placeholder="(none)"
          />
        </div>

        {/* CSV Preview */}
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-2 text-sm font-medium text-zinc-900">Current selection</div>
          <textarea
            className="h-20 w-full resize-none rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs text-zinc-800 outline-none focus:ring-1 focus:ring-zinc-300"
            value={selectedCsv}
            readOnly
            placeholder="(none)"
          />
        </div>

        {/* Search + list */}
        <div className="rounded-lg border border-zinc-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4">
            <input
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-1 focus:ring-zinc-300"
              placeholder="Search templates by name or ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="shrink-0 text-xs text-zinc-500">
              Showing <span className="font-medium text-zinc-700">{filtered.length}</span>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-auto p-2">
            {filtered.map((template) => {
              const id = String(template.id);
              const label = (template.name ?? template.title ?? `Template ${id}`) as string;
              const checked = selected.has(id);

              return (
                <div key={id} className={['mb-2 flex items-start gap-3 rounded-md px-3 py-2', 'hover:bg-zinc-50', checked ? 'bg-zinc-50 ring-1 ring-zinc-200' : ''].join(' ')}>
                  <Checkbox checked={checked} onCheckedChange={() => toggleTemplate(id)} className="mt-1" />

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate text-sm font-medium text-zinc-900">{label}</div>
                      <div className="shrink-0 rounded bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-700">{id}</div>
                    </div>
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && <div className="p-6 text-sm text-zinc-600">No templates match your search.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
