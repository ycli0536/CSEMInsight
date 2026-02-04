export function orderIdsByPrimaryLast(ids: string[], primaryId: string | null): string[] {
  if (!primaryId) {
    return ids;
  }

  const primaryIndex = ids.indexOf(primaryId);
  if (primaryIndex === -1 || primaryIndex === ids.length - 1) {
    return ids;
  }

  return [...ids.slice(0, primaryIndex), ...ids.slice(primaryIndex + 1), primaryId];
}
