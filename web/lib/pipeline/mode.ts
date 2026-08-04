// Request contract shared by the coordinator dashboard and /api/pipeline.
//
//   full    — the whole stack: rescore -> impact -> manifest -> route.
//   reroute — redraw planned routes from already-persisted manifests, skipping the
//             prediction and manifest stages (blocking a road changes the graph, not
//             the need). The fast path itself lands with W2's B4; until then the route
//             accepts and echoes the mode while still running full.
export type PipelineMode = 'full' | 'reroute';

export const DEFAULT_PIPELINE_MODE: PipelineMode = 'full';

/** Reads `mode` off a request body, falling back to `full` for anything unrecognised. */
export function parsePipelineMode(body: unknown): PipelineMode {
  const mode = (body as { mode?: unknown } | null | undefined)?.mode;
  return mode === 'reroute' ? 'reroute' : DEFAULT_PIPELINE_MODE;
}
