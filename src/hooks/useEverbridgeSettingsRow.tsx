import { useQuery } from '@tanstack/react-query';

export type EverbridgeSettingsRow = {
  id: number;
  eb_client_id: string;
  eb_client_secret: string;
  eb_username: string;
  eb_user_password: string;
  eb_role_id: string;
};

function toStr(v: any) {
  return v == null ? '' : String(v);
}
function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchSettingsRow(): Promise<EverbridgeSettingsRow | null> {
  const rows: any = await new Promise((resolve) => {
    const queryStr = 'SELECT id, eb_client_id, eb_username, eb_role_id FROM $SETTINGS';

    //@ts-expect-error rbf is attached to window
    rbf_selectQuery(queryStr, 1, (res: any) => resolve(res), true);
  });

  if (!rows?.[0]) return null;

  const [id, clientId, username, roleId] = rows[0];
  const parsedId = toNum(id);

  if (parsedId == null) return null;

  return {
    id: parsedId,
    eb_client_id: toStr(clientId),
    eb_client_secret: toStr(''),
    eb_username: toStr(username),
    eb_user_password: toStr(''),
    eb_role_id: toStr(roleId),
  };
}

export function useEverbridgeSettingsRow(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['everbridgeSettingsRow'],
    queryFn: fetchSettingsRow,
    enabled: opts?.enabled ?? true,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 0,
  });
}
