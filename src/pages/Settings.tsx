import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Settings as SettingsIcon, XCircle } from 'lucide-react';

import { DataTable } from 'components/DataTable';
import { Button } from 'components/ui/button';
import { Checkbox } from 'components/ui/checkbox';
import { useCommTemplates } from 'hooks/useCommTemplates';
import { useEverbridgeSettingsRow } from 'hooks/useEverbridgeSettingsRow';
import { useEverbridgeToken } from 'hooks/useEverbridgeToken';
import { useToasts } from 'hooks/useToasts';

import { AssignTemplatesDialog } from './settings/AssignTemplatesDialog';
import { PlanTypeAssignedTemplatesCell } from './settings/PlanTypeAssignedTemplatesCell';
import { SettingsModal } from './settings/SettingsModal';
import type { CommTemplate, FormState, PlanType } from './settings/types';
import { usePlanTypes } from './settings/usePlanTypes';
import {
  getAttachAutomaticallyTaskListBehaviorId,
  getErrorMessage,
  getPlanTargetLabel,
  getTemplateLabel,
  hasPlanTypeTaskListBehavior,
  hasStoredCredentials,
  updatePlanTypeTemplateCategory,
} from './settings/utils';

type PlanTemplateMutationArgs = {
  targets: PlanType[];
  csv: string;
};

type UpdatePlanTemplatesArgs = {
  targets: PlanType[];
  ids: string[];
  successTitle: string;
  successMessage: string;
  errorTitle: string;
  errorMessage: string;
  toastOnSuccess?: boolean;
};

const SETTINGS_TABS = [{ id: 'eb360-communications', label: 'EB360 Communications' }] as const;

type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

