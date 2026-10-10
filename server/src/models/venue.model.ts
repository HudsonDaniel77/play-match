import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import { Collections } from '../constants/collections.js';
import { VenueStatuses, type VenueStatus } from '../constants/venue-constants.js';

export interface IVenueLocation {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

export interface IVenueAddress {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode?: string;
}

export interface IWeeklyHourSlot {
  dayOfWeek: number; // 0 (Sunday) to 6 (Saturday)
  openMinute: number; // 0 to 1439
  closeMinute: number; // 1 to 1440 (openMinute < closeMinute)
}

export interface IVenueClosure {
  closureId: string;
  startsAt: Date;
  endsAt: Date;
  reason?: string;
}

export interface ICourt {
  courtId: string;
  name: string;
  sportKeys: string[];
  isActive: boolean;
}

export interface IVenueContactInfo {
  phone?: string;
  email?: string;
  website?: string;
}

export interface IVenue {
  owner: Types.ObjectId;
  name: string;
  description: string;
  address: IVenueAddress;
  areaLabel: string;
  location: IVenueLocation;
  timezone: string;
  contactInfo?: IVenueContactInfo;
  photoUrls: string[];
  amenities: string[];
  weeklyHours: IWeeklyHourSlot[];
  closures: IVenueClosure[];
  courts: ICourt[];
  status: VenueStatus;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IVenueDocument extends IVenue, Document {
  id: string;
}

const venueLocationSchema = new Schema<IVenueLocation>(
  {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (val: number[]) =>
          Array.isArray(val) &&
          val.length === 2 &&
          val[0] >= -180 &&
          val[0] <= 180 &&
          val[1] >= -90 &&
          val[1] <= 90,
        message: 'Coordinates must be valid [longitude, latitude] numbers',
      },
    },
  },
  { _id: false },
);

const venueAddressSchema = new Schema<IVenueAddress>(
  {
    line1: { type: String, required: true, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, trim: true },
    postalCode: { type: String, trim: true },
  },
  { _id: false },
);

const weeklyHourSlotSchema = new Schema<IWeeklyHourSlot>(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    openMinute: { type: Number, required: true, min: 0, max: 1439 },
    closeMinute: { type: Number, required: true, min: 1, max: 1440 },
  },
  { _id: false },
);

const venueClosureSchema = new Schema<IVenueClosure>(
  {
    closureId: { type: String, required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    reason: { type: String, trim: true },
  },
  { _id: false },
);

const courtSchema = new Schema<ICourt>(
  {
    courtId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    sportKeys: { type: [String], required: true, default: [] },
    isActive: { type: Boolean, default: true },
  },
  { _id: false },
);

const contactInfoSchema = new Schema<IVenueContactInfo>(
  {
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
    website: { type: String, trim: true },
  },
  { _id: false },
);

export const venueSchema = new Schema<IVenueDocument>(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: Collections.USERS,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: venueAddressSchema,
      required: true,
    },
    areaLabel: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: venueLocationSchema,
      required: true,
    },
    timezone: {
      type: String,
      required: true,
      trim: true,
    },
    contactInfo: {
      type: contactInfoSchema,
    },
    photoUrls: {
      type: [String],
      default: [],
    },
    amenities: {
      type: [String],
      default: [],
    },
    weeklyHours: {
      type: [weeklyHourSlotSchema],
      default: [],
    },
    closures: {
      type: [venueClosureSchema],
      default: [],
    },
    courts: {
      type: [courtSchema],
      default: [],
    },
    status: {
      type: String,
      enum: Object.values(VenueStatuses),
      default: VenueStatuses.PENDING_APPROVAL,
      required: true,
      index: true,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: Collections.USERS,
    },
    approvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: 'version',
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        if (ret._id) {
          ret.id = ret._id.toString();
          ret._id = ret._id.toString();
        }
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret: Record<string, unknown>) {
        if (ret._id) {
          ret.id = ret._id.toString();
          ret._id = ret._id.toString();
        }
        return ret;
      },
    },
  },
);

// Indexes
venueSchema.index({ location: '2dsphere' });
venueSchema.index({ status: 1, 'courts.sportKeys': 1 });
venueSchema.index({ owner: 1, status: 1 });

export const Venue: Model<IVenueDocument> = model<IVenueDocument>(
  Collections.VENUES,
  venueSchema,
);
