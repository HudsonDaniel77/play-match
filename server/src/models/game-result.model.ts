import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import { Collections } from '../constants/collections.js';
import {
  ResultStatuses,
  RatingStatuses,
  type ResultStatus,
  type RatingStatus,
} from '../constants/result-constants.js';

export interface IGameResultScore {
  sideKey: string;
  score: number;
  winner: boolean;
}

export interface IGameResultProposal {
  proposedByUserId: Types.ObjectId | string;
  proposedAt: Date;
  scores: IGameResultScore[];
  notes?: string;
}

export interface IGameResult {
  gameId: Types.ObjectId;
  status: ResultStatus;
  ratingStatus: RatingStatus;
  proposal: IGameResultProposal;
  whoMustActNext: Types.ObjectId[];
  verifiedAt?: Date;
  disputedAt?: Date;
  disputedByUserId?: Types.ObjectId;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGameResultDocument extends IGameResult, Document {
  id: string;
}

const scoreSchema = new Schema<IGameResultScore>(
  {
    sideKey: { type: String, required: true },
    score: { type: Number, required: true },
    winner: { type: Boolean, required: true },
  },
  { _id: false },
);

const proposalSchema = new Schema<IGameResultProposal>(
  {
    proposedByUserId: {
      type: Schema.Types.ObjectId,
      ref: Collections.USERS,
      required: true,
    },
    proposedAt: { type: Date, required: true, default: Date.now },
    scores: { type: [scoreSchema], required: true },
    notes: { type: String, trim: true },
  },
  { _id: false },
);

export const gameResultSchema = new Schema<IGameResultDocument>(
  {
    gameId: {
      type: Schema.Types.ObjectId,
      ref: Collections.GAMES,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(ResultStatuses),
      default: ResultStatuses.PENDING_CONFIRMATION,
      required: true,
    },
    ratingStatus: {
      type: String,
      enum: Object.values(RatingStatuses),
      default: RatingStatuses.NOT_PROCESSED,
      required: true,
    },
    proposal: { type: proposalSchema, required: true },
    whoMustActNext: [
      {
        type: Schema.Types.ObjectId,
        ref: Collections.USERS,
      },
    ],
    verifiedAt: { type: Date },
    disputedAt: { type: Date },
    disputedByUserId: {
      type: Schema.Types.ObjectId,
      ref: Collections.USERS,
    },
    resolvedAt: { type: Date },
  },
  {
    collection: Collections.GAME_RESULTS,
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret: Record<string, any>) {
        ret.id = ret._id ? String(ret._id) : undefined;
        delete ret._id;
        delete ret.__v;
        if (ret.gameId) {
          ret.gameId = String(ret.gameId);
        }
        if (ret.whoMustActNext && Array.isArray(ret.whoMustActNext)) {
          ret.whoMustActNext = ret.whoMustActNext.map((id: any) => String(id));
        }
        if (ret.proposal && ret.proposal.proposedByUserId) {
          ret.proposal.proposedByUserId = String(ret.proposal.proposedByUserId);
        }
        if (ret.disputedByUserId) {
          ret.disputedByUserId = String(ret.disputedByUserId);
        }
        return ret;
      },
    },
  },
);

export const GameResult: Model<IGameResultDocument> = model<IGameResultDocument>(
  'GameResult',
  gameResultSchema,
);
