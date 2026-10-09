import mongoose, { Types } from 'mongoose';
import { Sport, type ISportDocument } from '../models/sport.model.js';
import { SportProfile, type ISportProfileDocument } from '../models/sport-profile.model.js';
import { Rating, type IRatingDocument } from '../models/rating.model.js';
import { config } from '../config/index.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../utils/app-error.js';
import { Messages } from '../constants/messages.js';
import { ErrorCodes } from '../constants/error-codes.js';

export interface PlayerSportSelectionInput {
  sportId: string;
  selectedBandKey: string;
  playStyle?: string | null;
  preferredPositions?: string[];
}

export class SportProfileService {
  /**
   * Retrieves all active sports configured for a player, populated with sport catalog details.
   */
  public async getPlayerSports(
    userId: string | Types.ObjectId,
  ): Promise<ISportProfileDocument[]> {
    return SportProfile.find({
      user: new Types.ObjectId(userId),
      isActive: true,
    }).populate('sport');
  }

  /**
   * Retrieves all rating records for a player, populated with sport catalog details.
   */
  public async getPlayerRatings(
    userId: string | Types.ObjectId,
  ): Promise<IRatingDocument[]> {
    return Rating.find({ user: new Types.ObjectId(userId) }).populate('sport');
  }

  /**
   * Replaces player's selected sports with transaction safety, enforcing:
   * - Max sports limit
   * - Active sport validation
   * - Skill band validation
   * - Band locking after rated games (gamesPlayed > 0)
   * - Soft-removal of unselected sports
   * - Creation/restoration of ratings strictly from seed data
   */
  public async replacePlayerSports(
    userId: string | Types.ObjectId,
    selections: PlayerSportSelectionInput[],
  ): Promise<{
    sportProfiles: ISportProfileDocument[];
    ratings: IRatingDocument[];
  }> {
    const userObjectId = new Types.ObjectId(userId);

    // 1. Enforce max sports limit
    if (selections.length > config.MAX_SPORTS_PER_PLAYER) {
      throw new ValidationError(
        `${Messages.MAX_SPORTS_EXCEEDED} (${config.MAX_SPORTS_PER_PLAYER})`,
        { maxAllowed: config.MAX_SPORTS_PER_PLAYER, provided: selections.length },
      );
    }

    // 2. Validate distinct sport IDs in selection
    const selectedSportIds = new Set(selections.map((s) => s.sportId));
    if (selectedSportIds.size !== selections.length) {
      throw new ValidationError('Duplicate sport selections are not permitted');
    }

    // 3. Fetch and validate each selected sport from catalog
    const sportDocs = await Sport.find({
      _id: { $in: Array.from(selectedSportIds).map((id) => new Types.ObjectId(id)) },
    });

    const sportMap = new Map<string, ISportDocument>();
    for (const doc of sportDocs) {
      sportMap.set(doc.id, doc);
    }

    for (const sel of selections) {
      const sport = sportMap.get(sel.sportId);
      if (!sport) {
        throw new NotFoundError(
          `Sport with ID "${sel.sportId}" was not found`,
          ErrorCodes.SPORT_NOT_FOUND,
        );
      }
      if (!sport.isActive) {
        throw new ValidationError(
          `Sport "${sport.name}" is not currently active for matchmaking`,
          ErrorCodes.SPORT_INACTIVE,
        );
      }

      // Validate skill band exists in sport catalog
      const band = sport.skillBands.find((b) => b.key === sel.selectedBandKey);
      if (!band) {
        throw new ValidationError(
          `Skill band "${sel.selectedBandKey}" does not exist for sport "${sport.name}"`,
          ErrorCodes.SKILL_BAND_NOT_FOUND,
        );
      }

      // Validate playStyle if provided
      if (sel.playStyle) {
        const styleExists = sport.playStyles.some((s) => s.key === sel.playStyle);
        if (!styleExists) {
          throw new ValidationError(
            `Play style "${sel.playStyle}" is invalid for sport "${sport.name}"`,
          );
        }
      }

      // Validate positions if provided
      if (sel.preferredPositions && sel.preferredPositions.length > 0) {
        const validPositions = new Set(sport.positions.map((p) => p.key));
        for (const pos of sel.preferredPositions) {
          if (!validPositions.has(pos)) {
            throw new ValidationError(
              `Position "${pos}" is invalid for sport "${sport.name}"`,
            );
          }
        }
      }
    }

    // 4. Fetch existing ratings to check band locking rule
    const existingRatings = await Rating.find({ user: userObjectId });
    const ratingMap = new Map<string, IRatingDocument>();
    for (const r of existingRatings) {
      ratingMap.set(String(r.sport), r);
    }

    for (const sel of selections) {
      const existingRating = ratingMap.get(sel.sportId);
      if (existingRating && existingRating.gamesPlayed > 0) {
        if (existingRating.seedBandKey !== sel.selectedBandKey) {
          throw new ConflictError(
            `${Messages.RATING_LOCKED_AFTER_GAMES} (Sport: ${sportMap.get(sel.sportId)?.name})`,
            ErrorCodes.RATING_LOCKED_AFTER_GAMES,
          );
        }
      }
    }

    // 5. Execute updates with transactional support when supported by topology
    const topologyType = (
      mongoose.connection.getClient() as unknown as {
        topology?: { description?: { type?: string } };
      }
    )?.topology?.description?.type;
    const canUseTransactions =
      topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded';

    let session: mongoose.ClientSession | null = null;
    if (canUseTransactions) {
      session = await mongoose.startSession();
      session.startTransaction();
    }

    const sessionOption = session ? { session } : {};

    try {
      const selectedSportObjectIds = selections.map(
        (s) => new Types.ObjectId(s.sportId),
      );

      // Deactivate sports not in current selection (soft removal)
      await SportProfile.updateMany(
        {
          user: userObjectId,
          sport: { $nin: selectedSportObjectIds },
          isActive: true,
        },
        { isActive: false },
        sessionOption,
      );

      // Process each selected sport
      for (const sel of selections) {
        const sport = sportMap.get(sel.sportId)!;
        const band = sport.skillBands.find((b) => b.key === sel.selectedBandKey)!;
        const seedRating = band.seedRating || config.DEFAULT_SEED_RATING;

        // Upsert SportProfile
        await SportProfile.findOneAndUpdate(
          { user: userObjectId, sport: sport._id },
          {
            selectedBandKey: sel.selectedBandKey,
            playStyle: sel.playStyle || null,
            preferredPositions: sel.preferredPositions || [],
            isActive: true,
          },
          { upsert: true, new: true, ...sessionOption },
        );

        // Manage Rating: if not existing, create. If existing with 0 games, update band seed.
        const existingRating = ratingMap.get(sel.sportId);
        if (!existingRating) {
          await Rating.create(
            [
              {
                user: userObjectId,
                sport: sport._id,
                rating: seedRating,
                seedRating,
                seedBandKey: band.key,
                gamesPlayed: 0,
                history: [],
              },
            ],
            sessionOption,
          );
        } else if (existingRating.gamesPlayed === 0 && existingRating.seedBandKey !== band.key) {
          await Rating.updateOne(
            { _id: existingRating._id },
            {
              rating: seedRating,
              seedRating,
              seedBandKey: band.key,
            },
            sessionOption,
          );
        }
      }

      if (session) {
        await session.commitTransaction();
      }
    } catch (error) {
      if (session) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      if (session) {
        await session.endSession();
      }
    }

    // Return updated records
    const updatedProfiles = await this.getPlayerSports(userId);
    const updatedRatings = await this.getPlayerRatings(userId);

    return {
      sportProfiles: updatedProfiles,
      ratings: updatedRatings,
    };
  }
}

export const sportProfileService = new SportProfileService();
