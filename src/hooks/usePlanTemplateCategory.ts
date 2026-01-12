import { useQuery } from '@tanstack/react-query';

type UsePlanTemplateCategoryArgs = {
  planType?: string | number | null;
  enabled?: boolean;
  isDev?: boolean;
};

export function usePlanTemplateCategory({ planType, enabled = true, isDev = false }: UsePlanTemplateCategoryArgs) {
  const hasPlanType = planType !== null && planType !== undefined && String(planType).trim() !== '';
  const queryEnabled = enabled && !isDev && hasPlanType;

  return useQuery({
    queryKey: ['planTemplateCategory', planType],
    enabled: queryEnabled,
    retry: 0,
    queryFn: async () => {
      // @ts-expect-error - global _RB
      const rows = await _RB.selectQuery(['bcicTemplateCategory'], 'EA_SA_PlanType', `id = ${planType}`, 1, true);

      // supports either raw array return or { data: [...] }
      const first = Array.isArray(rows) ? rows[0] : Array.isArray(rows?.data) ? rows.data[0] : undefined;

      const category = first?.bcicTemplateCategory;

      // normalize empty/undefined to null
      return category ? String(category) : null;
    },
  });
}
