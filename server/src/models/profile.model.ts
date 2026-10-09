import { Schema, model, type Document, type Model, Types } from 'mongoose';
import { Collections } from '../constants/collections.js';
import {
  OnboardingStatuses,
  type OnboardingStatus,
} from '../constants/onboarding-steps.js';
import {
  ProfileVisibility,
  LocationVisibility,
  RatingVisibility,
  type ProfileVisibilityType,
  type LocationVisibilityType,
  type RatingVisibilityType,
} from '../constants/visibility.js';
import { config } from '../config/index.js';

export interface IAvailabilitySlot {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

export interface IGeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

export interface IVisibilitySettings {
  profile: ProfileVisibilityType;
  location: LocationVisibilityType;
  ratings: RatingVisibilityType;
}

export interface IOnboardingState {
  status: OnboardingStatus;
  completedSteps: string[];
  completedAt: Date | null;
}

export interface IProfile {
  user: Types.ObjectId;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  dateOfBirth: Date | null;
  timezone: string;
  homeLocation: IGeoPoint;
  locationLabel: string | null;
  travelRadiusKm: number;
  availability: IAvailabilitySlot[];
  visibility: IVisibilitySettings;
  onboarding: IOnboardingState;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProfileDocument extends IProfile, Document {
  id: string;
}

const availabilitySlotSchema = new Schema<IAvailabilitySlot>(
  {
    dayOfWeek: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
    },
    startMinute: {
      type: Number,
      required: true,
      min: 0,
      max: 1439,
    },
    endMinute: {
      type: Number,
      required: true,
      min: 1,
      max: 1440,
    },
  },
  { _id: false },
);

const profileSchema = new Schema<IProfileDocument>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    bio: {
      type: String,
      default: '',
    },
    avatarUrl: {
      type: String,
      default: null,
    },
    dateOfBirth: {
      type: Date,
      default: null,
    },
    timezone: {
      type: String,
      required: true,
      default: () => config.DEFAULT_TIMEZONE,
    },
    homeLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
        default: [0, 0],
      },
    },
    locationLabel: {
      type: String,
      default: null,
    },
    travelRadiusKm: {
      type: Number,
      default: () => config.DEFAULT_TRAVEL_RADIUS_KM,
    },
    availability: {
      type: [availabilitySlotSchema],
      default: [],
    },
    visibility: {
      profile: {
        type: String,
        enum: [
          ProfileVisibility.PUBLIC,
          ProfileVisibility.FRIENDS,
          ProfileVisibility.PRIVATE,
        ],
        default: ProfileVisibility.PUBLIC,
      },
      location: {
        type: String,
        enum: [LocationVisibility.COARSENED, LocationVisibility.HIDDEN],
        default: LocationVisibility.COARSENED,
      },
      ratings: {
        type: String,
        enum: [RatingVisibility.PUBLIC, RatingVisibility.HIDDEN],
        default: RatingVisibility.PUBLIC,
      },
    },
    onboarding: {
      status: {
        type: String,
        enum: [
          OnboardingStatuses.NOT_STARTED,
          OnboardingStatuses.IN_PROGRESS,
          OnboardingStatuses.COMPLETED,
        ],
        default: OnboardingStatuses.NOT_STARTED,
        index: true,
      },
      completedSteps: {
        type: [String],
        default: [],
      },
      completedAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    collection: Collections.PROFILES,
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = ret._id ? String(ret._id) : undefined;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = ret._id ? String(ret._id) : undefined;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Geospatial 2dsphere index for location-aware matchmaking and venue proximity
profileSchema.index({ homeLocation: '2dsphere' });

export const Profile: Model<IProfileDocument> = model<IProfileDocument>(
  'Profile',
  profileSchema,
);
