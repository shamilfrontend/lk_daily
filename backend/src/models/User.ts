import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export interface IUser extends Document {
  fullName: string;
  email?: string;
  teamId: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);
