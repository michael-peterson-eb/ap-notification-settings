import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Settings as SettingsIcon, X, XCircle } from 'lucide-react';

import Field from 'components/Field';
import { DataTable } from 'components/DataTable';
import { Input } from 'components/input';
import { Button } from 'components/ui/button';
import { Checkbox } from 'components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from 'components/ui/dialog';

import { useCommTemplates } from 'hooks/useCommTemplates';
import { useEverbridgeSettingsRow } from 'hooks/useEverbridgeSettingsRow';
import { useEverbridgeToken } from 'hooks/useEverbridgeToken';
import { usePlanTemplateCategory } from 'hooks/usePlanTemplateCategory';
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

type PlanTemplateMutationArgs = {
  targets: PlanType[];
  csv: string;
};

function updatePlanTypeTemplateCategory(planTypeId: number, csv: string) {
  return new Promise((resolve, reject) => {
    try {
      // @ts-expect-error rbf_updateRecord is global
      rbf_updateRecord(
        'EA_SA_PlanType',
        planTypeId,
        {
          bcicTemplateCategory: csv,
        },
        true,
        (data: any) => resolve(data)
      );
      return;
    } catch (_error) {
      try {
        Promise.resolve(
          // @ts-expect-error _RB is attached to window
          _RB.updateRecord('EA_SA_PlanType', planTypeId, {
            bcicTemplateCategory: csv,
          })
        ).then(resolve, reject);
      } catch (fallbackError) {
        reject(fallbackError);
      }
    }
  });
}

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
          } catch (error) {
            finishReject(error);
          }
        },
        false
      );
    } catch (error) {
      finishReject(error);
    }
  });
}

function usePlanTypes(enabled = true) {
  return useQuery({
    queryKey: ['planTypes'],
    enabled,
    queryFn: async (): Promise<PlanType[]> => {
      return rbfSelectQueryPromise(`SELECT id, name FROM EA_SA_PlanType ORDER BY name`, 1000, (values) => {
        const list = (values ?? []).map((value) => {
          const idRaw = value?.[0];
          const nameRaw = value?.[1];

          return {
            id: Number(idRaw),
            name: nameRaw == null ? '' : String(nameRaw),
          } as PlanType;
        });

        return list.filter((planType) => Number.isFinite(planType.id) && planType.name);
      });
    },
    staleTime: 5 * 60 * 1000,
  });
}

function csvToSet(csv: string | null | undefined) {
  if (!csv) return new Set<string>();

  return new Set(
    csv
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function mutationIsBusy(mutation: any) {
  return mutation?.isLoading ?? mutation?.isPending ?? false;
}

function getTemplateLabel(template: CommTemplate) {
  return String(template.name ?? template.title ?? `Template ${template.id}`);
}

function getErrorMessage(error: any) {
  if (!error) return 'Unknown error.';
  if (typeof error === 'string') return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error?.message === 'string' && error.message) return error.message;
  if (typeof error?.error_description === 'string' && error.error_description) return error.error_description;
  if (typeof error?.error === 'string' && error.error) return error.error;

  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error.';
  }
}

function hasStoredCredentials(row: { eb_client_id?: string; eb_username?: string; eb_role_id?: string } | null | undefined) {
  return Boolean(row?.eb_client_id?.trim() && row?.eb_username?.trim() && row?.eb_role_id?.trim());
}

function getPlanTargetLabel(targets: PlanType[]) {
  if (targets.length === 1) return targets[0].name;
  return `${targets.length} selected plan types`;
}

