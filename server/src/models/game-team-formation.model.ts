import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import { Collections } from '../constants/collections.js';
import {
  TeamBalanceMethods,
  type TeamBalanceMethod,
  type TeamSideKey,
} from '../constants/team-constants.js';

export interface ITeamFormationPlayer {
  userId: string;
  displayName: string;
  rating: number;
  position?: string;
}

export interface ITeamFormationTeam {
  sideKey: TeamSideKey;
  name: string;
  players: ITeamFormationPlayer[];
  ratingTotal: number;
  ratingAverage: number;
}

export interface ITeamFormationBalance {
  difference: number;
  method: TeamBalanceMethod;
}

export interface IGameTeamFormation {
  gameId: Types.ObjectId;
  teams: ITeamFormationTeam[];
  balance: ITeamFormationBalance;
  reasons: string[];
  generatedAt: Date;
  generatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGameTeamFormationDocument extends IGameTeamFormation, Document {
  id: string;
}

const teamPlayerSchema = new Schema<ITeamFormationPlayer>(
  {
    userId: { type: String, required: true },
    displayName: { type: String, required: true },
    rating: { type: Number, required: true },
    position: { type: String },
  },
  { _id: false },
);

const teamSchema = new Schema<ITeamFormationTeam>(
  {
    sideKey: { type: String, required: true },
    name: { type: String, required: true },
    players: { type: [teamPlayerSchema], required: true },
    ratingTotal: { type: Number, required: true },
    ratingAverage: { type: Number, required: true },
  },
  { _id: false },
);

const balanceSchema = new Schema<ITeamFormationBalance>(
  {
    difference: { type: Number, required: true },
    method: {
      type: String,
      enum: Object.values(TeamBalanceMethods),
      required: true,
    },
  },
  { _id: false },
);

export const gameTeamFormationSchema = new Schema<IGameTeamFormationDocument>(
  {
    gameId: {
      type: Schema.Types.ObjectId,
      ref: Collections.GAMES,
      required: true,
      unique: true,
      index: true,
    },
    teams: { type: [teamSchema], required: true },
    balance: { type: balanceSchema, required: true },
    reasons: { type: [String], required: true },
    generatedAt: { type: Date, required: true },
    generatedBy: {
      type: Schema.Types.ObjectId,
      ref: Collections.USERS,
      required: true,
    },
  },
  {
    collection: Collections.GAME_TEAM_FORMATIONS,
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = ret._id ? String(ret._id) : undefined;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

export const GameTeamFormation: Model<IGameTeamFormationDocument> =
  model<IGameTeamFormationDocument>(
    'GameTeamFormation',
    gameTeamFormationSchema,
  );
