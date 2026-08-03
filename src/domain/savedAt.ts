export function isSavedAtNewer(candidateSavedAt?: string, baselineSavedAt?: string): boolean {
  const candidateTime = parseSavedAt(candidateSavedAt);
  const baselineTime = parseSavedAt(baselineSavedAt);

  if (candidateTime === null) {
    return false;
  }

  if (baselineTime === null) {
    return true;
  }

  return candidateTime > baselineTime;
}

export function parseSavedAt(savedAt?: string): number | null {
  if (!savedAt) {
    return null;
  }

  const time = new Date(savedAt).getTime();
  return Number.isNaN(time) ? null : time;
}
