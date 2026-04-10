import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type NonWorkingDayType = 'federal' | 'transfer' | 'regional' | 'custom';

export interface INonWorkingDay extends Document {
  date: Date;
  type: NonWorkingDayType;
  region?: string;
  description?: string;
  createdAt: Date;
}

const nonWorkingDaySchema = new Schema<INonWorkingDay>(
  {
    date: { type: Date, required: true, index: true },
    type: {
      type: String,
      enum: ['federal', 'transfer', 'regional', 'custom'],
      required: true,
    },
    region: { type: String, trim: true },
    description: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

nonWorkingDaySchema.index({ date: 1, type: 1, region: 1 });

export const NonWorkingDay: Model<INonWorkingDay> = mongoose.model<INonWorkingDay>(
  'NonWorkingDay',
  nonWorkingDaySchema,
);
