// NLP parser API contract.
// MIRRORS ai-services/app/models/parse.py (the canonical source). Any change to one
// must update the other in the SAME commit (see CLAUDE.md > Rules).

export type NeedsSeverity = "low" | "moderate" | "high" | "critical";
export type RoadStatus = "passable" | "impassable" | "unknown";
export type ReportStatus = "pending" | "flagged";
export type ParseProvider = "sea-lion" | "gemini";

export interface ParseRequest {
  /** Raw field-report text (Bisaya/Tagalog/EN). */
  text: string;
  /** Caller key, echoed back. */
  id?: string | null;
}

/** Per-field values with their individual confidences (for the coordinator UI). */
export interface Extraction {
  location: string | null;
  location_confidence: number;
  population_estimate: number | null;
  population_confidence: number;
  needs_severity: NeedsSeverity | null;
  needs_severity_confidence: number;
  road_status: RoadStatus;
  road_status_confidence: number;
}

/** A field_reports insert payload (text-derived fields only). */
export interface NormalizedFieldReport {
  source: "parsed";
  raw_text: string;
  /** Extracted place name; geocoded to a barangay downstream. */
  location_text: string | null;
  population_estimate: number | null;
  needs_severity: NeedsSeverity | null;
  road_status: RoadStatus;
  road_impassable: boolean;
  /** Overall extraction confidence, [0,1]. */
  confidence: number;
  /** "flagged" (below threshold, needs review) or "pending". */
  status: ReportStatus;
}

export interface ParseResponse {
  field_report: NormalizedFieldReport;
  extraction: Extraction;
  provider: ParseProvider;
  /** True => below threshold, not auto-committed. */
  needs_review: boolean;
  latency_ms: number;
  /** English translation of raw_text; null if already English. */
  translated_text: string | null;
  id?: string | null;
}

export interface TranslateRequest {
  /** Report text to translate to English. */
  text: string;
  /** Caller key, echoed back. */
  id?: string | null;
}

export interface TranslateResponse {
  /** English translation; null if the text is already English. */
  translated_text: string | null;
  provider: ParseProvider | null;
  latency_ms: number;
  id?: string | null;
}
