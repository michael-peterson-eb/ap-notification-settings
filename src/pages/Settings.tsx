import { useEffect, useMemo, useState } from 'react';
import { Checkbox } from 'components/ui/checkbox';
import { Button } from 'components/ui/button';
import { useCommTemplates } from 'hooks/useCommTemplates';
import { useEverbridgeToken } from 'hooks/useEverbridgeToken';
import { usePlanTemplateCategory } from 'hooks/usePlanTemplateCategory';
import { useUpdatePlanTemplateCategory } from 'hooks/useUpdatePlanTemplateCategory';
import { useEverbridgeSettingsRow } from 'hooks/useEverbridgeSettingsRow';
import { useToasts } from 'hooks/useToasts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Input } from 'components/input';
import Field from 'components/Field';

type FormState = {
  eb_client_id: string;
  eb_client_secret: string;
  eb_username: string;
  eb_user_password: string;
  eb_role_id: string;
};

type PlanType = {
  id: number;
  name: string;
};

type Target =
  | { kind: 'default' }
  | { kind: 'plan'; planTypeId: number };

/**
 * Safe wrapper for rbf_selectQuery that ensures the Promise settles.
 * Maps the raw values via `map` and rejects on timeout or errors.
 */
function rbfSelectQueryPromise<T>(
  sql: string,
  limit: number,
  map: (rows: any[]) => T,
  timeoutMs = 15000
): Promise<T> {
  return new Promise((resolve, reject) => {
    let finished = false;

    const timer = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error(`rbf_selectQuery timed out after ${timeoutMs}ms: ${sql}`));
    }, timeoutMs);

    const finishResolve = (val: T) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      resolve(val);
    };

    const finishReject = (err: any) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      reject(err);
    };

    try {
      // @ts-expect-error rbf_selectQuery is global
      rbf_selectQuery(
        sql,
        limit,
        (values: any[]) => {
          try {
            const result = map(values ?? []);
            finishResolve(result);
          } catch (e) {
            finishReject(e);
          }
        },
        false
      );
    } catch (e) {
      finishReject(e);
    }
  });
}

/**
 * Plan types query.
 * You confirmed the RBF shape requires v.id[0] and v.name[1].
 */
