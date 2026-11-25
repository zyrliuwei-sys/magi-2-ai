import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/core/auth/client';
import { apiGet } from '@/lib/api-client';

export interface UserPermissions {
  isAdmin: boolean;
  permissions?: string[];
}

// Current user's permission summary — shared by site-user-menu and
// app-layout (single network call, react-query dedupes).
export function useUserPermissions(enabled = true) {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  return useQuery({
    queryKey: ['user-permissions', userId],
    queryFn: ({ signal }) =>
      apiGet<UserPermissions>('/api/user/permissions', {
        signal,
        cache: 'no-store',
      }),
    staleTime: 5 * 60_000,
    enabled: enabled && !!userId,
  });
}
