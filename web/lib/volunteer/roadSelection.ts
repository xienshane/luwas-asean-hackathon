// Pure helper for the volunteer blocked-road picker. The map highlights via feature-state,
// so the component only needs the selected id list; this keeps the toggle logic unit-tested.
export function toggleEdge(selected: number[], id: number): number[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}
