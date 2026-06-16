// Cheap, dependency-free language guard for the SEA-LION translation path.
// Goal: skip the (rate-limited, free-tier 10/min) /translate call for reports that
// are already English. Tuned to the Cebuano/Tagalog field-report domain — the
// presence of any common Filipino/Bisaya function word means "not English, translate".
// The service double-checks (it returns null when it judges the text English), so a
// rare false "English" here only means a translation is skipped, never a wrong one.
const FILIPINO_MARKERS = new Set([
  // Bisaya/Cebuano
  'ang', 'mga', 'ng', 'sa', 'ug', 'kay', 'nga', 'naa', 'wala', 'walay',
  'dili', 'aduna', 'adunay', 'mao', 'kini', 'kana', 'dinhi', 'diri', 'didto',
  'kami', 'kita', 'ako', 'ikaw', 'siya', 'kayo', 'sila', 'nila', 'niya',
  'baha', 'tubig', 'tabang', 'dalan', 'balay', 'tawo', 'katawhan', 'pamilya',
  'grabe', 'daghan', 'gamay', 'nagbaha', 'gikan', 'gikinahanglan',
  // Tagalog/Filipino
  'ay', 'po', 'na', 'pa', 'din', 'rin', 'lang', 'yung', 'ito', 'iyan',
  'dito', 'doon', 'maraming', 'tulong', 'bahá', 'kailangan',
]);

/** True when `text` looks like it is already English (so translation can be skipped). */
export function isLikelyEnglish(text: string): boolean {
  const tokens = text.toLowerCase().match(/[a-zà-ÿñ]+/gi) ?? [];
  if (tokens.length === 0) return true; // nothing translatable (numbers/symbols only)
  return !tokens.some((t) => FILIPINO_MARKERS.has(t));
}
