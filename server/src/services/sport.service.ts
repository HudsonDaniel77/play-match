import { Types } from 'mongoose';
import { Sport, type ISportDocument, type ISkillBand, type IPlayStyle, type IPosition } from '../models/sport.model.js';
import { NotFoundError, ConflictError } from '../utils/app-error.js';
import { Messages } from '../constants/messages.js';
import { ErrorCodes } from '../constants/error-codes.js';

export interface CreateSportDTO {
  key: string;
  name: string;
  isActive?: boolean;
  isTeamBased?: boolean;
  minPlayers: number;
  maxPlayers: number;
  skillBands: ISkillBand[];
  playStyles: IPlayStyle[];
  positions?: IPosition[];
}

export interface UpdateSportDTO {
  name?: string;
  isActive?: boolean;
  isTeamBased?: boolean;
  minPlayers?: number;
  maxPlayers?: number;
  skillBands?: ISkillBand[];
  playStyles?: IPlayStyle[];
  positions?: IPosition[];
}

export class SportService {
  /**
   * Retrieves all active sports from the catalog for player selection.
   */
  public async getActiveSports(): Promise<ISportDocument[]> {
    return Sport.find({ isActive: true }).sort({ name: 1 });
  }

  /**
   * Retrieves all sports from the catalog (admin view, includes inactive).
   */
  public async getAllSports(): Promise<ISportDocument[]> {
    return Sport.find().sort({ name: 1 });
  }

  /**
   * Retrieves a single sport by its MongoDB ID.
   */
  public async getSportById(id: string | Types.ObjectId): Promise<ISportDocument> {
    const sport = await Sport.findById(id);
    if (!sport) {
      throw new NotFoundError(Messages.SPORT_NOT_FOUND, ErrorCodes.SPORT_NOT_FOUND);
    }
    return sport;
  }

  /**
   * Retrieves a sport by its unique key slug.
   */
  public async getSportByKey(key: string): Promise<ISportDocument | null> {
    return Sport.findOne({ key: key.toLowerCase().trim() });
  }

  /**
   * Admin: Creates a new sport catalog entry.
   */
  public async createSport(dto: CreateSportDTO): Promise<ISportDocument> {
    const normalizedKey = dto.key.toLowerCase().trim();
    const existing = await Sport.findOne({ key: normalizedKey });
    if (existing) {
      throw new ConflictError(
        `Sport with key "${normalizedKey}" already exists`,
        ErrorCodes.USER_ALREADY_EXISTS,
      );
    }

    return Sport.create({
      ...dto,
      key: normalizedKey,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
    });
  }

  /**
   * Admin: Updates an existing sport catalog entry.
   */
  public async updateSport(
    id: string | Types.ObjectId,
    dto: UpdateSportDTO,
  ): Promise<ISportDocument> {
    const sport = await Sport.findById(id);
    if (!sport) {
      throw new NotFoundError(Messages.SPORT_NOT_FOUND, ErrorCodes.SPORT_NOT_FOUND);
    }

    if (dto.name !== undefined) sport.name = dto.name;
    if (dto.isActive !== undefined) sport.isActive = dto.isActive;
    if (dto.isTeamBased !== undefined) sport.isTeamBased = dto.isTeamBased;
    if (dto.minPlayers !== undefined) sport.minPlayers = dto.minPlayers;
    if (dto.maxPlayers !== undefined) sport.maxPlayers = dto.maxPlayers;
    if (dto.skillBands !== undefined) sport.skillBands = dto.skillBands;
    if (dto.playStyles !== undefined) sport.playStyles = dto.playStyles;
    if (dto.positions !== undefined) sport.positions = dto.positions;

    await sport.save();
    return sport;
  }
}

export const sportService = new SportService();