function TemplateChip({
  label,
  disabled = false,
  onRemove,
}: {
  label: string;
  disabled?: boolean;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-lg font-medium border border-zinc-200 bg-[#ECEEF2] px-2 py-1 text-sm text-[#030213]">
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

function AssignTemplatesDialog({ open, title, description, templates, initialSelectedIds, saving, onOpenChange, onSave }: AssignTemplatesDialogProps) {
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
                    <div className="shrink-0 rounded bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-700">{id}</div>
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

type PlanTypeAssignedTemplatesCellProps = {
  planType: PlanType;
  templateMap: Map<string, string>;
  isDev: boolean;
  busy: boolean;
  onAssign: (targets: PlanType[], selectedIds: string[]) => void;
  onLoadedSelection: (planTypeId: number, selectedIds: string[]) => void;
  onRemoveTemplate: (planType: PlanType, selectedIds: string[], templateId: string) => void;
};

function PlanTypeAssignedTemplatesCell({
  planType,
  templateMap,
  isDev,
  busy,
  onAssign,
  onLoadedSelection,
  onRemoveTemplate,
}: PlanTypeAssignedTemplatesCellProps) {
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
  }, [onLoadedSelection, planCategoryQuery.isSuccess, planType.id, selectedIds]);

  if (planCategoryQuery.isLoading) {
    return <div className="text-sm text-zinc-500">Loading...</div>;
  }

  if (planCategoryQuery.isError) {
    return <div className="text-sm text-red-600">Failed to load templates.</div>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {assigned.length > 0 ? (
        assigned.map((item) => (
          <TemplateChip
            key={`${planType.id}-${item.id}`}
            label={item.label}
            disabled={busy}
            onRemove={() => onRemoveTemplate(planType, selectedIds, item.id)}
          />
        ))
      ) : (
        <span className="text-sm text-zinc-500">No templates assigned</span>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1 px-2 text-sm font-medium text-zinc-900 hover:bg-transparent hover:text-primary"
        onClick={() => onAssign([planType], selectedIds)}
        disabled={busy}>
        <Plus className="h-4 w-4" />
        Assign
      </Button>
    </div>
  );
}

export default function Settings() {
  const isDev = process.env.NODE_ENV === 'development';

  const { pushToast } = useToasts();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>({
    eb_client_id: '',
    eb_client_secret: '',
    eb_username: '',
    eb_user_password: '',
    eb_role_id: '',
  });
  const [selectedRows, setSelectedRows] = useState<Record<number, boolean>>({});
  const [rowTemplateIdsByPlanType, setRowTemplateIdsByPlanType] = useState<Record<number, string[]>>({});
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [planDialogTargets, setPlanDialogTargets] = useState<PlanType[]>([]);
  const [planDialogInitialSelectedIds, setPlanDialogInitialSelectedIds] = useState<string[]>([]);

  const settingsQuery = useEverbridgeSettingsRow();
  const row = settingsQuery.data;

  const hasCredentials = isDev || hasStoredCredentials(row);

  const tokenResponse = useEverbridgeToken({ enabled: hasCredentials });
  const commTemplates = useCommTemplates(tokenResponse.data?.id_token);
  const planTypesQuery = usePlanTypes(hasCredentials);

  const templates = useMemo(() => {
    return (commTemplates.data ?? []) as CommTemplate[];
  }, [commTemplates.data]);

  const templateMap = useMemo(() => {
    return new Map(templates.map((template) => [String(template.id), getTemplateLabel(template)]));
  }, [templates]);

  const sortTemplateIds = useCallback(
    (ids: string[]) => {
      return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean))).sort((a, b) => {
        const labelA = templateMap.get(a) ?? `Template ${a}`;
        const labelB = templateMap.get(b) ?? `Template ${b}`;
        return labelA.localeCompare(labelB);
      });
    },
    [templateMap]
  );

  const resetForm = useCallback(() => {
    setForm({
      eb_client_id: row?.eb_client_id ?? '',
      eb_client_secret: '',
      eb_username: row?.eb_username ?? '',
      eb_user_password: '',
      eb_role_id: row?.eb_role_id ?? '',
    });
  }, [row]);

  useEffect(() => {
    resetForm();
  }, [resetForm]);

  const planTypes = planTypesQuery.data ?? [];

  const selectedPlanTypes = useMemo(() => {
    return planTypes.filter((planType) => !!selectedRows[planType.id]);
  }, [planTypes, selectedRows]);

  const selectedPlanTypesLoaded = selectedPlanTypes.every((planType) => rowTemplateIdsByPlanType[planType.id] !== undefined);
  const allSelected = planTypes.length > 0 && selectedPlanTypes.length === planTypes.length;
  const someSelected = selectedPlanTypes.length > 0 && !allSelected;

  const handleRowTemplatesLoaded = useCallback(
    (planTypeId: number, selectedIds: string[]) => {
      const normalizedIds = sortTemplateIds(selectedIds);

      setRowTemplateIdsByPlanType((prev) => {
        const previousIds = prev[planTypeId] ?? [];
        const same = previousIds.length === normalizedIds.length && previousIds.every((id, index) => id === normalizedIds[index]);

        if (same) return prev;

        return {
          ...prev,
          [planTypeId]: normalizedIds,
        };
      });
    },
    [sortTemplateIds]
  );

  const syncTemplateSelections = useCallback(
    (targets: PlanType[], selectedIds: string[]) => {
      const normalizedIds = sortTemplateIds(selectedIds);

      setRowTemplateIdsByPlanType((prev) => {
        let changed = false;
        const next = { ...prev };

        for (const target of targets) {
          const previousIds = prev[target.id] ?? [];
          const same = previousIds.length === normalizedIds.length && previousIds.every((id, index) => id === normalizedIds[index]);

          if (same) continue;

          next[target.id] = normalizedIds;
          changed = true;
        }

        return changed ? next : prev;
      });
    },
    [sortTemplateIds]
  );

  const planTemplateMutation = useMutation({
    mutationFn: async ({ targets, csv }: PlanTemplateMutationArgs) => {
      for (const target of targets) {
        await updatePlanTypeTemplateCategory(target.id, csv);
      }
    },
    onMutate: async ({ targets, csv }) => {
      const nextValue = csv.trim() ? csv : null;
      const snapshots = [];

      for (const target of targets) {
        const queryKey = ['planTemplateCategory', target.id] as const;

        await queryClient.cancelQueries({ queryKey });

        snapshots.push({
          queryKey,
          previous: queryClient.getQueryData<string | null>(queryKey),
        });

        queryClient.setQueryData<string | null>(queryKey, nextValue);
      }

      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      context?.snapshots?.forEach((snapshot: { queryKey: readonly ['planTemplateCategory', number]; previous: string | null | undefined }) => {
        queryClient.setQueryData(snapshot.queryKey, snapshot.previous);
      });
    },
    onSettled: async (_data, _error, variables) => {
      await Promise.all(variables.targets.map((target) => queryClient.invalidateQueries({ queryKey: ['planTemplateCategory', target.id] })));
    },
  });

  const savingPlanTemplates = mutationIsBusy(planTemplateMutation);

  const updatePlanTemplates = useCallback(
    async ({
      targets,
      ids,
      successTitle,
      successMessage,
      errorTitle,
      errorMessage,
      toastOnSuccess = true,
    }: {
      targets: PlanType[];
      ids: string[];
      successTitle: string;
      successMessage: string;
      errorTitle: string;
      errorMessage: string;
      toastOnSuccess?: boolean;
    }) => {
      if (targets.length === 0) return false;

      const normalizedIds = sortTemplateIds(ids);

      try {
        await planTemplateMutation.mutateAsync({
          targets,
          csv: normalizedIds.join(','),
        });

        syncTemplateSelections(targets, normalizedIds);

        if (toastOnSuccess) {
          pushToast({
            type: 'success',
            title: successTitle,
            message: successMessage,
            ttl: 2500,
          });
        }

        return true;
      } catch (error: any) {
        pushToast({
          type: 'error',
          title: errorTitle,
          message: getErrorMessage(error) || errorMessage,
        });

        return false;
      }
    },
    [planTemplateMutation, pushToast, sortTemplateIds, syncTemplateSelections]
  );

  const openPlanDialog = useCallback(
    (targets: PlanType[], selectedIds: string[]) => {
      if (targets.length === 0) return;

      setPlanDialogTargets(targets);
      setPlanDialogInitialSelectedIds(sortTemplateIds(selectedIds));
      setPlanDialogOpen(true);
    },
    [sortTemplateIds]
  );

  const closePlanDialog = useCallback((open: boolean) => {
    setPlanDialogOpen(open);

    if (!open) {
      setPlanDialogTargets([]);
      setPlanDialogInitialSelectedIds([]);
    }
  }, []);

  const handleAssignSelectedPlans = useCallback(() => {
    if (selectedPlanTypes.length === 0) return;

    const initialSelectedIds =
      selectedPlanTypes.length === 1
        ? rowTemplateIdsByPlanType[selectedPlanTypes[0].id] ?? []
        : selectedPlanTypes.flatMap((planType) => rowTemplateIdsByPlanType[planType.id] ?? []);

    openPlanDialog(selectedPlanTypes, initialSelectedIds);
  }, [openPlanDialog, rowTemplateIdsByPlanType, selectedPlanTypes]);

  const handleClearSelectedPlans = useCallback(async () => {
    if (selectedPlanTypes.length === 0) return;

    await updatePlanTemplates({
      targets: selectedPlanTypes,
      ids: [],
      successTitle: 'Templates cleared',
      successMessage:
        selectedPlanTypes.length === 1
          ? `Cleared templates for ${selectedPlanTypes[0].name}.`
          : `Cleared templates for ${selectedPlanTypes.length} selected plan types.`,
      errorTitle: 'Clear failed',
      errorMessage: 'Unable to clear templates.',
    });
  }, [selectedPlanTypes, updatePlanTemplates]);

  const handleClearSinglePlanType = useCallback(
    async (planType: PlanType) => {
      await updatePlanTemplates({
        targets: [planType],
        ids: [],
        successTitle: 'Templates cleared',
        successMessage: `Cleared templates for ${planType.name}.`,
        errorTitle: 'Clear failed',
        errorMessage: 'Unable to clear templates.',
      });
    },
    [updatePlanTemplates]
  );

  const handleRemoveAssignedTemplate = useCallback(
    async (planType: PlanType, selectedIds: string[], templateId: string) => {
      await updatePlanTemplates({
        targets: [planType],
        ids: selectedIds.filter((id) => id !== templateId),
        successTitle: 'Template removed',
        successMessage: `Removed template from ${planType.name}.`,
        errorTitle: 'Update failed',
        errorMessage: 'Unable to remove template.',
        toastOnSuccess: false,
      });
    },
    [updatePlanTemplates]
  );

  const savePlanTemplates = async (ids: string[]) => {
    if (planDialogTargets.length === 0) return;

    const updated = await updatePlanTemplates({
      targets: planDialogTargets,
      ids,
      successTitle: 'Plan templates saved',
      successMessage:
        planDialogTargets.length === 1
          ? `Updated templates for ${planDialogTargets[0].name}.`
          : `Updated templates for ${planDialogTargets.length} selected plan types.`,
      errorTitle: 'Save failed',
      errorMessage: 'Unable to save templates.',
    });

    if (updated) {
      closePlanDialog(false);
    }
  };

  const handleSettingsDialogChange = useCallback(
    (open: boolean) => {
      if (!open && loading) return;

      setSettingsDialogOpen(open);

      if (!open) {
        resetForm();
      }
    },
    [loading, resetForm]
  );

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    const updates: Partial<FormState> = {};

    (Object.keys(form) as Array<keyof FormState>).forEach((key) => {
      const value = form[key];
      if (value && value.trim() !== '') updates[key] = value;
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
        } catch (error) {
          reject(error);
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
      await queryClient.invalidateQueries({ queryKey: ['commTemplates'] });

      setSettingsDialogOpen(false);
    } catch (error: any) {
      pushToast({
        type: 'error',
        title: 'Save failed',
        message: getErrorMessage(error) || 'Unable to save settings.',
      });
    } finally {
      setLoading(false);
    }
  }

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

              for (const planType of planTypes) {
                next[planType.id] = true;
              }

              setSelectedRows(next);
            }}
          />
        ),
        cell: ({ row: tableRow }) => (
          <Checkbox
            checked={!!selectedRows[tableRow.original.id]}
            onCheckedChange={(checked) => {
              setSelectedRows((prev) => {
                const next = { ...prev };

                if (checked === true) next[tableRow.original.id] = true;
                else delete next[tableRow.original.id];

                return next;
              });
            }}
          />
        ),
      },
      {
        accessorKey: 'name',
        header: 'Plan Type',
        cell: ({ row: tableRow }) => <div>{tableRow.original.name}</div>,
      },
      {
        id: 'assignedTemplates',
        header: 'Assigned Templates',
        cell: ({ row: tableRow }) => (
          <PlanTypeAssignedTemplatesCell
            planType={tableRow.original}
            templateMap={templateMap}
            isDev={isDev}
            busy={savingPlanTemplates}
            onAssign={openPlanDialog}
            onLoadedSelection={handleRowTemplatesLoaded}
            onRemoveTemplate={handleRemoveAssignedTemplate}
          />
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row: tableRow }) => (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => handleClearSinglePlanType(tableRow.original)} disabled={savingPlanTemplates}>
              Clear All
            </Button>
          </div>
        ),
      },
    ];
  }, [
    allSelected,
    someSelected,
    planTypes,
    selectedRows,
    templateMap,
    isDev,
    savingPlanTemplates,
    openPlanDialog,
    handleRowTemplatesLoaded,
    handleRemoveAssignedTemplate,
    handleClearSinglePlanType,
  ]);

  const templateSectionLoading = hasCredentials && (tokenResponse.isLoading || commTemplates.isLoading || planTypesQuery.isLoading);
  const templateSectionError = hasCredentials ? tokenResponse.error || commTemplates.error || planTypesQuery.error : null;
  const topActionHelperText = !hasCredentials
    ? 'Enter Everbridge credentials before loading templates.'
    : selectedPlanTypes.length === 0
      ? 'Select one or more rows to use the top actions.'
      : selectedPlanTypesLoaded
        ? `${selectedPlanTypes.length} ${selectedPlanTypes.length === 1 ? 'row' : 'rows'} selected.`
        : 'Selected rows can still be updated while assignments finish loading.';

  if (settingsQuery.isLoading) {
    return <div className="p-4 text-sm text-zinc-500">Loading settings...</div>;
  }

  if (settingsQuery.error) {
    return <div className="p-6 text-red-600">Failed to load settings: {getErrorMessage(settingsQuery.error)}</div>;
  }

  return (
    <div className="h-full w-full">
      <div className="flex flex-col gap-6 p-6">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold text-zinc-900">Plan Types and Templates</h2>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                size="sm"
                className="gap-2 !bg-primary text-white font-semibold"
                onClick={handleAssignSelectedPlans}
                disabled={!hasCredentials || selectedPlanTypes.length === 0 || templateSectionLoading || savingPlanTemplates}>
                <Plus className="h-4 w-4" />
                Assign Template
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-[#DEE9FF] !text-primary font-semibold"
                onClick={handleClearSelectedPlans}
                disabled={!hasCredentials || selectedPlanTypes.length === 0 || templateSectionLoading || savingPlanTemplates}>
                <XCircle className="h-4 w-4" color="#0042B6" />
                Clear Templates
              </Button>

              <Button variant="outline" size="icon" className="h-8 w-8 border-[#DEE9FF]" onClick={() => setSettingsDialogOpen(true)} aria-label="Open Everbridge settings">
                <SettingsIcon className="h-4 w-4" color="#0042B6" />
              </Button>
            </div>
          </div>

          {/* <div className="mb-4 text-xs text-zinc-500">{topActionHelperText}</div> */}

          {!hasCredentials ? (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-700">
              <div className="font-medium text-zinc-900">Everbridge credentials are required before templates can load.</div>
              <div className="mt-4">
                <Button size="sm" variant="outline" className="!bg-primary text-white" onClick={() => setSettingsDialogOpen(true)}>
                  Open Settings
                </Button>
              </div>
            </div>
          ) : templateSectionLoading ? (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600">Loading templates...</div>
          ) : templateSectionError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              Failed to load templates: {getErrorMessage(templateSectionError)}
            </div>
          ) : (
            <DataTable data={planTypes} columns={columns} emptyText="No plan types found." />
          )}
        </div>
      </div>

      <Dialog open={settingsDialogOpen} onOpenChange={handleSettingsDialogChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Everbridge Settings</DialogTitle>
            <DialogDescription>Credentials are stored in settings and used before the templates table loads.</DialogDescription>
          </DialogHeader>

          <form
            className="space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
              handleSave();
            }}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => handleSettingsDialogChange(false)} disabled={loading}>
                Cancel
              </Button>

              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AssignTemplatesDialog
        open={planDialogOpen}
        title={`Assign Templates - ${getPlanTargetLabel(planDialogTargets)}`}
        description={
          planDialogTargets.length > 1
            ? 'Saving will apply the same assigned template set to each selected plan type.'
            : 'Choose the templates that should be assigned to this plan type.'
        }
        templates={templates}
        initialSelectedIds={planDialogInitialSelectedIds}
        saving={savingPlanTemplates}
        onOpenChange={closePlanDialog}
        onSave={savePlanTemplates}
      />
    </div>
  );
}
