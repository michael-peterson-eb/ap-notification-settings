import { useMutation, useQueryClient } from '@tanstack/react-query';

type UseUpdatePlanTemplateCategoryArgs = {
  planTypeId?: string | number | null;
  enabled?: boolean;
};

export function useUpdatePlanTemplateCategory({ planTypeId, enabled = true }: UseUpdatePlanTemplateCategoryArgs) {
  const qc = useQueryClient();

  const hasPlanType = planTypeId !== null && planTypeId !== undefined && String(planTypeId).trim() !== '';

  const queryKey = ['planTemplateCategory', planTypeId] as const;

  return useMutation({
    mutationFn: async (csv: string) => {
      if (!enabled || !hasPlanType) {
        throw new Error('updatePlanTemplateCategory called without a valid planTypeId');
      }

      // @ts-expect-error - global _RB
      return _RB.updateRecord('EA_SA_PlanType', planTypeId, {
        bcicTemplateCategory: csv,
      });
    },

    // Optimistic update: make UI reflect new CSV immediately
    onMutate: async (csv: string) => {
      await qc.cancelQueries({ queryKey });

      const previous = qc.getQueryData<string | null>(queryKey);

      // your read hook normalizes empty to null; keep that behavior
      qc.setQueryData<string | null>(queryKey, csv?.trim() ? csv : null);

      return { previous };
    },

    // Roll back if the update fails
    onError: (_err, _csv, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(queryKey, ctx.previous);
      }
    },

    // Always re-fetch after to ensure we match server truth
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey });
    },
  });
}
