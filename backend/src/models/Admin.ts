import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IAdmin extends Document {
  login: string;
  passwordHash: string;
}

const adminSchema = new Schema<IAdmin>(
  {
    login: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: false },
);

export const Admin: Model<IAdmin> = mongoose.model<IAdmin>('Admin', adminSchema);
