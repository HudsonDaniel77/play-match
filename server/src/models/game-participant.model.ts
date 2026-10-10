import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import { Collections } from '../constants/collections.js';
import {
  ParticipantRoles,
  ParticipantStatuses,
  LeaveTypes,
  type ParticipantRole,
  type ParticipantStatus,
  type LeaveType,
} from '../constants/game-constants.js';

export interface IGameParticipant {
  gameId: Types.ObjectId;
  userId: Types.ObjectId;
  role: ParticipantRole;
  status: ParticipantStatus;
  joinedAt?: Date;
  requestedAt?: Date;
  waitlistedAt?: Date;
  leftAt?: Date;
  leaveType?: LeaveType;
  declinedAt?: Date;
  removedAt?: Date;
  removedBy?: Types.ObjectId;
  removeReason?: string;
  userRatingAtJoin?: number;
  startsAt: Date; // Denormalized from Game for conflict queries
  endsAt: Date;   // Denormalized from Game for conflict queries
  createdAt: Date;
  updatedAt: Date;
}

export interface IGameParticipantDocument extends IGameParticipant, Document {
  id: string;
}

export const gameParticipantSchema = new Schema<IGameParticipantDocument>(
  {
    gameId: {
      type: Schema.Types.ObjectId,
      ref: Collections.GAMES,
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: Collections.USERS,
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: Object.values(ParticipantRoles),
      default: ParticipantRoles.PLAYER,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(ParticipantStatuses),
      default: ParticipantStatuses.JOINED,
      required: true,
      index: true,
    },
    joinedAt: { type: Date },
    requestedAt: { type: Date },
    waitlistedAt: { type: Date },
    leftAt: { type: Date },
    leaveType: {
      type: String,
      enum: Object.values(LeaveTypes),
    },
    declinedAt: { type: Date },
    removedAt: { type: Date },
    removedBy: { type: Schema.Types.ObjectId, ref: Collections.USERS },
    removeReason: { type: String, trim: true },
    userRatingAtJoin: { type: Number },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        return ret;
      },
    },
  },
);

// Indexes
// Partial unique index preventing duplicate active participations
gameParticipantSchema.index(
  { gameId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: {
        $in: [
          ParticipantStatuses.JOINED,
          ParticipantStatuses.REQUESTED,
          ParticipantStatuses.WAITLISTED,
        ],
      },
    },
  },
);

// Conflict check and schedule index
gameParticipantSchema.index({
  userId: 1,
  status: 1,
  startsAt: 1,
  endsAt: 1,
});

// Waitlist FIFO queue index
gameParticipantSchema.index({
  gameId: 1,
  status: 1,
  waitlistedAt: 1,
});

export const GameParticipant: Model<IGameParticipantDocument> = model<IGameParticipantDocument>(
  Collections.GAME_PARTICIPANTS,
  gameParticipantSchema,
);
