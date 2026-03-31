import { useEffect, useMemo } from 'react';
import { Plus } from 'lucide-react';

import { Button } from 'components/ui/button';
import { usePlanTemplateCategory } from 'hooks/usePlanTemplateCategory';

import { TemplateChip } from './TemplateChip';
import type { PlanType } from './types';
import { csvToSet } from './utils';

type PlanTypeAssignedTemplatesCellProps = {
  planType: PlanType;
  templateMap: Map<string, string>;
  isDev: boolean;
  busy: boolean;
  onAssign: (targets: PlanType[], selectedIds: string[]) => void;
  onLoadedSelection: (planTypeId: number, selectedIds: string[]) => void;
  onRemoveTemplate: (planType: PlanType, selectedIds: string[], templateId: string) => void;
};

export function PlanTypeAssignedTemplatesCell({
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

