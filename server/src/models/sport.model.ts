import { Schema, model, type Document, type Model } from 'mongoose';
import { Collections } from '../constants/collections.js';

export interface ISkillBand {
  key: string;
  label: string;
  order: number;
  seedRating: number;
}

export interface IPlayStyle {
  key: string;
  label: string;
}

export interface IPosition {
  key: string;
  label: string;
}

export interface ISport {
  key: string;
  name: string;
  isActive: boolean;
  isTeamBased: boolean;
  minPlayers: number;
  maxPlayers: number;
  allowsDraws?: boolean;
  skillBands: ISkillBand[];
  playStyles: IPlayStyle[];
  positions: IPosition[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ISportDocument extends ISport, Document {
  id: string;
}

const skillBandSchema = new Schema<ISkillBand>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    order: { type: Number, required: true },
    seedRating: { type: Number, required: true },
  },
  { _id: false },
);

const playStyleSchema = new Schema<IPlayStyle>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
  },
  { _id: false },
);

const positionSchema = new Schema<IPosition>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
  },
  { _id: false },
);

const sportSchema = new Schema<ISportDocument>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isTeamBased: {
      type: Boolean,
      default: false,
    },
    allowsDraws: {
      type: Boolean,
      default: false,
    },
    minPlayers: {
      type: Number,
      required: true,
      min: 1,
    },
    maxPlayers: {
      type: Number,
      required: true,
      min: 1,
    },
    skillBands: {
      type: [skillBandSchema],
      required: true,
      default: [],
    },
    playStyles: {
      type: [playStyleSchema],
      required: true,
      default: [],
    },
    positions: {
      type: [positionSchema],
      default: [],
    },
  },
  {
    collection: Collections.SPORTS,
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

export const Sport: Model<ISportDocument> = model<ISportDocument>(
  'Sport',
  sportSchema,
);
