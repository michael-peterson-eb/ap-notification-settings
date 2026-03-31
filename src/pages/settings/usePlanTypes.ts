import { useQuery } from '@tanstack/react-query';

import type { PlanType } from './types';
import { rbfSelectQueryPromise } from './utils';

export function usePlanTypes(enabled = true) {
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

