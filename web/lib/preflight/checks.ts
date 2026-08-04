// Every stage dependency as one green/red list. A failing row must name the fix, not just
// the symptom: this is read two minutes before walking on stage.

export interface Check {
  id: string;
  label: string;
  state: 'pass' | 'fail';
  detail: string;
}

export interface AiHealth {
  status?: string;
  tabpfn_active?: boolean;
  parse_providers?: { sea_lion?: boolean; gemini?: boolean; sea_lion_model?: string | null };
}

export interface PreflightFacts {
  aiHealth: AiHealth | null;
  aiError: string | null;
  probe: { provider: string; latencyMs: number } | null;
  probeError: string | null;
  barangayCount: number | null;
  dbError: string | null;
  depotCount: number | null;
  teamsWithCapacity: number | null;
  smsMockEnabled: boolean;
  smsSecretSet: boolean;
  demoConsoleEnabled: boolean;
}

const check = (id: string, label: string, ok: boolean, pass: string, fail: string): Check =>
  ({ id, label, state: ok ? 'pass' : 'fail', detail: ok ? pass : fail });

export function evaluatePreflight(f: PreflightFacts): Check[] {
  const providers = f.aiHealth?.parse_providers;
  const model = providers?.sea_lion_model ?? 'model id not reported';

  return [
    check('supabase', 'Supabase read model',
      f.dbError === null && (f.barangayCount ?? 0) > 0,
      `${f.barangayCount} barangays readable`,
      f.dbError ?? 'no barangays returned — the database is empty; run data-pipeline/ against it'),

    check('ai-health', 'AI service reachable',
      f.aiHealth?.status === 'ok',
      'GET /health returned ok',
      f.aiError ?? 'unexpected /health payload — check AI_SERVICE_URL points at a running service'),

    check('tabpfn', 'TabPFN active',
      f.aiHealth?.tabpfn_active === true,
      'tabpfn_active: true',
      'the heuristic fallback is running — check DISABLE_TABPFN is unset and torch is installed. Do not demo on the heuristic'),

    check('sea-lion', 'SEA-LION answering',
      f.probe?.provider === 'sea-lion',
      `live parse via sea-lion in ${f.probe?.latencyMs}ms (${model})`,
      f.probeError
        ? `probe parse failed — ${f.probeError}`
        : `probe answered via ${f.probe?.provider ?? 'nothing'} — SEA_LION_API_KEY is missing, invalid, or the minute quota is spent`),

    check('gemini', 'Gemini fallback configured',
      providers?.gemini === true,
      'the AI service holds a Gemini key',
      'GEMINI_API_KEY is unset on the AI service — the keyless run has nothing to fall back to'),

    check('depot', 'Exactly one depot',
      f.depotCount === 1,
      'one depot configured',
      `${f.depotCount ?? 0} rows in coordinator_facilities have is_depot = true; the pipeline reads exactly one`),

    check('teams', 'Teams with capacity',
      (f.teamsWithCapacity ?? 0) >= 1,
      `${f.teamsWithCapacity} team(s) with capacity_kg`,
      'no team has capacity_kg — OR-Tools has no vehicle, so every stop drops'),

    check('sms-mock', 'SMS mock intake armed',
      f.smsMockEnabled && f.smsSecretSet,
      'ENABLE_SMS_MOCK=true and the webhook secret is set',
      [!f.smsMockEnabled && 'ENABLE_SMS_MOCK is not "true"', !f.smsSecretSet && 'SMS_WEBHOOK_SECRET is unset']
        .filter(Boolean).join('; ')),

    check('demo-console', 'Demo console enabled',
      f.demoConsoleEnabled,
      'NEXT_PUBLIC_DEMO_CONSOLE=true',
      'NEXT_PUBLIC_DEMO_CONSOLE is unset — the `~ 1` / `~ 2` keys do nothing and nothing on stage can be typed'),
  ];
}
