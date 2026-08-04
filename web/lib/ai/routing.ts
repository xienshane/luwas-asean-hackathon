import type { OptimizeRoutesRequest, OptimizeRoutesResponse } from '@/lib/types/routing';
import { postAiJson } from './fetchJson';

// OR-Tools VRP. The cost matrix is always the pgRouting real-road matrix, never Euclidean.
export function optimizeRoutes(req: OptimizeRoutesRequest): Promise<OptimizeRoutesResponse> {
  return postAiJson<OptimizeRoutesResponse>('/optimize-routes', req, 'optimize-routes');
}