function usePlanTypes(enabled = true) {
  return useQuery({
    queryKey: ['planTypes'],
    enabled,
    queryFn: async (): Promise<PlanType[]> => {
      return rbfSelectQueryPromise(
        `SELECT id, name FROM EA_SA_PlanType ORDER BY name`,
        1000,
        (values) => {
          const list = (values ?? []).map((v) => {
            // as you confirmed: id is v.id[0], name is v.name[1]
            const idRaw = v[0];
            const nameRaw = v[1];
            return {
              id: Number(idRaw),
              name: nameRaw == null ? '' : String(nameRaw),
            } as PlanType;
          });
          return list.filter((p) => Number.isFinite(p.id) && p.name);
        }
      );
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Reads the default template CSV from $SETTINGS.bcicDefaultTemplate.
 * Returns { settingsRowId, csv } where csv is '' if missing.
 *
 * IMPORTANT: your runtime shape for this query is [[id, 'csv']] — we handle that.
 */
function useDefaultTemplateCategory(enabled = true) {
  return useQuery({
    queryKey: ['defaultTemplateCategory'],
    enabled,
    queryFn: async (): Promise<{ settingsRowId: number; csv: string }> => {
      return rbfSelectQueryPromise(
        `SELECT id, bcicDefaultTemplate FROM $SETTINGS`,
        1,
        (rows) => {
          // rows looks like: [ [468991815, '123,124,125'] ]
          const first = rows?.[0];
          const settingsRowId = first?.[0] ?? 1;
          const csvRaw = first?.[1];
          const csv = csvRaw == null ? '' : String(csvRaw);
          return {
            settingsRowId: Number.isFinite(Number(settingsRowId)) ? Number(settingsRowId) : 1,
            csv,
          };
        },
        15000
      );
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Mutation to update bcicDefaultTemplate on the given settings row id.
 */
function useUpdateDefaultTemplateCategory(settingsRowId: number | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['updateDefaultTemplateCategory', settingsRowId],
    mutationFn: async (csv: string) => {
      const writeId = settingsRowId ?? 1;

      return await new Promise((resolve, reject) => {
        try {
          // @ts-expect-error rbf_updateRecord is global
          rbf_updateRecord('$SETTINGS', writeId, { bcicDefaultTemplate: csv }, true, (data: any) => {
            resolve(data);
          });
        } catch (e) {
          reject(e);
        }
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['defaultTemplateCategory'] });
      await queryClient.invalidateQueries({ queryKey: ['everbridgeSettingsRow'] });
    },
  });
}

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
  // @ts-ignore
  for (const id of input) {
    if (validIds.has(id)) next.add(id);
  }
  return next;
}

export default function Settings() {
  const isDev = process.env.NODE_ENV === 'development';

  const { pushToast } = useToasts();
  const queryClient = useQueryClient();

  const tokenResponse = useEverbridgeToken();
  const commTemplates = useCommTemplates(tokenResponse?.data?.id_token);

  const settingsQuery = useEverbridgeSettingsRow();
  const row = settingsQuery.data;

  const planTypesQuery = usePlanTypes(true);

  // Dropdown selection (Default first)
  const [target, setTarget] = useState<Target>({ kind: 'default' });

  // Default CSV query (enabled when target is default)
  const defaultCategoryQuery = useDefaultTemplateCategory(target.kind === 'default');

  // Plan-type CSV query (only enabled for plan targets)
  const planCategoryQuery = usePlanTemplateCategory({
    planType: target.kind === 'plan' ? target.planTypeId : undefined,
    enabled: target.kind === 'plan',
    isDev,
  });

  // Mutations
  // plan mutation comes from your existing hook (keeps its behavior)
  const updatePlanCategory = useUpdatePlanTemplateCategory({
    planTypeId: target.kind === 'plan' ? target.planTypeId : undefined,
  });

  // default mutation: pass in the ID we read from defaultCategoryQuery if present, otherwise fallback to settings row from settingsQuery
  const updateDefaultCategory = useUpdateDefaultTemplateCategory(
    defaultCategoryQuery.data?.settingsRowId ?? row?.id ?? 1
  );

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>({
    eb_client_id: '',
    eb_client_secret: '',
    eb_username: '',
    eb_user_password: '',
    eb_role_id: '',
  });

  function onClose() {}

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((s) => ({ ...s, [key]: value }));
  }

  async function handleSave() {
    const updates: Partial<FormState> = {};
    (Object.keys(form) as Array<keyof FormState>).forEach((k) => {
      const v = form[k];
      if (v && v.trim() !== '') updates[k] = v;
    });

    if (!Object.keys(updates).length) {
      pushToast({
        type: 'error',
        title: 'Nothing to save',
        message: 'Please update at least one field.',
      });
      return;
    }

    const writeId = row?.id ?? 1;

    setLoading(true);
    try {
      await new Promise((resolve, reject) => {
        try {
          // @ts-expect-error rbf_updateRecord is global
          rbf_updateRecord('$SETTINGS', writeId, updates, true, (data: any) => resolve(data));
        } catch (err) {
          reject(err);
        }
      });

      pushToast({
        type: 'success',
        title: 'Settings saved',
        message: 'Everbridge settings updated successfully.',
        ttl: 2500,
      });

      await queryClient.invalidateQueries({ queryKey: ['everbridgeSettingsRow'] });
      await queryClient.invalidateQueries({ queryKey: ['everbridgeToken'] });

      onClose?.();
    } catch (err: any) {
      pushToast({ type: 'error', title: 'Save failed', message: err?.message ?? 'Unable to save settings.' });
    } finally {
      setLoading(false);
    }
  }

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  // Build set of valid template IDs from API
  const validTemplateIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of commTemplates.data ?? []) ids.add(String(t.id));
    return ids;
  }, [commTemplates.data]);

  // Reset selection when switching target
  useEffect(() => {
    setSelected(new Set());
    setQuery('');
  }, [target.kind, target.kind === 'plan' ? target.planTypeId : null]);

  // Load CSV based on current target
  useEffect(() => {
    if (target.kind === 'default') {
      if (defaultCategoryQuery.isSuccess) {
        const fromCsv = csvToSet(defaultCategoryQuery.data?.csv);
        setSelected(intersectWithValidIds(fromCsv, validTemplateIds));
      }
      return;
    }

    if (target.kind === 'plan') {
      if (planCategoryQuery.isSuccess) {
        const fromCsv = csvToSet(planCategoryQuery.data);
        setSelected(intersectWithValidIds(fromCsv, validTemplateIds));
      }
    }
  }, [
    target.kind,
    target.kind === 'plan' ? target.planTypeId : null,
    defaultCategoryQuery.isSuccess,
    defaultCategoryQuery.data,
    planCategoryQuery.isSuccess,
    planCategoryQuery.data,
    validTemplateIds,
  ]);

  // If templates change later, prune selection so stale IDs never remain
  useEffect(() => {
    setSelected((prev) => intersectWithValidIds(prev, validTemplateIds));
  }, [validTemplateIds]);

  const toggleTemplate = (id: string) => {
    if (!validTemplateIds.has(id)) return;

    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

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

  const onSaveTemplates = async () => {
    const csv = Array.from(selected).join(',');

    try {
      if (target.kind === 'default') {
        await updateDefaultCategory.mutateAsync(csv);
        pushToast({
          type: 'success',
          title: 'Default templates saved',
          message: 'Updated $SETTINGS.bcicDefaultTemplate.',
          ttl: 2500,
        });
        return;
      }

      await updatePlanCategory.mutateAsync(csv);
      pushToast({
        type: 'success',
        title: 'Plan templates saved',
        message: `Updated templates for planTypeId ${target.planTypeId}.`,
        ttl: 2500,
      });
    } catch (err: any) {
      pushToast({
        type: 'error',
        title: 'Save failed',
        message: err?.message ?? 'Unable to save templates.',
      });
    }
  };

  // Normalize "is saving" flags from different hook shapes
  const defaultSaving = (updateDefaultCategory as any)?.isLoading ?? (updateDefaultCategory as any)?.isPending ?? false;
  const planSaving = (updatePlanCategory as any)?.isLoading ?? (updatePlanCategory as any)?.isPending ?? false;
  const saveDisabled = target.kind === 'default' ? defaultSaving : planSaving;

  const isLoading =
    settingsQuery.isLoading ||
    commTemplates.isLoading ||
    planTypesQuery.isLoading ||
    (target.kind === 'default' ? defaultCategoryQuery.isLoading : planCategoryQuery.isLoading);

  const isError =
    !!settingsQuery.error ||
    !!commTemplates.error ||
    !!planTypesQuery.error ||
    (target.kind === 'default' ? !!defaultCategoryQuery.error : !!planCategoryQuery.error);

  // Initialize form from row (but do NOT prefill secret/password)
  useEffect(() => {
    if (!row) return;
    setForm({
      eb_client_id: row.eb_client_id ?? '',
      eb_client_secret: '',
      eb_username: row.eb_username ?? '',
      eb_user_password: '',
      eb_role_id: row.eb_role_id ?? '',
    });
  }, [row]);

  if (settingsQuery.isLoading) return <div className="p-4 text-sm text-zinc-500">Loading settings…</div>;
  if (isLoading)
    return (
      <div className="p-6 text-sm text-zinc-700 space-y-2">
        <div>Loading…</div>
        <div>settingsQuery: {String(settingsQuery.isLoading)}</div>
        <div>commTemplates: {String(commTemplates.isLoading)}</div>
        <div>planTypesQuery: {String(planTypesQuery.isLoading)}</div>
        <div>defaultCategoryQuery: {String(defaultCategoryQuery.isLoading)}</div>
        <div>planCategoryQuery: {String(planCategoryQuery.isLoading)}</div>
        <div>target: {target.kind === 'default' ? 'default' : `plan:${target.planTypeId}`}</div>
      </div>
    );
  if (isError) {
    const err =
      (planTypesQuery.error as any)?.message ||
      (defaultCategoryQuery.error as any)?.message ||
      (planCategoryQuery.error as any)?.message ||
      (commTemplates.error as any)?.message ||
      (settingsQuery.error as any)?.message ||
      'Unknown error';
    return (
      <div className="p-6 text-red-600">
        Failed to load: {String(err)}
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <div className="flex flex-col gap-2 p-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold text-zinc-900">Plan Comm Templates</h2>
            <div className="text-sm text-zinc-600">
              Pick <span className="font-medium">Default</span> or a plan type, then select from templates below.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-800">
              Selected: <span className="font-semibold">{selected.size}</span>
            </div>

            <Button variant="default" size="sm" onClick={onSaveTemplates} disabled={saveDisabled}>
              {saveDisabled ? 'Saving…' : 'Save'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelected(new Set())}
              disabled={selected.size === 0 || saveDisabled}
            >
              Clear
            </Button>
          </div>
        </div>

        {/* Dropdown */}
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-2 text-sm font-medium text-zinc-900">Plan type</div>

          <select
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-1 focus:ring-zinc-300"
            value={target.kind === 'default' ? 'default' : `plan:${target.planTypeId}`}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'default') {
                setTarget({ kind: 'default' });
                return;
              }
              if (v.startsWith('plan:')) {
                const id = Number(v.replace('plan:', ''));
                setTarget({ kind: 'plan', planTypeId: id });
              }
            }}
          >
            <option value="default">Default (Settings)</option>
            {(planTypesQuery.data ?? []).map((pt) => (
              <option key={pt.id} value={`plan:${pt.id}`}>
                {pt.name} ({pt.id})
              </option>
            ))}
          </select>

          <div className="mt-2 text-xs text-zinc-500">
            {target.kind === 'default' ? (
              <>
                Editing default templates from <span className="font-mono">$SETTINGS.bcicDefaultTemplate</span>
              </>
            ) : (
              <>
                Editing templates for planTypeId: <span className="font-mono">{target.planTypeId}</span>
              </>
            )}
          </div>
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
            {filtered?.map((template) => {
              const id = String(template.id);
              const label = (template.name ?? template.title ?? `Template ${id}`) as string;
              const checked = selected.has(id);

              return (
                <div
                  key={id}
                  className={[
                    'mb-2 flex items-start gap-3 rounded-md px-3 py-2',
                    'hover:bg-zinc-50',
                    checked ? 'bg-zinc-50 ring-1 ring-zinc-200' : '',
                  ].join(' ')}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggleTemplate(id)} className="mt-1" />

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate text-sm font-medium text-zinc-900">{label}</div>
                      <div className="shrink-0 rounded bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-700">
                        {id}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && <div className="p-6 text-sm text-zinc-600">No templates match your search.</div>}

            {/* Not shown, but keeps your previous “preview” available for debugging */}
            <textarea style={{ display: 'none' }} value={selectedCsv} readOnly aria-hidden="true" />
          </div>
        </div>
      </div>

      <form
        className="bg-white rounded p-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Client ID" required>
            <Input value={form.eb_client_id} onChange={(e) => updateField('eb_client_id', e.target.value)} placeholder="Client ID" />
          </Field>

          <Field label="Client Secret">
            <Input
              type="password"
              value={form.eb_client_secret}
              onChange={(e) => updateField('eb_client_secret', e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </Field>

          <Field label="Username" required>
            <Input value={form.eb_username} onChange={(e) => updateField('eb_username', e.target.value)} placeholder="Username" autoComplete="username" />
          </Field>

          <Field label="Password">
            <Input
              type="password"
              value={form.eb_user_password}
              onChange={(e) => updateField('eb_user_password', e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </Field>

          <Field label="Role ID" required>
            <Input value={form.eb_role_id} onChange={(e) => updateField('eb_role_id', e.target.value)} placeholder="Role ID" />
          </Field>
        </div>

        <div className="mt-6 flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Save Settings'}
          </Button>
          <Button type="button" onClick={() => onClose?.()} variant="secondary">
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}