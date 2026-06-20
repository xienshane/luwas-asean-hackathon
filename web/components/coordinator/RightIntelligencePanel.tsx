'use client';

import React, { useState, useEffect } from 'react';
import type { Barangay, ImpactPrediction, SupplyManifest, Team, Route, LocationHub } from '@/lib/types/coordinator';
import { DetailPanel, Segmented, Stat, Chip, CoverageBar, Section, silentAreaState, STATE_LABEL, STATE_COLOR } from './ui';
import type { ChipTone } from './ui';
import { Activity, Info, PackageOpen, Truck, Ship, Ambulance, Car } from 'lucide-react';
import { estDistanceKm, capacityFit, recommendTeam, type Fit } from '@/lib/coordinator/dispatchMatch';

// Team-type icon in the same language as the map markers.
function TeamIcon({ type }: { type: Team['type'] }) {
  const cls = 'w-4 h-4 text-muted shrink-0';
  if (type === 'boat') return <Ship className={cls} aria-hidden />;
  if (type === 'ambulance') return <Ambulance className={cls} aria-hidden />;
  if (type === '4x4') return <Car className={cls} aria-hidden />;
  return <Truck className={cls} aria-hidden />;
}

const FIT_META: Record<Fit, { tone: ChipTone; label: string }> = {
  fits: { tone: 'active', label: 'Fits' },
  tight: { tone: 'warning', label: 'Tight' },
  short: { tone: 'critical', label: 'Short' },
};

// Manifest review status → chip tone.
const MANIFEST_TONE: Record<string, ChipTone> = {
  approved: 'active',
  modified: 'warning',
  rejected: 'critical',
  pending: 'muted',
};
import { lowConfidenceReason } from '@/lib/coordinator/confidence';
import { pickAffected, affectedSource } from '@/lib/pipeline/affected';

interface RightIntelligencePanelProps {
  selectedBarangay: Barangay | null;
  barangays: Barangay[];
  reportsCount: number;
  scores: { barangayId: string; score: number; hoursSinceContact: number | null }[];
  prediction: ImpactPrediction | undefined;
  manifest: SupplyManifest | undefined;
  facilities?: LocationHub[];
  teams: Team[];
  routes: Route[];
  onSaveOverrides: (
    barangayId: string,
    affectedOverride: number | null,
    suppliesOverride: { waterL?: number; foodPacks?: number; shelterKits?: number; blankets?: number; hygieneKits?: number; medicalSupplies?: number; shelterMaterials?: number } | null
  ) => void;
  onUpdateManifestStatus: (barangayId: string, status: 'approved' | 'modified' | 'rejected') => void;
  onDispatchTeam: (teamId: string, barangayId: string) => void;
  onMarkReached: (routeId: string) => void;
  onClearBarangaySelection: () => void;
}

type Tab = 'overview' | 'supplies' | 'dispatch';

