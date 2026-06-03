import type { CommTemplate, PlanType } from './types';

export const PLAN_TYPE_OBJECT = 'EA_SA_PlanType';
export const PLAN_TYPE_TEMPLATE_CATEGORY_FIELD = 'bcicTemplateCategory';
export const PLAN_TYPE_TASK_LIST_BEHAVIOR_FIELD = 'EA_SA_ddlTaskListBehavior';

const DEFAULT_TASK_LIST_BEHAVIOR_CODE = 'EA_SA_Automatic';

type PicklistOption = {
  id?: string | number;
  code?: string | number;
};

let defaultTaskListBehaviorIdPromise: Promise<string | number> | null = null;

function isBlankValue(value: unknown) {
  return value === null || value === undefined || String(value).trim() === '';
}

export function getAttachAutomaticallyTaskListBehaviorId() {
  if (!defaultTaskListBehaviorIdPromise) {
    defaultTaskListBehaviorIdPromise = new Promise<string | number>((resolve, reject) => {
      const resolveFromPicklist = (options: PicklistOption[]) => {
        const option = options.find((item) => String(item.code ?? '').trim() === DEFAULT_TASK_LIST_BEHAVIOR_CODE);
        const id = option?.id;

        if (isBlankValue(id)) {
          reject(new Error(`Unable to find picklist option id for ${PLAN_TYPE_TASK_LIST_BEHAVIOR_FIELD} code "${DEFAULT_TASK_LIST_BEHAVIOR_CODE}".`));
          return;
        }

        resolve(id);
      };

      const rbGetPicklist = (window as any)._RB?.getPicklist;
      if (typeof rbGetPicklist === 'function') {
        Promise.resolve(rbGetPicklist(PLAN_TYPE_OBJECT, PLAN_TYPE_TASK_LIST_BEHAVIOR_FIELD)).then(resolveFromPicklist, reject);
        return;
      }

      const rbfGetPicklist = (window as any).rbf_getPicklist;
      if (typeof rbfGetPicklist !== 'function') {
        reject(new Error(`Unable to load picklist options for ${PLAN_TYPE_OBJECT}.${PLAN_TYPE_TASK_LIST_BEHAVIOR_FIELD}.`));
        return;
      }

      try {
        rbfGetPicklist(PLAN_TYPE_OBJECT, PLAN_TYPE_TASK_LIST_BEHAVIOR_FIELD, 0, resolveFromPicklist);
      } catch (error) {
        reject(error);
      }
    }).catch((error) => {
      defaultTaskListBehaviorIdPromise = null;
      throw error;
    });
  }

  return defaultTaskListBehaviorIdPromise;
}

export function hasPlanTypeTaskListBehavior(planType: Pick<PlanType, 'taskListBehavior' | 'taskListBehaviorCode'>) {
  return !isBlankValue(planType.taskListBehavior) || !isBlankValue(planType.taskListBehaviorCode);
}

export async function updatePlanTypeTemplateCategory(planType: PlanType, csv: string, defaultTaskListBehaviorId?: string | number | null) {
  const fields: Record<string, string | number> = {
    [PLAN_TYPE_TEMPLATE_CATEGORY_FIELD]: csv,
  };

  if (!hasPlanTypeTaskListBehavior(planType)) {
    const taskListBehaviorId = isBlankValue(defaultTaskListBehaviorId) ? await getAttachAutomaticallyTaskListBehaviorId() : defaultTaskListBehaviorId;

    if (isBlankValue(taskListBehaviorId)) {
      throw new Error(`Unable to update ${planType.name}. ${PLAN_TYPE_TASK_LIST_BEHAVIOR_FIELD} is blank and no default option id was found.`);
    }

    fields[PLAN_TYPE_TASK_LIST_BEHAVIOR_FIELD] = taskListBehaviorId;
  }

  return new Promise((resolve, reject) => {
    try {
      const rbfUpdateRecord = (window as any).rbf_updateRecord;

      if (typeof rbfUpdateRecord !== 'function') {
        throw new Error('rbf_updateRecord is not available.');
      }

      rbfUpdateRecord(PLAN_TYPE_OBJECT, planType.id, fields, true, (data: any) => resolve(data));
      return;
    } catch (_error) {
      try {
        const rbUpdateRecord = (window as any)._RB?.updateRecord;

        if (typeof rbUpdateRecord !== 'function') {
          throw _error;
        }

        Promise.resolve(rbUpdateRecord(PLAN_TYPE_OBJECT, planType.id, fields, true)).then(resolve, reject);
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
