import { Types } from 'mongoose';
import {
  Profile,
  type IProfileDocument,
  type IAvailabilitySlot,
  type IVisibilitySettings,
} from '../models/profile.model.js';
import { User } from '../models/user.model.js';
import { SportProfile } from '../models/sport-profile.model.js';
import { Rating } from '../models/rating.model.js';
import { type ISportDocument } from '../models/sport.model.js';
import { config } from '../config/index.js';
import { OnboardingSteps } from '../constants/onboarding-steps.js';
import {
  ProfileVisibility,
  LocationVisibility,
  RatingVisibility,
} from '../constants/visibility.js';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from '../utils/app-error.js';
import { Messages } from '../constants/messages.js';
import { ErrorCodes } from '../constants/error-codes.js';

export interface UpdateBasicInfoDTO {
  displayName: string;
  bio?: string;
  avatarUrl?: string | null;
  dateOfBirth?: Date | string | null;
  timezone?: string;
}

export interface UpdateLocationDTO {
  coordinates: [number, number]; // [longitude, latitude]
  locationLabel?: string | null;
  travelRadiusKm?: number;
}

export interface UpdatePreferencesDTO {
  visibility?: Partial<IVisibilitySettings>;
}

/**
 * Coarsens a geographic coordinate to configured decimal precision.
 * E.g., 2 decimals gives ~1.1 km accuracy, concealing the player's street address.
 */
export function coarsenCoordinate(coordinate: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(coordinate * factor) / factor;
}

/**
 * Validates whether a string is a valid IANA timezone identifier.
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Helper to record step completion in player profile.
 */
export function recordStepCompletion(
  profile: IProfileDocument,
  step: string,
): void {
  if (!profile.onboarding.completedSteps.includes(step)) {
    profile.onboarding.completedSteps.push(step);
  }
  if (profile.onboarding.status === 'not_started') {
    profile.onboarding.status = 'in_progress';
  }
}

export class ProfileService {
  /**
   * Retrieves or initializes a player profile for a given user.
   */
  public async getOrCreateProfile(
    userId: string | Types.ObjectId,
    defaultDisplayName?: string,
  ): Promise<IProfileDocument> {
    const userObjectId = new Types.ObjectId(userId);
    let profile = await Profile.findOne({ user: userObjectId });

    if (!profile) {
      const user = await User.findById(userObjectId);
      const displayName = defaultDisplayName || user?.name || 'Player';

      profile = await Profile.create({
        user: userObjectId,
        displayName,
        timezone: config.DEFAULT_TIMEZONE,
        travelRadiusKm: config.DEFAULT_TRAVEL_RADIUS_KM,
        homeLocation: { type: 'Point', coordinates: [0, 0] },
      });
    }

    return profile;
  }

  /**
   * Updates player's basic profile details (displayName, bio, avatarUrl, dateOfBirth, timezone).
   */
  public async updateBasicInfo(
    userId: string | Types.ObjectId,
    dto: UpdateBasicInfoDTO,
  ): Promise<IProfileDocument> {
    const profile = await this.getOrCreateProfile(userId);

    // Validate display name length
    if (
      dto.displayName.trim().length < config.NAME_MIN_LENGTH ||
      dto.displayName.trim().length > config.NAME_MAX_LENGTH
    ) {
      throw new ValidationError(
        `Display name must be between ${config.NAME_MIN_LENGTH} and ${config.NAME_MAX_LENGTH} characters`,
      );
    }
    profile.displayName = dto.displayName.trim();

    // Validate bio length
    if (dto.bio !== undefined) {
      if (dto.bio.length > config.BIO_MAX_LENGTH) {
        throw new ValidationError(
          `Bio cannot exceed ${config.BIO_MAX_LENGTH} characters`,
        );
      }
      profile.bio = dto.bio;
    }

    if (dto.avatarUrl !== undefined) {
      profile.avatarUrl = dto.avatarUrl;
    }

    // Validate timezone
    if (dto.timezone !== undefined) {
      if (!isValidTimezone(dto.timezone)) {
        throw new ValidationError(
          Messages.INVALID_TIMEZONE,
          ErrorCodes.INVALID_TIMEZONE,
        );
      }
      profile.timezone = dto.timezone;
    }

    // Validate date of birth (age plausibility)
    if (dto.dateOfBirth !== undefined && dto.dateOfBirth !== null) {
      const dob = new Date(dto.dateOfBirth);
      if (isNaN(dob.getTime())) {
        throw new ValidationError('Invalid date of birth provided');
      }

      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
      }

      if (age < config.MIN_AGE || age > config.MAX_AGE) {
        throw new ValidationError(
          `Player age must be between ${config.MIN_AGE} and ${config.MAX_AGE} years`,
        );
      }
      profile.dateOfBirth = dob;
    }