export default function RightIntelligencePanel({
  selectedBarangay,
  scores,
  prediction,
  manifest,
  facilities,
  teams,
  onSaveOverrides,
  onUpdateManifestStatus,
  onDispatchTeam,
  onMarkReached,
  routes,
  onClearBarangaySelection,
}: RightIntelligencePanelProps) {
  const [drawerTab, setDrawerTab] = useState<Tab>('overview');
  const [isEditing, setIsEditing] = useState(false);
  
  // Input fields for override parameters
  const [affectedInput, setAffectedInput] = useState('');
  const [waterInput, setWaterInput] = useState('');
  const [foodInput, setFoodInput] = useState('');
  const [blanketInput, setBlanketInput] = useState('');
  const [hygieneInput, setHygieneInput] = useState('');
  const [medicalInput, setMedicalInput] = useState('');
  const [shelterInput, setShelterInput] = useState('');

  useEffect(() => {
    if (selectedBarangay) {
      setAffectedInput(prediction?.overrideValue?.toString() || '');
      setWaterInput('');
      setFoodInput('');
      setBlanketInput('');
      setHygieneInput('');
      setMedicalInput('');
      setShelterInput('');
      setIsEditing(false);
    }
  }, [selectedBarangay, prediction]);

  if (!selectedBarangay) return null;

  const selectedScore = scores.find((s) => s.barangayId === selectedBarangay.id) ?? { score: 0, hoursSinceContact: null };
  const state = silentAreaState(selectedScore.score);

  const isAffectedOverridden = prediction?.overrideValue !== null && prediction?.overrideValue !== undefined;

  const affectedInputs = {
    override: prediction?.overrideValue,
    reported: prediction?.reportedAffected,
    predicted: prediction?.predictedAffected,
  };
  const effectiveAffected = prediction ? pickAffected(affectedInputs) : 0;
  const affectedFrom = prediction ? affectedSource(affectedInputs) : 'none';

  // Phase 4.3 — uncertainty as decision support, not fact.
  // A range is shown when the model carries an 80% interval; a prediction is flagged
  // low-confidence when it came from the heuristic fallback, the model self-reported low
  // confidence, or the interval is wide (spread exceeds the point estimate).
  const hasInterval =
    prediction?.affectedLow != null && prediction?.affectedHigh != null;
  const lowConfReason = lowConfidenceReason(prediction);

  // Read overrides from legacy manifest.overridden object structure (ensure it's an object)
  const manifestOverrides =
    typeof manifest?.overridden === 'object' && manifest?.overridden !== null
      ? (manifest.overridden as {
          waterL?: number;
          foodPacks?: number;
          hygieneKits?: number;
          medicalSupplies?: number;
          shelterMaterials?: number;
          blankets?: number;
        })
      : undefined;

  // Supply figures come from the live Sphere manifest (pipeline output)
  const EMPTY_ITEM = { recommended: 0, inventory: 0, shortfall: 0 };
  const water = manifest?.waterL ?? EMPTY_ITEM;
  const food = manifest?.foodPacks ?? EMPTY_ITEM;
  const blankets = (manifest as { blankets?: typeof EMPTY_ITEM } | undefined)?.blankets ?? EMPTY_ITEM;
  const hygiene = manifest?.hygieneKits ?? EMPTY_ITEM;
  const medical = manifest?.medicalSupplies ?? EMPTY_ITEM;
  const shelter = manifest?.shelterMaterials ?? EMPTY_ITEM;

  const finalWater = manifestOverrides?.waterL ?? water.recommended;
  const finalFood = manifestOverrides?.foodPacks ?? food.recommended;
  const finalBlankets = manifestOverrides?.blankets ?? blankets.recommended;
  const finalHygiene = manifestOverrides?.hygieneKits ?? hygiene.recommended;
  const finalMedical = manifestOverrides?.medicalSupplies ?? medical.recommended;
  const finalShelter = manifestOverrides?.shelterMaterials ?? shelter.recommended;

  const handleSaveOverrides = () => {
    const overrideVal = affectedInput.trim() === '' ? null : parseInt(affectedInput, 10);
    const overrides = {
      waterL: waterInput ? parseInt(waterInput, 10) : undefined,
      foodPacks: foodInput ? parseInt(foodInput, 10) : undefined,
      blankets: blanketInput ? parseInt(blanketInput, 10) : undefined,
      hygieneKits: hygieneInput ? parseInt(hygieneInput, 10) : undefined,
      medicalSupplies: medicalInput ? parseInt(medicalInput, 10) : undefined,
      shelterMaterials: shelterInput ? parseInt(shelterInput, 10) : undefined,
    };

    // Check if at least one supply parameter is being overridden
    const holdsAnyOverride =
      overrides.waterL !== undefined ||
      overrides.foodPacks !== undefined ||
      overrides.blankets !== undefined ||
      overrides.hygieneKits !== undefined ||
      overrides.medicalSupplies !== undefined ||
      overrides.shelterMaterials !== undefined;

    onSaveOverrides(selectedBarangay.id, overrideVal, holdsAnyOverride ? overrides : null);
    setIsEditing(false);
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'supplies', label: 'Supplies' },
    { id: 'dispatch', label: 'Dispatch' },
  ];

  // Source-tagged label for the headline affected figure (verbatim precedence, no logic change).
  const affectedLabel =
    affectedFrom === 'reported' ? 'Reported affected'
    : affectedFrom === 'override' ? 'Overridden affected'
    : 'Est. affected';

  const supplyRows = [
    { label: 'Clean water', value: finalWater, unit: 'L', inv: water.inventory },
    { label: 'Food packs', value: finalFood, unit: 'packs', inv: food.inventory },
    { label: 'Blankets', value: finalBlankets, unit: 'pcs', inv: blankets.inventory },
    { label: 'Hygiene kits', value: finalHygiene, unit: 'kits', inv: hygiene.inventory },
    { label: 'Medical', value: finalMedical, unit: 'packs', inv: medical.inventory },
    { label: 'Shelter', value: finalShelter, unit: 'units', inv: shelter.inventory },
  ];

  const dispatchableTeams = teams.filter((t) => t.status === 'active' || t.status === 'idle');

  // Estimated cargo mass for the capacity-fit signal. Water (1 L ≈ 1 kg) is the dominant mass of
  // a relief load, so we use the manifest's water requirement as the estimate — clearly "est."
  // in the UI (the manifest carries no per-unit weights to sum exactly; honest + free-tier).
  const estCargoKg = finalWater;
  const recommendedTeam = recommendTeam(dispatchableTeams, selectedBarangay, estCargoKg);

  return (
    <DetailPanel
      className="luwas-rail-swap w-[25%] min-w-[340px] max-w-[360px] shrink-0"
      eyebrow="Silent Area"
      title={selectedBarangay.name}
      subtitle={
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATE_COLOR[state] }} />
          {STATE_LABEL[state]} · {selectedBarangay.cityMunicipality}
        </span>
      }
      onClose={onClearBarangaySelection}
      footer={
        drawerTab === 'supplies' ? (
          <div className="p-3 flex items-center gap-2">
            <button
              onClick={() => onUpdateManifestStatus(selectedBarangay.id, 'approved')}
              className="flex-1 min-h-[44px] py-2 bg-active text-bg hover:brightness-110 rounded-control font-medium transition-[filter] duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-active/50"
            >
              Approve manifest
            </button>
            <button
              onClick={() => onUpdateManifestStatus(selectedBarangay.id, 'rejected')}
              className="px-3 min-h-[44px] py-2 text-muted hover:text-critical rounded-control text-[13px] transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-critical/40"
            >
              Reject
            </button>
          </div>
        ) : undefined
      }
    >
      {/* Tabs */}
      <div className="px-2 pt-2 pb-1 border-b border-line">
        <Segmented tabs={tabs} value={drawerTab} onChange={(id) => setDrawerTab(id as Tab)} />
      </div>

      <div className="text-[13px]">
        {/* ── Overview: situation hero ── */}
        {drawerTab === 'overview' && (
          <>
            {prediction ? (
              <div className="px-4 pt-4">
                <Stat
                  label={affectedLabel}
                  value={effectiveAffected.toLocaleString()}
                  unit="people affected"
                  accent={STATE_COLOR[state]}
                  action={<SeverityBadge severity={prediction.damageSeverity} />}
                  range={hasInterval ? { low: prediction.affectedLow!, high: prediction.affectedHigh!, value: effectiveAffected } : undefined}
                  sub={
                    (affectedFrom === 'reported' || affectedFrom === 'override') ? (
                      <span>
                        Model predicted{' '}
                        <span className="font-mono tabular-nums line-through">
                          {prediction.predictedAffected.toLocaleString()}
                        </span>
                      </span>
                    ) : undefined
                  }
                />
                {(lowConfReason || prediction.isDay0 || isAffectedOverridden) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {lowConfReason && (
                      <span title={lowConfReason}>
                        <Chip tone="warning">Low confidence</Chip>
                      </span>
                    )}
                    {prediction.isDay0 && (
                      <span title="Day-0 forecast from a uniform storm scenario (no per-barangay wind footprint). Override-able; not yet confirmed by a field report.">
                        <Chip tone="warning">Predicted · Day 0</Chip>
                      </span>
                    )}
                    {isAffectedOverridden && (
                      <Chip tone="active">Overridden · {prediction.overrideValue?.toLocaleString()}</Chip>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <Section title="Impact prediction" divider={false}>
                <div className="flex flex-col items-center text-center gap-2 rounded-card border border-line bg-raised/30 px-4 py-6">
                  <Activity className="w-5 h-5 text-muted" aria-hidden />
                  <p className="text-[13px] text-muted leading-relaxed">
                    No prediction yet — confirm a report to run the pipeline. The Silent Area
                    score below stays live.
                  </p>
                </div>
              </Section>
            )}

            {/* Demoted metadata grid */}
            <Section title="Barangay" divider={Boolean(prediction)}>
              <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                {[
                  { l: 'Municipality', v: selectedBarangay.cityMunicipality },
                  { l: 'Population', v: selectedBarangay.population.toLocaleString(), mono: true },
                  { l: 'Silent Area score', v: selectedScore.score.toFixed(2), mono: true, color: STATE_COLOR[state] },
                  { l: 'State', v: STATE_LABEL[state], color: STATE_COLOR[state] },
                ].map(({ l, v, mono, color }) => (
                  <div key={l}>
                    <div className="text-[12px] text-muted mb-0.5">{l}</div>
                    <div className={mono ? 'font-mono tabular-nums' : ''} style={color ? { color } : undefined}>
                      {v}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Contributors */}
            {prediction && prediction.contributors && prediction.contributors.length > 0 && (
              <Section title={`Why · ${prediction.model ?? 'TabPFN'}`}>
                <ul className="space-y-1.5 text-[12px] text-muted">
                  {prediction.contributors.map((c, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted shrink-0">—</span>
                      {c}
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}

        {/* ── Supplies ── */}
        {drawerTab === 'supplies' && (
          <>
            <Section
              title="Sphere manifest"
              divider={false}
              action={
                <span className="flex items-center gap-2">
                  <span
                    className="text-muted cursor-help"
                    title="Deterministic Sphere standard: 15 L water + 2,100 kcal per person/day over a 3-day ration. Inventory is the on-hand stock; a shortfall is need minus inventory."
                  >
                    <Info className="w-3.5 h-3.5" aria-hidden />
                  </span>
                  <Chip tone={MANIFEST_TONE[manifest?.status ?? 'pending']}>
                    {manifest?.status ? manifest.status[0].toUpperCase() + manifest.status.slice(1) : 'Pending'}
                  </Chip>
                </span>
              }
            >
              {!manifest && (
                <div className="mb-3 flex flex-col items-center text-center gap-2 rounded-card border border-line bg-raised/30 px-4 py-5">
                  <PackageOpen className="w-5 h-5 text-muted" aria-hidden />
                  <p className="text-[12px] text-muted leading-relaxed">
                    No manifest yet — confirm a report to run the pipeline. Overrides below still apply.
                  </p>
                </div>
              )}
              <div className="space-y-3">
                {supplyRows.map((r) => (
                  <CoverageBar key={r.label} label={r.label} recommended={r.value} onHand={r.inv} unit={r.unit} />
                ))}
              </div>
            </Section>

            <Section title="Coordinator override">
              <button
                onClick={() => setIsEditing((e) => !e)}
                aria-expanded={isEditing}
                className="w-full flex items-center justify-between min-h-[44px] py-2 px-3 bg-raised rounded-control text-muted hover:text-fg transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
              >
                <span>Adjust affected count or per-item targets</span>
                <span className="text-[12px] text-muted">{isEditing ? 'Collapse' : 'Configure'}</span>
              </button>

              {isEditing && (
                <div className="mt-3 space-y-2.5">
                  <Field label="Affected population" value={affectedInput} onChange={setAffectedInput} placeholder={prediction?.predictedAffected.toString()} />
                  <div className="grid grid-cols-2 gap-2.5">
                    <Field label="Water (L)" value={waterInput} onChange={setWaterInput} placeholder={water.recommended.toString()} />
                    <Field label="Food (packs)" value={foodInput} onChange={setFoodInput} placeholder={food.recommended.toString()} />
                    <Field label="Blankets (pcs)" value={blanketInput} onChange={setBlanketInput} placeholder={blankets.recommended.toString()} />
                    <Field label="Hygiene (kits)" value={hygieneInput} onChange={setHygieneInput} placeholder={hygiene.recommended.toString()} />
                    <Field label="Medical (packs)" value={medicalInput} onChange={setMedicalInput} placeholder={medical.recommended.toString()} />
                    <Field label="Shelter (units)" value={shelterInput} onChange={setShelterInput} placeholder={shelter.recommended.toString()} />
                  </div>
                  <button
                    onClick={handleSaveOverrides}
                    className="w-full min-h-[44px] py-2 border border-line text-fg hover:bg-raised rounded-control transition-colors duration-150 cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
                  >
                    Apply overrides
                  </button>
                </div>
              )}
            </Section>
          </>
        )}

        {/* ── Dispatch: match-quality-first ── */}
        {drawerTab === 'dispatch' && (
          <>
            {(() => {
              const activeRoute = routes.find(
                (r) => r.status === 'active' && r.stops.some((s) => s.barangayId === selectedBarangay.id),
              );
              if (!activeRoute) return null;
              return (
                <Section title="Convoy status" divider={false}>
                  <div className="rounded-card border border-active/30 bg-active/10 px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-fg font-medium truncate">{activeRoute.teamName}</span>
                      <Chip tone="active">en route</Chip>
                    </div>
                    <p className="mt-1 text-[12px] text-muted">
                      <span className="font-mono tabular-nums">{(activeRoute.totalDistanceM / 1000).toFixed(1)}</span> km
                      {' · '}
                      <span title="A simulated convoy marker (Part A) glides part-way along the route for the demo and parks short of the destination — decorative, not live tracking.">sim convoy holding mid-route</span>
                    </p>
                    <button
                      onClick={() => onMarkReached(activeRoute.id)}
                      className="mt-3 w-full min-h-[44px] py-2 bg-active text-bg hover:brightness-110 rounded-control font-medium transition-[filter] duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-active/50"
                    >
                      Mark area reached
                    </button>
                  </div>
                </Section>
              );
            })()}

            <Section
              title="Available teams"
              action={
                <span
                  className="text-muted cursor-help"
                  title="Distance is straight-line from the team base (est., not the pgRouting road distance). Fit compares team capacity to the estimated water-dominant cargo mass. OR-Tools computes the real route on dispatch; nothing dispatches automatically."
                >
                  <Info className="w-3.5 h-3.5" aria-hidden />
                </span>
              }
            >
              {dispatchableTeams.length === 0 ? (
                <p className="text-[12px] text-muted">No dispatchable teams right now.</p>
              ) : (
                <div className="space-y-2">
                  {dispatchableTeams.map((team) => {
                    const fit = capacityFit(team, estCargoKg);
                    const meta = FIT_META[fit];
                    const km = estDistanceKm(team, selectedBarangay);
                    const isRec = recommendedTeam?.id === team.id;
                    return (
                      <div
                        key={team.id}
                        className={`rounded-control border px-3 py-2.5 ${isRec ? 'border-active/40 bg-active/5' : 'border-line'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 min-w-0">
                            <TeamIcon type={team.type} />
                            <span className="text-fg truncate">{team.name}</span>
                          </span>
                          {isRec && <Chip tone="active">Recommended</Chip>}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-[12px] text-muted">
                            <span className="font-mono tabular-nums">~{km.toFixed(1)}</span> km est.
                            <span aria-hidden>·</span>
                            <span className="font-mono tabular-nums">{team.capacityKg.toLocaleString()}</span> kg
                            <Chip tone={meta.tone}>{meta.label}</Chip>
                          </span>
                          <button
                            onClick={() => onDispatchTeam(team.id, selectedBarangay.id)}
                            className="px-3 py-1.5 border border-line text-fg hover:bg-raised rounded-control text-[12px] transition-colors duration-150 cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
                          >
                            Dispatch
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {(facilities ?? []).length > 0 && (
              <Section title="Logistics source">
                <p className="text-[13px] text-fg">
                  From {facilities![0].name}
                  {typeof facilities![0].capacityPercent === 'number' && (
                    <span className="text-muted"> · <span className="font-mono tabular-nums">{facilities![0].capacityPercent}%</span> stocked</span>
                  )}
                </p>
              </Section>
            )}
          </>
        )}
      </div>
    </DetailPanel>
  );
}

// Risk badge for the predicted damage severity. Color tracks the silent-area palette:
// severe -> critical, moderate -> warning, minor -> muted.
function SeverityBadge({ severity }: { severity: 'severe' | 'moderate' | 'minor' }) {
  const style: Record<typeof severity, { cls: string; label: string }> = {
    severe: { cls: 'border-critical/40 bg-critical/10 text-critical', label: 'Severe' },
    moderate: { cls: 'border-warning/30 bg-warning/10 text-warning', label: 'Moderate' },
    minor: { cls: 'border-line bg-raised/30 text-muted', label: 'Minor' },
  };
  const { cls, label } = style[severity];
  return (
    <span className={`inline-flex items-center gap-1 rounded-control border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {label} damage
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[12px] text-muted mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-bg border border-line rounded-control px-2 py-1.5 text-[13px] text-fg font-mono tabular-nums placeholder:text-muted focus:outline-none focus:border-muted"
      />
    </div>
  );
}