'use client';

import React, { useState, useEffect } from 'react';
import type { Barangay, ImpactPrediction, SupplyManifest, Team, Route, LocationHub } from '@/lib/types/coordinator';
import { DetailPanel, silentAreaState, STATE_LABEL, STATE_COLOR } from './ui';
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

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'supplies', label: 'Supplies' },
    { id: 'dispatch', label: 'Dispatch' },
  ];

  const supplyRows = [
    { label: 'Clean water', value: finalWater, unit: 'L', inv: water.inventory },
    { label: 'Food packs', value: finalFood, unit: 'packs', inv: food.inventory },
    { label: 'Blankets', value: finalBlankets, unit: 'pcs', inv: blankets.inventory },
    { label: 'Hygiene kits', value: finalHygiene, unit: 'kits', inv: hygiene.inventory },
    { label: 'Medical', value: finalMedical, unit: 'packs', inv: medical.inventory },
    { label: 'Shelter', value: finalShelter, unit: 'units', inv: shelter.inventory },
  ];

  const dispatchableTeams = teams.filter((t) => t.status === 'active' || t.status === 'idle');

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
    >
      {/* Tabs */}
      <div className="flex border-b border-line text-[13px]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setDrawerTab(t.id)}
            className={`flex-1 py-2 border-b-2 transition-colors duration-100 cursor-pointer ${
              drawerTab === t.id ? 'border-fg/50 text-fg' : 'border-transparent text-muted hover:text-fg'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-4 text-[13px]">
        {/* ── Overview ── */}
        {drawerTab === 'overview' && (
          <>
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

            <div className="border-t border-line pt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] text-muted">Impact prediction · {prediction?.model ?? 'TabPFN'}</span>
                {prediction && <SeverityBadge severity={prediction.damageSeverity} />}
              </div>
              {prediction ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-mono tabular-nums text-fg">
                      {effectiveAffected.toLocaleString()}
                    </span>
                    <span className="text-[12px] text-muted">
                      {affectedFrom === 'reported' ? 'reported affected' : affectedFrom === 'override' ? 'overridden affected' : 'est. affected'}
                    </span>
                  </div>
                  {(affectedFrom === 'reported' || affectedFrom === 'override') && (
                    <div className="mt-0.5 text-[12px] text-muted">
                      Model predicted{' '}
                      <span className="font-mono tabular-nums line-through">
                        {prediction.predictedAffected.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {hasInterval && (
                    <div className="mt-0.5 text-[12px] text-muted">
                      80% range{' '}
                      <span className="font-mono tabular-nums text-fg">
                        {prediction.affectedLow!.toLocaleString()}–{prediction.affectedHigh!.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {lowConfReason && (
                    <div
                      className="mt-1.5 inline-flex items-center gap-1.5 rounded-control border border-warning/30 bg-warning/10 px-2 py-1 text-[11px] font-medium text-warning"
                      title={lowConfReason}
                    >
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warning" />
                      Low confidence — decision support
                    </div>
                  )}
                  {prediction.isDay0 && (
                    <div
                      className="mt-1.5 inline-flex items-center gap-1.5 rounded-control border border-warning/30 bg-warning/10 px-2 py-1 text-[11px] font-medium text-warning"
                      title="Day-0 forecast from a uniform storm scenario (no per-barangay wind footprint). Override-able; not yet confirmed by a field report."
                    >
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warning" />
                      Predicted — Unconfirmed (Day 0)
                    </div>
                  )}
                  {isAffectedOverridden && (
                    <div className="mt-1.5 text-[13px] text-active">
                      Overridden · <span className="font-mono tabular-nums">{prediction.overrideValue?.toLocaleString()}</span> people
                    </div>
                  )}
                  {prediction.contributors && prediction.contributors.length > 0 && (
                    <ul className="mt-2 space-y-1 text-[12px] text-muted">
                      {prediction.contributors.map((c, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-muted">—</span>
                          {c}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-[13px] text-muted leading-relaxed">
                  Not generated yet — TabPFN runs in the Phase 4 pipeline and isn’t wired to
                  live reports. The Silent Area score above is live.
                </p>
              )}
            </div>
          </>
        )}

        {/* ── Supplies ── */}
        {drawerTab === 'supplies' && (
          <>
            {!manifest && (
              <div className="rounded-control border border-line bg-raised/30 px-3 py-2 text-[12px] text-muted leading-relaxed">
                No manifest yet — confirm a report to run the pipeline (TabPFN → Sphere) and
                generate one. Coordinator overrides below still apply.
              </div>
            )}
            <div className="flex items-center justify-between text-[12px] text-muted">
              <span>Sphere manifest</span>
              <span>3-day ration</span>
            </div>
            <div className="space-y-2 font-mono">
              {supplyRows.map((r) => (
                <div key={r.label} className="flex items-center justify-between">
                  <div>
                    <div className="text-fg font-sans">{r.label}</div>
                    <div className="text-[12px] text-muted">
                      Inv <span className="font-mono tabular-nums">{r.inv.toLocaleString()}</span>
                    </div>
                  </div>
                  <span className="font-mono tabular-nums text-fg">
                    {r.value.toLocaleString()} <span className="text-muted font-sans">{r.unit}</span>
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-line pt-3 space-y-3">
              <button
                onClick={() => setIsEditing((e) => !e)}
                className="w-full flex items-center justify-between py-2 px-3 border border-line rounded-control text-muted hover:text-fg hover:bg-raised/40 transition-colors duration-100 cursor-pointer"
              >
                <span>Coordinator override</span>
                <span className="text-[12px] text-muted">{isEditing ? 'Collapse' : 'Configure'}</span>
              </button>

              {isEditing && (
                <div className="space-y-2.5">
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
                    className="w-full py-2 border border-line text-fg hover:bg-raised rounded-control transition-colors duration-100 cursor-pointer font-medium"
                  >
                    Apply overrides
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 border-t border-line pt-3">
                <button
                  onClick={() => onUpdateManifestStatus(selectedBarangay.id, 'approved')}
                  className="flex-1 py-2 border border-active/40 bg-active/10 text-active hover:bg-active/20 rounded-control font-medium transition-colors duration-100 cursor-pointer"
                >
                  Approve
                </button>
                <button
                  onClick={() => onUpdateManifestStatus(selectedBarangay.id, 'rejected')}
                  className="px-3 py-2 border border-line text-muted hover:text-critical hover:border-critical/40 rounded-control transition-colors duration-100 cursor-pointer"
                >
                  Reject
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Dispatch ── */}
        {drawerTab === 'dispatch' && (
          <>
            {(() => {
              const activeRoute = routes.find(
                (r) => r.status === 'active' && r.stops.some((s) => s.barangayId === selectedBarangay.id),
              );
              if (!activeRoute) return null;
              return (
                <div className="rounded-control border border-active/30 bg-active/10 px-3 py-2.5">
                  <div className="flex items-center gap-2 text-[12px] text-active font-medium">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-active/60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-active" />
                    </span>
                    {activeRoute.teamName} en route — {(activeRoute.totalDistanceM / 1000).toFixed(1)} km
                  </div>
                  <button
                    onClick={() => onMarkReached(activeRoute.id)}
                    className="mt-2 w-full min-h-[44px] py-2 border border-active/40 bg-active/10 text-active hover:bg-active/20 rounded-control font-medium transition-colors duration-100 cursor-pointer"
                  >
                    Mark area reached
                  </button>
                </div>
              );
            })()}
            <div>
              <div className="text-[12px] text-muted mb-2">Nearest logistics hubs</div>
              <div className="space-y-1.5">
                {(facilities ?? []).slice(0, 2).map((hub) => (
                  <div key={hub.id} className="flex items-center justify-between">
                    <span className="text-fg truncate">{hub.name}</span>
                    <span className="text-[12px] text-muted font-mono tabular-nums shrink-0">{hub.capacityPercent ? `${hub.capacityPercent}%` : '—'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-line pt-3">
              <div className="text-[12px] text-muted mb-2">Available teams</div>
              <div className="space-y-2">
                {dispatchableTeams.map((team) => (
                  <div key={team.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-fg truncate">{team.name}</div>
                      <div className="text-[12px] text-muted">
                        <span className="font-mono tabular-nums">{team.capacityKg.toLocaleString()}</span> kg
                      </div>
                    </div>
                    <button
                      onClick={() => onDispatchTeam(team.id, selectedBarangay.id)}
                      className="px-3 py-1.5 border border-line text-fg hover:bg-raised rounded-control text-[12px] transition-colors duration-100 cursor-pointer shrink-0"
                    >
                      Dispatch
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <p className="border-t border-line pt-3 text-[12px] text-muted leading-relaxed">
              OR-Tools generates ETAs from current road blocks and the pgRouting matrix. Dispatch requires
              human confirmation — no automatic dispatches are executed.
            </p>
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