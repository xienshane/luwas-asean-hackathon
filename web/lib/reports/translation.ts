/** The two text fields every coordinator surface reads off a field report. */
export interface TranslatableReport {
  rawText: string;
  translatedText: string | null;
}

/**
 * Whether this report actually carries a translation.
 *
 * Null is not the only "no translation" case. Reports that arrived in English are
 * stored with translated_text = raw_text — deliberately, because CommandDashboard
 * auto-requests a translation for any report whose translatedText is null, and the
 * SEA-LION free tier allows 10 calls/min. Writing the original into both columns
 * keeps a province-wide seed from melting the quota on rows that need nothing.
 *
 * So equality means "already English", and every surface that offers a translation
 * toggle or stacks the two texts has to compare, not null-check. Three of them were
 * open-coding this comparison; it lives here now so they cannot drift.
 */
export function hasTranslation(report: TranslatableReport): boolean {
  return !!report.translatedText && report.translatedText !== report.rawText;
}
