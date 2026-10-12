import { describe, it, expect } from 'vitest';
import {
  calculateSkillMatchScore,
  calculateProximityScore,
  calculateScheduleFitScore,
  calculateHostReliabilityScore,
  calculateCompositeScore,
  evaluateConfidence,
  generateRecommendationReasons,
  evaluateGameRecommendation,
} from '../src/engine/recommendation/index.js';
import { RecommendationConfidenceLevels } from '../src/constants/recommendation-constants.js';

describe('Module 6: Recommendation Pure Math Engine', () => {
  describe('calculateSkillMatchScore', () => {
    it('returns 0.75 when ratingGap is null (unrated/neutral)', () => {
      expect(calculateSkillMatchScore(null, false)).toBe(0.75);
    });

    it('returns 1.0 when rating gap is 0', () => {
      expect(calculateSkillMatchScore(0, true)).toBe(1.0);
    });

    it('returns 1.0 when rating gap <= 50 and in range', () => {
      expect(calculateSkillMatchScore(30, true)).toBe(1.0);
    });

    it('returns 0.95 when rating gap <= 50 but not in range', () => {
      expect(calculateSkillMatchScore(30, false)).toBe(0.95);
    });

    it('scales linearly for gaps between 50 and 200', () => {
      const score = calculateSkillMatchScore(100, true);
      expect(score).toBe(0.75);
    });

    it('penalizes large rating gaps with floor', () => {
      const score = calculateSkillMatchScore(500, false);
      expect(score).toBeLessThanOrEqual(0.1);
    });
  });

  describe('calculateProximityScore', () => {
    it('returns 1.0 for distance <= 0', () => {
      expect(calculateProximityScore(0, 15)).toBe(1.0);
    });

    it('scales down linearly within travel radius', () => {
      expect(calculateProximityScore(7.5, 15)).toBe(0.75);
      expect(calculateProximityScore(15, 15)).toBe(0.5);
    });

    it('decays exponentially beyond travel radius with minimum floor', () => {
      const score = calculateProximityScore(30, 15);
      expect(score).toBeLessThan(0.5);
      expect(score).toBeGreaterThanOrEqual(0.05);
    });
  });

  describe('calculateScheduleFitScore', () => {
    it('returns 1.0 when availability matches', () => {
      expect(calculateScheduleFitScore(true)).toBe(1.0);
    });

    it('returns 0.3 when availability does not match', () => {
      expect(calculateScheduleFitScore(false)).toBe(0.3);
    });
  });

  describe('calculateHostReliabilityScore', () => {
    it('returns default 0.8 when host score is null', () => {
      expect(calculateHostReliabilityScore(null)).toBe(0.8);
    });

    it('normalizes 0-100 score to 0-1', () => {
      expect(calculateHostReliabilityScore(95)).toBe(0.95);
      expect(calculateHostReliabilityScore(50)).toBe(0.5);
    });
  });

  describe('calculateCompositeScore', () => {
    it('computes weighted composite score correctly', () => {
      const factors = [
        { name: 'Skill Match' as any, value: 1.0, weight: 0.5 },
        { name: 'Proximity' as any, value: 0.5, weight: 0.5 },
      ];
      expect(calculateCompositeScore(factors)).toBe(0.75);
    });
  });

  describe('evaluateConfidence', () => {
    it('evaluates to high confidence when player is established with rating and in-radius distance', () => {
      const conf = evaluateConfidence({
        gameId: 'g1',
        sportKey: 'badminton',
        title: 'Singles Match',
        distanceKm: 5,
        travelRadiusKm: 15,
        ratingGap: 20,
        ratingInRange: true,
        playerGamesPlayed: 15,
        availabilityFit: true,
        hostReliabilityScore: 90,
        seatsLeft: 1,
        totalSeats: 2,
      });
      expect(conf).toBe(RecommendationConfidenceLevels.HIGH);
    });

    it('evaluates to medium confidence when player has few games or provisional data', () => {
      const conf = evaluateConfidence({
        gameId: 'g1',
        sportKey: 'badminton',
        title: 'Singles Match',
        distanceKm: 5,
        travelRadiusKm: 15,
        ratingGap: 20,
        ratingInRange: true,
        playerGamesPlayed: 3,
        availabilityFit: true,
        hostReliabilityScore: 90,
        seatsLeft: 1,
        totalSeats: 2,
      });
      expect(conf).toBe(RecommendationConfidenceLevels.MEDIUM);
    });

    it('evaluates to low confidence when brand new player with no games', () => {
      const conf = evaluateConfidence({
        gameId: 'g1',
        sportKey: 'badminton',
        title: 'Singles Match',
        distanceKm: 25,
        travelRadiusKm: 15,
        ratingGap: null,
        ratingInRange: false,
        playerGamesPlayed: 0,
        availabilityFit: false,
        hostReliabilityScore: null,
        seatsLeft: 2,
        totalSeats: 4,
      });
      expect(conf).toBe(RecommendationConfidenceLevels.LOW);
    });
  });

  describe('evaluateGameRecommendation integration', () => {
    it('produces full evaluation matching shared contract', () => {
      const evaluated = evaluateGameRecommendation({
        gameId: 'g-test-123',
        sportKey: 'badminton',
        title: 'Intermediate Badminton Friendly',
        distanceKm: 2.5,
        travelRadiusKm: 10,
        ratingGap: 25,
        ratingInRange: true,
        playerGamesPlayed: 12,
        availabilityFit: true,
        hostReliabilityScore: 92,
        seatsLeft: 1,
        totalSeats: 4,
      });

      expect(evaluated.gameId).toBe('g-test-123');
      expect(evaluated.score).toBeGreaterThan(0.8);
      expect(evaluated.confidence).toBe(RecommendationConfidenceLevels.HIGH);
      expect(evaluated.factors.length).toBe(4);
      expect(evaluated.reasons.length).toBeGreaterThan(0);
      expect(evaluated.reasons).toContain('Close skill match (within 25 Elo points)');
      expect(evaluated.reasons).toContain('Convenient location (2.5 km away)');
      expect(evaluated.reasons).toContain('Only 1 spot remaining');
    });
  });
});
