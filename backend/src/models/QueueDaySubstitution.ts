import mongoose, {
  Schema,
  type Document,
  type Model,
  type Types,
} from 'mongoose';

export interface IQueueDaySubstitution extends Document {
  teamId: Types.ObjectId;
  /** Дата в календаре Москвы YYYY-MM-DD */
  moscowDate: string;
  substituteUserId: Types.ObjectId;
  createdAt: Date;
}

const queueDaySubstitutionSchema = new Schema<IQueueDaySubstitution>(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
      index: true,
    },
    moscowDate: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    substituteUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

queueDaySubstitutionSchema.index(
  { teamId: 1, moscowDate: 1 },
  { unique: true },
);

export const QueueDaySubstitution: Model<IQueueDaySubstitution> =
  mongoose.model<IQueueDaySubstitution>(
    'QueueDaySubstitution',
    queueDaySubstitutionSchema,
  );