    recordStepCompletion(profile, OnboardingSteps.BASIC_INFO);
    await profile.save();
    return profile;
  }

  /**
   * Updates weekly availability slots with overlap, duration, and limit validations.
   */
  public async updateAvailability(
    userId: string | Types.ObjectId,
    slots: IAvailabilitySlot[],
  ): Promise<IProfileDocument> {
    const profile = await this.getOrCreateProfile(userId);

    // Group slots by dayOfWeek to validate per-day constraints and overlaps
    const slotsByDay = new Map<number, IAvailabilitySlot[]>();

    for (const slot of slots) {
      if (slot.dayOfWeek < 0 || slot.dayOfWeek > 6) {
        throw new ValidationError('dayOfWeek must be an integer between 0 and 6');
      }
      if (slot.startMinute < 0 || slot.startMinute >= 1440) {
        throw new ValidationError('startMinute must be between 0 and 1439');
      }
      if (slot.endMinute <= slot.startMinute || slot.endMinute > 1440) {
        throw new ValidationError('endMinute must be greater than startMinute and at most 1440');
      }

      const durationMinutes = slot.endMinute - slot.startMinute;
      if (durationMinutes < config.MIN_SLOT_DURATION_MINUTES) {
        throw new ValidationError(
          `Each availability slot must be at least ${config.MIN_SLOT_DURATION_MINUTES} minutes long`,
        );
      }

      if (!slotsByDay.has(slot.dayOfWeek)) {
        slotsByDay.set(slot.dayOfWeek, []);
      }
      slotsByDay.get(slot.dayOfWeek)!.push(slot);
    }

    // Check max slots per day & overlap per day
    for (const [day, daySlots] of slotsByDay.entries()) {
      if (daySlots.length > config.MAX_AVAILABILITY_SLOTS_PER_DAY) {
        throw new ValidationError(
          `Maximum ${config.MAX_AVAILABILITY_SLOTS_PER_DAY} availability slots allowed for day ${day}`,
        );
      }

      // Sort slots chronologically
      daySlots.sort((a, b) => a.startMinute - b.startMinute);

      // Check for overlap
      for (let i = 0; i < daySlots.length - 1; i++) {
        const current = daySlots[i];
        const next = daySlots[i + 1];
        if (current.endMinute > next.startMinute) {
          throw new ValidationError(
            `Overlapping availability slots detected on day ${day} (${current.startMinute}-${current.endMinute} overlaps with ${next.startMinute}-${next.endMinute})`,
            ErrorCodes.INVALID_AVAILABILITY,
          );
        }
      }
    }

    profile.availability = slots;
    recordStepCompletion(profile, OnboardingSteps.AVAILABILITY);
    await profile.save();
    return profile;
  }

  /**
   * Updates home location coordinates, label, and travel search radius.
   */
  public async updateLocation(
    userId: string | Types.ObjectId,
    dto: UpdateLocationDTO,
  ): Promise<IProfileDocument> {
    const profile = await this.getOrCreateProfile(userId);

    const [longitude, latitude] = dto.coordinates;
    if (longitude < -180 || longitude > 180) {
      throw new ValidationError('Longitude must be between -180 and 180 degrees');
    }
    if (latitude < -90 || latitude > 90) {
      throw new ValidationError('Latitude must be between -90 and 90 degrees');
    }

    let travelRadius = profile.travelRadiusKm;
    if (dto.travelRadiusKm !== undefined) {
      if (
        dto.travelRadiusKm < config.MIN_TRAVEL_RADIUS_KM ||
        dto.travelRadiusKm > config.MAX_TRAVEL_RADIUS_KM
      ) {
        throw new ValidationError(
          `Travel radius must be between ${config.MIN_TRAVEL_RADIUS_KM} and ${config.MAX_TRAVEL_RADIUS_KM} km`,
        );
      }
      travelRadius = dto.travelRadiusKm;
    }

    profile.homeLocation = {
      type: 'Point',
      coordinates: [longitude, latitude],
    };
    if (dto.locationLabel !== undefined) {
      profile.locationLabel = dto.locationLabel;
    }
    profile.travelRadiusKm = travelRadius;

    recordStepCompletion(profile, OnboardingSteps.LOCATION);
    await profile.save();
    return profile;
  }

  /**
   * Updates player preferences and visibility settings.
   */
  public async updatePreferences(
    userId: string | Types.ObjectId,
    dto: UpdatePreferencesDTO,
  ): Promise<IProfileDocument> {
    const profile = await this.getOrCreateProfile(userId);

    if (dto.visibility) {
      if (dto.visibility.profile) {
        profile.visibility.profile = dto.visibility.profile;
      }
      if (dto.visibility.location) {
        profile.visibility.location = dto.visibility.location;
      }
      if (dto.visibility.ratings) {
        profile.visibility.ratings = dto.visibility.ratings;
      }
    }

    recordStepCompletion(profile, OnboardingSteps.PREFERENCES);
    await profile.save();
    return profile;
  }

  /**
   * Retrieves public view of a player's profile with privacy masking and location coarsening.
   */
  public async getPublicProfile(userId: string | Types.ObjectId): Promise<{
    id: string;
    displayName: string;
    bio: string;
    avatarUrl: string | null;
    sports: Array<{
      sport: { id: string; name: string; key: string };
      bandKey: string;
      bandLabel: string;
      rating?: number;
      provisional?: boolean;
    }>;
    location: {
      label: string | null;
      coordinates: [number, number];
    } | null;
  }> {
    const userObjectId = new Types.ObjectId(userId);
    const profile = await Profile.findOne({ user: userObjectId });
    if (!profile) {
      throw new NotFoundError(Messages.PROFILE_NOT_FOUND, ErrorCodes.PROFILE_NOT_FOUND);
    }

    // Check profile-level privacy
    if (profile.visibility.profile === ProfileVisibility.PRIVATE) {
      throw new ForbiddenError(Messages.PROFILE_IS_PRIVATE, ErrorCodes.PROFILE_PRIVATE);
    }

    // Fetch active sports and ratings
    const sportProfiles = await SportProfile.find({
      user: userObjectId,
      isActive: true,
    }).populate('sport');

    const ratings = await Rating.find({ user: userObjectId });
    const ratingMap = new Map<string, (typeof ratings)[0]>();
    for (const r of ratings) {
      ratingMap.set(String(r.sport), r);
    }

    // Format sports list respecting ratings visibility
    const publicSports = sportProfiles.map((sp) => {
      const sportDoc = sp.sport as unknown as ISportDocument;
      const band = sportDoc.skillBands.find((b) => b.key === sp.selectedBandKey);
      const ratingDoc = ratingMap.get(String(sp.sport._id || sp.sport));

      const entry: {
        sport: { id: string; name: string; key: string };
        bandKey: string;
        bandLabel: string;
        rating?: number;
        provisional?: boolean;
      } = {
        sport: {
          id: sportDoc.id || String(sportDoc._id),
          name: sportDoc.name,
          key: sportDoc.key,
        },
        bandKey: sp.selectedBandKey,
        bandLabel: band?.label || sp.selectedBandKey,
      };

      if (profile.visibility.ratings === RatingVisibility.PUBLIC && ratingDoc) {
        entry.rating = ratingDoc.rating;
        entry.provisional = ratingDoc.isProvisional();
      }

      return entry;
    });

    // Format coarsened location respecting location visibility
    let publicLocation: {
      label: string | null;
      coordinates: [number, number];
    } | null = null;

    if (profile.visibility.location === LocationVisibility.COARSENED) {
      const [rawLng, rawLat] = profile.homeLocation.coordinates;
      const precision = config.LOCATION_PUBLIC_PRECISION_DECIMALS;
      publicLocation = {
        label: profile.locationLabel,
        coordinates: [
          coarsenCoordinate(rawLng, precision),
          coarsenCoordinate(rawLat, precision),
        ],
      };
    }

    return {
      id: String(userObjectId),
      displayName: profile.displayName,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      sports: publicSports,
      location: publicLocation,
    };
  }
}

export const profileService = new ProfileService();
