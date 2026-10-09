import type { SkillBandDefinition } from './interfaces.js';

export interface ResolvedBand {
  key: string;
  label: string;
}

export function resolveBandLabel(
  rating: number,
  skillBands: SkillBandDefinition[],
): ResolvedBand {
  if (!skillBands || skillBands.length === 0) {
    return { key: 'unranked', label: 'Unranked' };
  }

  if (skillBands.length === 1) {
    return { key: skillBands[0].key, label: skillBands[0].label };
  }

  // Sort ascending by order, or by seedRating if order identical
  const sorted = [...skillBands].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.seedRating - b.seedRating;
  });

  // Calculate midpoints between adjacent bands
  for (let i = 0; i < sorted.length - 1; i++) {
    const currentBand = sorted[i];
    const nextBand = sorted[i + 1];
    const midpoint = (currentBand.seedRating + nextBand.seedRating) / 2;

    if (rating < midpoint) {
      return { key: currentBand.key, label: currentBand.label };
    }
  }

  // If rating is >= the last midpoint, it belongs to the highest band
  const highestBand = sorted[sorted.length - 1];
  return { key: highestBand.key, label: highestBand.label };
}
