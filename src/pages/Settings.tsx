import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Checkbox } from 'components/ui/checkbox';
import { Button } from 'components/ui/button';
import { Input } from 'components/input';
import Field from 'components/Field';
import { DataTable } from 'components/DataTable'; // adjust path if needed
import { Dialog, DialogContent, DialogHeader, DialogTitle } from 'components/ui/dialog';

import { useCommTemplates } from 'hooks/useCommTemplates';
import { useEverbridgeToken } from 'hooks/useEverbridgeToken';
import { usePlanTemplateCategory } from 'hooks/usePlanTemplateCategory';
import { useUpdatePlanTemplateCategory } from 'hooks/useUpdatePlanTemplateCategory';
import { useEverbridgeSettingsRow } from 'hooks/useEverbridgeSettingsRow';
import { useToasts } from 'hooks/useToasts';

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

type CommTemplate = {
  id: number | string;
  name?: string;
  title?: string;
};

/**
 * Safe wrapper for rbf_selectQuery that ensures the Promise settles.
 * Maps the raw values via `map` and rejects on timeout or errors.
 */
function rbfSelectQueryPromise<T>(sql: string, limit: number, map: (rows: any[]) => T, timeoutMs = 15000): Promise<T> {
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
 */
function usePlanTypes(enabled = true) {
  return useQuery({
    queryKey: ['planTypes'],
    enabled,
    queryFn: async (): Promise<PlanType[]> => {
      return rbfSelectQueryPromise(`SELECT id, name FROM EA_SA_PlanType ORDER BY name`, 1000, (values) => {
        const list = (values ?? []).map((v) => {
          const idRaw = v?.[0];
          const nameRaw = v?.[1];

          return {
            id: Number(idRaw),
            name: nameRaw == null ? '' : String(nameRaw),
          } as PlanType;
        });

        return list.filter((p) => Number.isFinite(p.id) && p.name);
      });
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Reads the default template CSV from $SETTINGS.bcicDefaultTemplate.
 * Returns { settingsRowId, csv } where csv is '' if missing.
 */
function useDefaultTemplateCategory(enabled = true) {
  return useQuery({
    queryKey: ['defaultTemplateCategory'],
    enabled,
    queryFn: async (): Promise<{ settingsRowId: number; csv: string }> => {
      return rbfSelectQueryPromise(`SELECT id, bcicDefaultTemplate FROM $SETTINGS`, 1, (rows) => {
        const first = rows?.[0];
        const settingsRowId = first?.[0] ?? 1;
        const csvRaw = first?.[1];
        const csv = csvRaw == null ? '' : String(csvRaw);

        return {
          settingsRowId: Number.isFinite(Number(settingsRowId)) ? Number(settingsRowId) : 1,
          csv,
        };
      });
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

function getTemplateLabel(template: CommTemplate) {
  return String(template.name ?? template.title ?? `Template ${template.id}`);
}

function mutationIsBusy(mutation: any) {
  return mutation?.isLoading ?? mutation?.isPending ?? false;
}

function TemplateChip({ label }: { label: string }) {
  return <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-800">{label}</span>;
}

type AssignTemplatesDialogProps = {
  open: boolean;
  title: string;
  templates: CommTemplate[];
  initialSelectedIds: string[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (ids: string[]) => Promise<void>;
};

function AssignTemplatesDialog({ open, title, templates, initialSelectedIds, saving, onOpenChange, onSave }: AssignTemplatesDialogProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(new Set(initialSelectedIds));
  }, [open, initialSelectedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;

    return templates.filter((t) => {
      const id = String(t.id).toLowerCase();
      const label = getTemplateLabel(t).toLowerCase();
      return id.includes(q) || label.includes(q);
    });
  }, [templates, query]);

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
        </DialogHeader>

        <div className="space-y-4">
          <Input placeholder="Search templates by name or ID…" value={query} onChange={(e) => setQuery(e.target.value)} />

          <div className="max-h-[55vh] overflow-auto rounded-md border border-zinc-200 p-2">
            {filtered.map((template) => {
              const id = String(template.id);
              const checked = selected.has(id);

              return (
                <div key={id} className={['mb-2 flex items-start gap-3 rounded-md px-3 py-2', 'hover:bg-zinc-50', checked ? 'bg-zinc-50 ring-1 ring-zinc-200' : ''].join(' ')}>
                  <Checkbox checked={checked} onCheckedChange={() => toggleTemplate(id)} className="mt-1" />

                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <div className="truncate text-sm font-medium text-zinc-900">{getTemplateLabel(template)}</div>

                    <div className="shrink-0 rounded bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-700">{id}</div>
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && <div className="p-6 text-sm text-zinc-600">No templates match your search.</div>}
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
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type PlanTypeAssignedTemplatesCellProps = {
  planType: PlanType;
  templateMap: Map<string, string>;
  isDev: boolean;
  onAssign: (planType: PlanType, selectedIds: string[]) => void;
  onLoadedSelection: (planTypeId: number, selectedIds: string[]) => void;
};

function PlanTypeAssignedTemplatesCell({ planType, templateMap, isDev, onAssign, onLoadedSelection }: PlanTypeAssignedTemplatesCellProps) {
  const planCategoryQuery = usePlanTemplateCategory({
    planType: planType.id,
    enabled: true,
    isDev,
  });

  const selectedIds = useMemo(() => {
    return Array.from(csvToSet(planCategoryQuery.data));
  }, [planCategoryQuery.data]);

  const assigned = useMemo(() => {
    return selectedIds.map((id) => ({
      id,
      label: templateMap.get(id) ?? `Template ${id}`,
    }));
  }, [selectedIds, templateMap]);

  useEffect(() => {
    if (!planCategoryQuery.isSuccess) return;
    onLoadedSelection(planType.id, selectedIds);
  }, [planCategoryQuery.isSuccess, onLoadedSelection, planType.id, selectedIds]);

  if (planCategoryQuery.isLoading) {
    return <div className="text-sm text-zinc-500">Loading…</div>;
  }

  if (planCategoryQuery.isError) {
    return <div className="text-sm text-red-600">Failed to load templates.</div>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {assigned.length > 0 ? assigned.map((item) => <TemplateChip key={`${planType.id}-${item.id}`} label={item.label} />) : <span className="text-sm text-zinc-500">No templates assigned</span>}

      <Button variant="ghost" size="sm" onClick={() => onAssign(planType, selectedIds)}>
        Assign
      </Button>
    </div>
  );
}

function PlanTypeClearButton({ planTypeId, planTypeName }: { planTypeId: number; planTypeName: string }) {
  const { pushToast } = useToasts();
  const updatePlanCategory = useUpdatePlanTemplateCategory({ planTypeId });

  const saving = mutationIsBusy(updatePlanCategory);

  const handleClear = async () => {
    try {
      await updatePlanCategory.mutateAsync('');
      pushToast({
        type: 'success',
        title: 'Templates cleared',
        message: `Cleared templates for ${planTypeName}.`,
        ttl: 2500,
      });
    } catch (err: any) {
      pushToast({
        type: 'error',
        title: 'Clear failed',
        message: err?.message ?? 'Unable to clear templates.',
      });
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleClear} disabled={saving}>
      {saving ? 'Clearing…' : 'Clear All'}
    </Button>
  );
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
  // const defaultCategoryQuery = useDefaultTemplateCategory(true);

  // const updateDefaultCategory = useUpdateDefaultTemplateCategory(
  //   defaultCategoryQuery.data?.settingsRowId ?? row?.id ?? 1
  // );

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>({
    eb_client_id: '',
    eb_client_secret: '',
    eb_username: '',
    eb_user_password: '',
    eb_role_id: '',
  });

  const templates = useMemo(() => {
    return (commTemplates.data ?? []) as CommTemplate[];
  }, [commTemplates.data]);

  const templateMap = useMemo(() => {
    return new Map(templates.map((t) => [String(t.id), getTemplateLabel(t)]));
  }, [templates]);

  // const [defaultDialogOpen, setDefaultDialogOpen] = useState(false);
  // const defaultSaving = mutationIsBusy(updateDefaultCategory);

  // const defaultSelectedIds = useMemo(() => {
  //   return Array.from(csvToSet(defaultCategoryQuery.data?.csv));
  // }, [defaultCategoryQuery.data?.csv]);

  // const defaultAssigned = useMemo(() => {
  //   return defaultSelectedIds.map((id) => ({
  //     id,
  //     label: templateMap.get(id) ?? `Template ${id}`,
  //   }));
  // }, [defaultSelectedIds, templateMap]);

  // const saveDefaultTemplates = async (ids: string[]) => {
  //   try {
  //     await updateDefaultCategory.mutateAsync(ids.join(','));
  //     pushToast({
  //       type: 'success',
  //       title: 'Default templates saved',
  //       message: 'Updated $SETTINGS.bcicDefaultTemplate.',
  //       ttl: 2500,
  //     });
  //     setDefaultDialogOpen(false);
  //   } catch (err: any) {
  //     pushToast({
  //       type: 'error',
  //       title: 'Save failed',
  //       message: err?.message ?? 'Unable to save default templates.',
  //     });
  //   }
  // };

  // const clearDefaultTemplates = async () => {
  //   try {
  //     await updateDefaultCategory.mutateAsync('');
  //     pushToast({
  //       type: 'success',
  //       title: 'Default templates cleared',
  //       message: 'Cleared $SETTINGS.bcicDefaultTemplate.',
  //       ttl: 2500,
  //     });
  //   } catch (err: any) {
  //     pushToast({
  //       type: 'error',
  //       title: 'Clear failed',
  //       message: err?.message ?? 'Unable to clear default templates.',
  //     });
  //   }
  // };

  const [selectedRows, setSelectedRows] = useState<Record<number, boolean>>({});
  const [rowTemplateIdsByPlanType, setRowTemplateIdsByPlanType] = useState<Record<number, string[]>>({});

  const [editingPlanType, setEditingPlanType] = useState<PlanType | null>(null);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [planDialogInitialSelectedIds, setPlanDialogInitialSelectedIds] = useState<string[]>([]);

  const editPlanCategory = useUpdatePlanTemplateCategory({
    planTypeId: editingPlanType?.id,
  });

  const editPlanSaving = mutationIsBusy(editPlanCategory);

  const openPlanDialog = useCallback((planType: PlanType, selectedIds: string[]) => {
    setEditingPlanType(planType);
    setPlanDialogInitialSelectedIds(selectedIds);
    setPlanDialogOpen(true);
  }, []);

  const closePlanDialog = useCallback((open: boolean) => {
    setPlanDialogOpen(open);

    if (!open) {
      setEditingPlanType(null);
      setPlanDialogInitialSelectedIds([]);
    }
  }, []);

  const savePlanTemplates = async (ids: string[]) => {
    if (!editingPlanType) return;

    try {
      await editPlanCategory.mutateAsync(ids.join(','));
      pushToast({
        type: 'success',
        title: 'Plan templates saved',
        message: `Updated templates for ${editingPlanType.name}.`,
        ttl: 2500,
      });
      closePlanDialog(false);
    } catch (err: any) {
      pushToast({
        type: 'error',
        title: 'Save failed',
        message: err?.message ?? 'Unable to save templates.',
      });
    }
  };

  const handleRowTemplatesLoaded = useCallback((planTypeId: number, selectedIds: string[]) => {
    setRowTemplateIdsByPlanType((prev) => {
      const previous = prev[planTypeId] ?? [];
      const same = previous.length === selectedIds.length && previous.every((id, index) => id === selectedIds[index]);

      if (same) return prev;

      return {
        ...prev,
        [planTypeId]: selectedIds,
      };
    });
  }, []);

  const planTypes = planTypesQuery.data ?? [];
  const selectedPlanTypes = useMemo(() => {
    return planTypes.filter((pt) => !!selectedRows[pt.id]);
  }, [planTypes, selectedRows]);

  const singleSelectedPlanType = selectedPlanTypes.length === 1 ? selectedPlanTypes[0] : null;

  const selectedPlanUpdate = useUpdatePlanTemplateCategory({
    planTypeId: singleSelectedPlanType?.id,
  });

  const selectedPlanClearSaving = mutationIsBusy(selectedPlanUpdate);

  const allSelected = planTypes.length > 0 && selectedPlanTypes.length === planTypes.length;
  const someSelected = selectedPlanTypes.length > 0 && !allSelected;

  const handleAssignSelectedPlan = () => {
    if (!singleSelectedPlanType) return;

    openPlanDialog(singleSelectedPlanType, rowTemplateIdsByPlanType[singleSelectedPlanType.id] ?? []);
  };

  const handleClearSelectedPlan = async () => {
    if (!singleSelectedPlanType) return;

    try {
      await selectedPlanUpdate.mutateAsync('');
      pushToast({
        type: 'success',
        title: 'Templates cleared',
        message: `Cleared templates for ${singleSelectedPlanType.name}.`,
        ttl: 2500,
      });
    } catch (err: any) {
      pushToast({
        type: 'error',
        title: 'Clear failed',
        message: err?.message ?? 'Unable to clear templates.',
      });
    }
  };

  const columns = useMemo<ColumnDef<PlanType>[]>(() => {
    return [
      {
        id: 'select',
        header: () => (
          <Checkbox
            checked={someSelected ? 'indeterminate' : allSelected}
            onCheckedChange={(checked) => {
              if (checked !== true) {
                setSelectedRows({});
                return;
              }

              const next: Record<number, boolean> = {};
              for (const pt of planTypes) next[pt.id] = true;
              setSelectedRows(next);
            }}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={!!selectedRows[row.original.id]}
            onCheckedChange={(checked) => {
              setSelectedRows((prev) => {
                const next = { ...prev };

                if (checked === true) {
                  next[row.original.id] = true;
                } else {
                  delete next[row.original.id];
                }

                return next;
              });
            }}
          />
        ),
      },
      {
        accessorKey: 'name',
        header: 'Plan Type',
        cell: ({ row }) => <div className="font-medium text-zinc-900">{row.original.name}</div>,
      },
      {
        id: 'assignedTemplates',
        header: 'Assigned Templates',
        cell: ({ row }) => <PlanTypeAssignedTemplatesCell planType={row.original} templateMap={templateMap} isDev={isDev} onAssign={openPlanDialog} onLoadedSelection={handleRowTemplatesLoaded} />,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex justify-end">
            <PlanTypeClearButton planTypeId={row.original.id} planTypeName={row.original.name} />
          </div>
        ),
      },
    ];
  }, [allSelected, someSelected, planTypes, selectedRows, templateMap, isDev, openPlanDialog, handleRowTemplatesLoaded]);

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
      pushToast({
        type: 'error',
        title: 'Save failed',
        message: err?.message ?? 'Unable to save settings.',
      });
    } finally {
      setLoading(false);
    }
  }

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

  const isLoading = settingsQuery.isLoading || commTemplates.isLoading || planTypesQuery.isLoading;

  const isError = !!settingsQuery.error || !!commTemplates.error || !!planTypesQuery.error;

  if (settingsQuery.isLoading) {
    return <div className="p-4 text-sm text-zinc-500">Loading settings…</div>;
  }

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-zinc-700 space-y-2">
        <div>Loading…</div>
        <div>settingsQuery: {String(settingsQuery.isLoading)}</div>
        <div>commTemplates: {String(commTemplates.isLoading)}</div>
        <div>planTypesQuery: {String(planTypesQuery.isLoading)}</div>
        {/* <div>defaultCategoryQuery: {String(defaultCategoryQuery.isLoading)}</div> */}
      </div>
    );
  }

  if (isError) {
    const err =
      (planTypesQuery.error as any)?.message || (commTemplates.error as any)?.message || (settingsQuery.error as any)?.message || 'Unknown error';

    return <div className="p-6 text-red-600">Failed to load: {String(err)}</div>;
  }

  return (
    <div className="w-full h-full">
      <div className="flex flex-col gap-6 p-6">
        {/* <div className="rounded-lg border border-zinc-200 bg-white p-4"> */}
        {/* <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold text-zinc-900">Default Comm Templates</h2>
              <div className="text-sm text-zinc-600">
                These templates are stored in <span className="font-mono">$SETTINGS.bcicDefaultTemplate</span>.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setDefaultDialogOpen(true)}>
                Assign Templates
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={clearDefaultTemplates}
                disabled={defaultSaving || defaultSelectedIds.length === 0}
              >
                {defaultSaving ? 'Clearing…' : 'Clear Templates'}
              </Button>
            </div>
          </div> */}

        {/* <div className="mt-4 flex flex-wrap items-center gap-2">
            {defaultAssigned.length > 0 ? (
              defaultAssigned.map((item) => (
                <TemplateChip key={`default-${item.id}`} label={item.label} />
              ))
            ) : (
              <div className="text-sm text-zinc-500">No default templates assigned.</div>
            )}
          </div> */}
        {/* </div> */}

        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold text-zinc-900">Plan Types and Templates</h2>
              <div className="text-sm text-zinc-600">All plan types are listed below. Select a row to use the top actions, or use each row’s Assign / Clear All controls.</div>
            </div>

            <div className="flex items-center gap-2">
              <div className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-800">
                Selected rows: <span className="font-semibold">{selectedPlanTypes.length}</span>
              </div>

              <Button size="sm" onClick={handleAssignSelectedPlan} disabled={!singleSelectedPlanType}>
                Assign Template
              </Button>

              <Button variant="outline" size="sm" onClick={handleClearSelectedPlan} disabled={!singleSelectedPlanType || selectedPlanClearSaving}>
                {selectedPlanClearSaving ? 'Clearing…' : 'Clear Templates'}
              </Button>
            </div>
          </div>

          <DataTable data={planTypes} columns={columns} emptyText="No plan types found." />

          <div className="mt-2 text-xs text-zinc-500">Top actions are enabled when exactly one row is selected.</div>
        </div>
      </div>

      <form
        className="bg-white rounded p-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Client ID" required>
            <Input value={form.eb_client_id} onChange={(e) => updateField('eb_client_id', e.target.value)} placeholder="Client ID" />
          </Field>

          <Field label="Client Secret">
            <Input type="password" value={form.eb_client_secret} onChange={(e) => updateField('eb_client_secret', e.target.value)} placeholder="••••••••" autoComplete="new-password" />
          </Field>

          <Field label="Username" required>
            <Input value={form.eb_username} onChange={(e) => updateField('eb_username', e.target.value)} placeholder="Username" autoComplete="username" />
          </Field>

          <Field label="Password">
            <Input type="password" value={form.eb_user_password} onChange={(e) => updateField('eb_user_password', e.target.value)} placeholder="••••••••" autoComplete="new-password" />
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

      {/* <AssignTemplatesDialog
        open={defaultDialogOpen}
        title="Assign Default Templates"
        templates={templates}
        initialSelectedIds={defaultSelectedIds}
        saving={defaultSaving}
        onOpenChange={setDefaultDialogOpen}
        onSave={saveDefaultTemplates}
      /> */}

      <AssignTemplatesDialog
        open={planDialogOpen}
        title={editingPlanType ? `Assign Templates — ${editingPlanType.name}` : 'Assign Templates'}
        templates={templates}
        initialSelectedIds={planDialogInitialSelectedIds}
        saving={editPlanSaving}
        onOpenChange={closePlanDialog}
        onSave={savePlanTemplates}
      />
    </div>
  );
}
