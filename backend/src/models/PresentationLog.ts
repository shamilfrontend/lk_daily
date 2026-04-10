import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export type PresentationStatus = 'presented' | 'skipped' | 'no_available';

export interface IPresentationLog extends Document {
  teamId: Types.ObjectId;
  date: Date;
  userId: Types.ObjectId | null;
  status: PresentationStatus;
  note?: string;
  createdAt: Date;
}

const presentationLogSchema = new Schema<IPresentationLog>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
    date: { type: Date, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: {
      type: String,
      enum: ['presented', 'skipped', 'no_available'],
      required: true,
    },
    note: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

presentationLogSchema.index({ teamId: 1, date: 1 }, { unique: true });

export const PresentationLog: Model<IPresentationLog> = mongoose.model<IPresentationLog>(
  'PresentationLog',
  presentationLogSchema,
);