export default function Settings() {
  const isDev = process.env.NODE_ENV === 'development';

  const { pushToast } = useToasts();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<SettingsTabId>(SETTINGS_TABS[0].id);
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
      const defaultTaskListBehaviorId = targets.some((target) => !hasPlanTypeTaskListBehavior(target)) ? await getAttachAutomaticallyTaskListBehaviorId() : null;

      for (const target of targets) {
        await updatePlanTypeTemplateCategory(target, csv, defaultTaskListBehaviorId);
      }
    },
    onMutate: async ({ targets, csv }) => {
      const nextValue = csv.trim() ? csv : null;
      const snapshots: Array<{
        queryKey: readonly ['planTemplateCategory', number];
        previous: string | null | undefined;
      }> = [];

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
      context?.snapshots?.forEach((snapshot) => {
        queryClient.setQueryData(snapshot.queryKey, snapshot.previous);
      });
    },
    onSettled: async (_data, _error, variables) => {
      await Promise.all([
        ...variables.targets.map((target) => queryClient.invalidateQueries({ queryKey: ['planTemplateCategory', target.id] })),
        queryClient.invalidateQueries({ queryKey: ['planTypes'] }),
      ]);
    },
  });

  const savingPlanTemplates = planTemplateMutation.isPending;

  const updatePlanTemplates = useCallback(
    async ({ targets, ids, successTitle, successMessage, errorTitle, errorMessage, toastOnSuccess = true }: UpdatePlanTemplatesArgs) => {
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
      selectedPlanTypes.length === 1 ? (rowTemplateIdsByPlanType[selectedPlanTypes[0].id] ?? []) : selectedPlanTypes.flatMap((planType) => rowTemplateIdsByPlanType[planType.id] ?? []);

    openPlanDialog(selectedPlanTypes, initialSelectedIds);
  }, [openPlanDialog, rowTemplateIdsByPlanType, selectedPlanTypes]);

  const handleClearSelectedPlans = useCallback(async () => {
    if (selectedPlanTypes.length === 0) return;

    await updatePlanTemplates({
      targets: selectedPlanTypes,
      ids: [],
      successTitle: 'Templates cleared',
      successMessage: selectedPlanTypes.length === 1 ? `Cleared templates for ${selectedPlanTypes[0].name}.` : `Cleared templates for ${selectedPlanTypes.length} selected plan types.`,
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

  const savePlanTemplates = useCallback(
    async (ids: string[]) => {
      if (planDialogTargets.length === 0) return;

      const updated = await updatePlanTemplates({
        targets: planDialogTargets,
        ids,
        successTitle: 'Plan templates saved',
        successMessage: planDialogTargets.length === 1 ? `Updated templates for ${planDialogTargets[0].name}.` : `Updated templates for ${planDialogTargets.length} selected plan types.`,
        errorTitle: 'Save failed',
        errorMessage: 'Unable to save templates.',
      });

      if (updated) {
        closePlanDialog(false);
      }
    },
    [closePlanDialog, planDialogTargets, updatePlanTemplates]
  );

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

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
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
  }, [form, pushToast, queryClient, row?.id]);

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
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-[#DEE9FF] !text-primary font-semibold"
              onClick={() => handleClearSinglePlanType(tableRow.original)}
              disabled={savingPlanTemplates}>
              <XCircle className="h-4 w-4" color="#0042B6" />
              Clear All
            </Button>
          </div>
        ),
      },
    ];
  }, [allSelected, someSelected, planTypes, selectedRows, templateMap, isDev, savingPlanTemplates, openPlanDialog, handleRowTemplatesLoaded, handleRemoveAssignedTemplate, handleClearSinglePlanType]);

  const templateSectionLoading = hasCredentials && (tokenResponse.isLoading || commTemplates.isLoading || planTypesQuery.isLoading);
  const templateSectionError = hasCredentials ? tokenResponse.error || commTemplates.error || planTypesQuery.error : null;

  if (settingsQuery.isLoading) {
    return <div className="p-4 text-sm text-zinc-500">Loading settings...</div>;
  }

  if (settingsQuery.error) {
    return <div className="p-6 text-red-600">Failed to load settings: {getErrorMessage(settingsQuery.error)}</div>;
  }

  return (
    <div className="h-full w-full">
      <div className="flex flex-col gap-6 pt-6">
        <div className="border-b border-[#CFD8DC]">
          <div role="tablist" aria-label="Notification settings integrations" className="flex items-end gap-8">
            {SETTINGS_TABS.map((tab) => {
              const isActive = tab.id === activeTab;

              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`settings-tab-${tab.id}`}
                  aria-selected={isActive}
                  aria-controls={`settings-panel-${tab.id}`}
                  tabIndex={isActive ? 0 : -1}
                  className={[
                    'relative -mb-px border-b-2 px-1 pb-2 text-sm font-bold transition-colors',
                    isActive ? '!border-primary !text-primary' : 'border-transparent text-zinc-500 hover:text-zinc-800',
                  ].join(' ')}
                  onClick={() => setActiveTab(tab.id)}>
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div role="tabpanel" id={`settings-panel-${activeTab}`} aria-labelledby={`settings-tab-${activeTab}`} className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold text-zinc-900">Plan Types and Templates</h2>
              <div className="text-sm text-zinc-500">Selected rows: {selectedPlanTypes.length}</div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                size="sm"
                className="gap-2 !bg-primary font-semibold text-white"
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
            <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">Failed to load templates: {getErrorMessage(templateSectionError)}</div>
          ) : (
            <DataTable data={planTypes} columns={columns} emptyText="No plan types found." />
          )}
        </div>
      </div>

      <SettingsModal open={settingsDialogOpen} loading={loading} form={form} onOpenChange={handleSettingsDialogChange} onFieldChange={updateField} onSave={handleSave} />

      <AssignTemplatesDialog
        open={planDialogOpen}
        title={`Assign Templates - ${getPlanTargetLabel(planDialogTargets)}`}
        description={planDialogTargets.length > 1 ? 'Saving will apply the same assigned template set to each selected plan type.' : 'Choose the templates that should be assigned to this plan type.'}
        templates={templates}
        initialSelectedIds={planDialogInitialSelectedIds}
        saving={savingPlanTemplates}
        onOpenChange={closePlanDialog}
        onSave={savePlanTemplates}
      />
    </div>
  );
}
