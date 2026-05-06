import mongoose, { Schema, type Document, type Model } from 'mongoose';
import { invalidateCalendarCache } from '../services/calendarCheckerCache.js';

export interface IHolidayTransfer extends Document {
  fromDate: Date;
  toDate: Date;
  year: number;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const holidayTransferSchema = new Schema<IHolidayTransfer>(
  {
    fromDate: { type: Date, required: true, index: true },
    toDate: { type: Date, required: true, index: true },
    year: { type: Number, required: true, index: true },
    description: { type: String, trim: true },
  },
  { timestamps: true },
);

holidayTransferSchema.index({ fromDate: 1, toDate: 1 }, { unique: true });

holidayTransferSchema.post('save', invalidateCalendarCache);
holidayTransferSchema.post('insertMany', invalidateCalendarCache);
holidayTransferSchema.post(
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

export const HolidayTransfer: Model<IHolidayTransfer> = mongoose.model<IHolidayTransfer>(
  'HolidayTransfer',
  holidayTransferSchema,
);
