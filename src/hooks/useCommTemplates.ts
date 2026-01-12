import { useQuery } from '@tanstack/react-query';

export type CommTemplate = {
  id: string | number;
  name?: string;
  title?: string;
  [k: string]: unknown;
};

function normalizeTemplates(payload: any): CommTemplate[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.templates)) return payload.templates;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

async function fetchCommTemplates(token: string): Promise<CommTemplate[]> {
  const resp = await fetch(
    'https://api.everbridge.net/managerapps/communications/v1/templates/?sortBy=name&sortDirection=asc',
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const json = await resp.json();
  
  if (!resp.ok) throw json;

  return normalizeTemplates(json);
}

/**
 * Fetch Everbridge communication templates
 *
 * @param token Bearer token (id_token)
 */
export function useCommTemplates(token?: string) {
  return useQuery({
    queryKey: ['commTemplates'],
    enabled: !!token,
    queryFn: () => fetchCommTemplates(token!),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
