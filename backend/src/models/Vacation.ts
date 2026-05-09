import mongoose, {
  Schema,
  type Document,
  type Model,
  type Types,
} from 'mongoose';

export interface IVacation extends Document {
  userId: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const vacationSchema = new Schema<IVacation>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
  },
  { timestamps: true },
);

export const Vacation: Model<IVacation> = mongoose.model<IVacation>(
  'Vacation',
  vacationSchema,
);
