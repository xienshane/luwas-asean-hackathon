'use client';

import React, { useState, useEffect } from 'react';
import type { Barangay, ImpactPrediction, SupplyManifest, Team, Route, LocationHub } from '@/lib/types/coordinator';
import { DetailPanel, silentAreaState, STATE_LABEL, STATE_COLOR } from './ui';

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
    suppliesOverride: { waterL?: number; foodPacks?: number; shelterKits?: number; blankets?: number } | null
  ) => void;
  onUpdateManifestStatus: (barangayId: string, status: 'approved' | 'modified' | 'rejected') => void;
  onDispatchTeam: (teamId: string, barangayId: string) => void;
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
  onClearBarangaySelection,
}: RightIntelligencePanelProps) {
  const [drawerTab, setDrawerTab] = useState<Tab>('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [affectedInput, setAffectedInput] = useState('');
  const [waterInput, setWaterInput] = useState('');
  const [foodInput, setFoodInput] = useState('');
  const [hygieneInput, setHygieneInput] = useState('');
  const [medicalInput, setMedicalInput] = useState('');
  const [shelterInput, setShelterInput] = useState('');

  useEffect(() => {
    if (selectedBarangay) {
      setAffectedInput(prediction?.overrideValue?.toString() || '');
      setWaterInput('');
      setFoodInput('');
      setHygieneInput('');
      setMedicalInput('');
      setShelterInput('');
      setIsEditing(false);
    }
  }, [selectedBarangay, prediction]);

  // Parent only mounts this panel with a selection; guard keeps types honest.
  if (!selectedBarangay) return null;

  const selectedScore = scores.find((s) => s.barangayId === selectedBarangay.id) ?? { score: 0, hoursSinceContact: null };
  const state = silentAreaState(selectedScore.score);

  const isAffectedOverridden = prediction?.overrideValue !== null && prediction?.overrideValue !== undefined;

  const manifestOverrides =
    manifest?.overridden && typeof manifest.overridden === 'object'
      ? (manifest.overridden as {
          waterL?: number;
          foodPacks?: number;
          hygieneKits?: number;
          medicalSupplies?: number;
          shelterMaterials?: number;
        })
      : undefined;

  // Supply figures come from the live Sphere manifest (pipeline output via coordinator_supply_manifests);
  // empty until a report is confirmed for this barangay. Coordinator overrides still layer on top.
  const EMPTY_ITEM = { recommended: 0, inventory: 0, shortfall: 0 };
  const water = manifest?.waterL ?? EMPTY_ITEM;
  const food = manifest?.foodPacks ?? EMPTY_ITEM;
  const hygiene = manifest?.hygieneKits ?? EMPTY_ITEM;
  const medical = manifest?.medicalSupplies ?? EMPTY_ITEM;
  const shelter = manifest?.shelterMaterials ?? EMPTY_ITEM;
  const finalWater = manifestOverrides?.waterL ?? water.recommended;
  const finalFood = manifestOverrides?.foodPacks ?? food.recommended;
  const finalHygiene = manifestOverrides?.hygieneKits ?? hygiene.recommended;
  const finalMedical = manifestOverrides?.medicalSupplies ?? medical.recommended;
  const finalShelter = manifestOverrides?.shelterMaterials ?? shelter.recommended;

  const handleSaveOverrides = () => {
    const overrideVal = affectedInput.trim() === '' ? null : parseInt(affectedInput, 10);
    const overrides = {
      waterL: waterInput ? parseInt(waterInput, 10) : undefined,
      foodPacks: foodInput ? parseInt(foodInput, 10) : undefined,
      hygieneKits: hygieneInput ? parseInt(hygieneInput, 10) : undefined,
      medicalSupplies: medicalInput ? parseInt(medicalInput, 10) : undefined,
      shelterMaterials: shelterInput ? parseInt(shelterInput, 10) : undefined,
    };
    onSaveOverrides(
      selectedBarangay.id,
      overrideVal,
      overrides.waterL || overrides.foodPacks || overrides.hygieneKits || overrides.medicalSupplies || overrides.shelterMaterials
        ? overrides
        : null
    );
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
    { label: 'Hygiene kits', value: finalHygiene, unit: 'kits', inv: hygiene.inventory },
    { label: 'Medical', value: finalMedical, unit: 'packs', inv: medical.inventory },
    { label: 'Shelter', value: finalShelter, unit: 'units', inv: shelter.inventory },
  ];

  const dispatchableTeams = teams.filter((t) => t.status === 'active' || t.status === 'idle');

  return (
    <DetailPanel
      className="w-[25%] min-w-[340px] max-w-[360px] shrink-0"
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
                <span className="text-[12px] text-muted">TabPFN impact prediction</span>
                {prediction && (
                  <span className="text-[12px] text-muted capitalize">Conf · {prediction.confidence}</span>
                )}
              </div>
              {prediction ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-2xl font-mono tabular-nums ${isAffectedOverridden ? 'text-muted line-through' : 'text-fg'}`}>
                      {prediction.predictedAffected.toLocaleString()}
                    </span>
                    <span className="text-[12px] text-muted">est. affected</span>
                  </div>
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
            <div className="space-y-2">
              {supplyRows.map((r) => (
                <div key={r.label} className="flex items-center justify-between">
                  <div>
                    <div className="text-fg">{r.label}</div>
                    <div className="text-[12px] text-muted">
                      Inv <span className="font-mono tabular-nums">{r.inv.toLocaleString()}</span>
                    </div>
                  </div>
                  <span className="font-mono tabular-nums text-fg">
                    {r.value.toLocaleString()} <span className="text-muted">{r.unit}</span>
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
                    <Field label="Hygiene (kits)" value={hygieneInput} onChange={setHygieneInput} placeholder={hygiene.recommended.toString()} />
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
