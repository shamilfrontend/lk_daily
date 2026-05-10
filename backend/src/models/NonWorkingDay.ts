import mongoose, { Schema, type Document, type Model } from 'mongoose';

import { invalidateCalendarCache } from '../services/calendarCheckerCache.js';

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

nonWorkingDaySchema.post('save', invalidateCalendarCache);
nonWorkingDaySchema.post('insertMany', invalidateCalendarCache);
nonWorkingDaySchema.post(
  [
    'deleteOne',
    'deleteMany',
    'updateOne',
    'updateMany',
    'findOneAndDelete',
    'findOneAndUpdate',
    'findOneAndReplace',
    'replaceOne',
  ],
  { document: false, query: true },
  invalidateCalendarCache,
);

export const NonWorkingDay: Model<INonWorkingDay> =
  mongoose.model<INonWorkingDay>('NonWorkingDay', nonWorkingDaySchema);
