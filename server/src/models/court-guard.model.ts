import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import { Collections } from '../constants/collections.js';

export interface ICourtGuard {
  venueId: Types.ObjectId;
  courtId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICourtGuardDocument extends ICourtGuard, Document {
  id: string;
}

export const courtGuardSchema = new Schema<ICourtGuardDocument>(
  {
    venueId: {
      type: Schema.Types.ObjectId,
      ref: Collections.VENUES,
      required: true,
      index: true,
    },
    courtId: {
      type: String,
      required: true,
      trim: true,
    },
    version: {
      type: Number,
      required: true,
      default: 1,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = ret._id ? ret._id.toString() : undefined;
        delete ret._id;
        return ret;
      },
    },
  },
);

// Unique compound index per (venue, court)
courtGuardSchema.index({ venueId: 1, courtId: 1 }, { unique: true });

export const CourtGuard: Model<ICourtGuardDocument> = model<ICourtGuardDocument>(
  Collections.COURT_GUARDS,
  courtGuardSchema,
);
