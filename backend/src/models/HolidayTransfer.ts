import mongoose, { Schema, type Document, type Model } from 'mongoose';

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

export const HolidayTransfer: Model<IHolidayTransfer> = mongoose.model<IHolidayTransfer>(
  'HolidayTransfer',
  holidayTransferSchema,
);
