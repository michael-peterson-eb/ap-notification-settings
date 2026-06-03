import { useQuery } from '@tanstack/react-query';

import type { PlanType } from './types';
import { PLAN_TYPE_TASK_LIST_BEHAVIOR_FIELD, rbfSelectQueryPromise } from './utils';

function nullableString(value: unknown) {
  if (value === null || value === undefined) return null;

  const stringValue = String(value).trim();
  return stringValue ? stringValue : null;
}

export function usePlanTypes(enabled = true) {
  return useQuery({
    queryKey: ['planTypes'],
    enabled,
    queryFn: async (): Promise<PlanType[]> => {
      return rbfSelectQueryPromise(`SELECT id, name, ${PLAN_TYPE_TASK_LIST_BEHAVIOR_FIELD}, ${PLAN_TYPE_TASK_LIST_BEHAVIOR_FIELD}#code FROM EA_SA_PlanType ORDER BY name`, 1000, (values) => {
        const list = (values ?? []).map((value) => {
          const idRaw = value?.[0];
          const nameRaw = value?.[1];
          const taskListBehaviorRaw = value?.[2];
          const taskListBehaviorCodeRaw = value?.[3];

          return {
            id: Number(idRaw),
            name: nameRaw == null ? '' : String(nameRaw),
            taskListBehavior: nullableString(taskListBehaviorRaw),
            taskListBehaviorCode: nullableString(taskListBehaviorCodeRaw),
          } as PlanType;
        });

        return list.filter((planType) => Number.isFinite(planType.id) && planType.name);
      });
    },
    staleTime: 5 * 60 * 1000,
  });
}
