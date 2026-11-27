import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@/lib/api-client';

export function useVideoPurchase(userId?: string) {
  return useQuery({
    queryKey: ['video-purchase', userId],
    queryFn: () =>
      apiGet<{ canGenerate: boolean; firstPurchaseEligible: boolean }>(
        '/api/videos?access=1'
      ),
    enabled: !!userId,
    staleTime: 10_000,
  });
}
