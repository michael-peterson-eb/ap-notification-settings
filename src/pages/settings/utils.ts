import type { CommTemplate, PlanType } from './types';

export function updatePlanTypeTemplateCategory(planTypeId: number, csv: string) {
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

export function rbfSelectQueryPromise<T>(sql: string, limit: number, map: (rows: any[]) => T, timeoutMs = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    let finished = false;

    const timer = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error(`rbf_selectQuery timed out after ${timeoutMs}ms: ${sql}`));
    }, timeoutMs);

    const finishResolve = (value: T) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      resolve(value);
    };

    const finishReject = (error: any) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      reject(error);
    };

    try {
      // @ts-expect-error rbf_selectQuery is global
      rbf_selectQuery(
        sql,
        limit,
        (values: any[]) => {
          try {
            finishResolve(map(values ?? []));
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

export function csvToSet(csv: string | null | undefined) {
  if (!csv) return new Set<string>();

  return new Set(
    csv
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

export function getTemplateLabel(template: CommTemplate) {
  return String(template.name ?? template.title ?? `Template ${template.id}`);
}

export function getErrorMessage(error: any) {
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

export function hasStoredCredentials(row: { eb_client_id?: string; eb_username?: string; eb_role_id?: string } | null | undefined) {
  return Boolean(row?.eb_client_id?.trim() && row?.eb_username?.trim() && row?.eb_role_id?.trim());
}

export function getPlanTargetLabel(targets: PlanType[]) {
  if (targets.length === 1) return targets[0].name;
  return `${targets.length} selected plan types`;
}
