export type FormState = {
  eb_client_id: string;
  eb_client_secret: string;
  eb_username: string;
  eb_user_password: string;
  eb_role_id: string;
};

export type PlanType = {
  id: number;
  name: string;
  taskListBehavior: string | null;
  taskListBehaviorCode: string | null;
};

export type CommTemplate = {
  id: number | string;
  name?: string;
  title?: string;
};
