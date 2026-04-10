import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface ITeam extends Document {
  name: string;
  description?: string;
  region?: string;
  createdAt: Date;
  updatedAt: Date;
}

const teamSchema = new Schema<ITeam>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true },
    region: { type: String, trim: true },
  },
  { timestamps: true },
);

export const Team: Model<ITeam> = mongoose.model<ITeam>('Team', teamSchema);
