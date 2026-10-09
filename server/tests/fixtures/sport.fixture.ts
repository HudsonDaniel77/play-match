import { Sport, type ISportDocument } from '../../src/models/sport.model.js';

export async function createTestSport(overrides: {
  key?: string;
  name?: string;
  isActive?: boolean;
  minPlayers?: number;
  maxPlayers?: number;
} = {}): Promise<ISportDocument> {
  const key =
    overrides.key || `sport-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  return Sport.create({
    key,
    name: overrides.name || 'Test Tennis',
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
    minPlayers: overrides.minPlayers || 2,
    maxPlayers: overrides.maxPlayers || 4,
    skillBands: [
      { key: 'beginner', label: 'Beginner', order: 1, seedRating: 1000 },
      { key: 'intermediate', label: 'Intermediate', order: 2, seedRating: 1200 },
      { key: 'advanced', label: 'Advanced', order: 3, seedRating: 1400 },
    ],
    playStyles: [
      { key: 'casual', label: 'Casual' },
      { key: 'competitive', label: 'Competitive' },
    ],
    positions: [
      { key: 'singles', label: 'Singles' },
      { key: 'doubles', label: 'Doubles' },
    ],
  });
}
