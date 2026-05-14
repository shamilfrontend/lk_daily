import mongoose, {
  Schema,
  type Document,
  type Model,
  type Types,
} from 'mongoose';

export interface IQueueMember {
  userId: Types.ObjectId;
  active: boolean;
}

export interface IQueueOrder extends Document {
  teamId: Types.ObjectId;
  /** Упорядоченные участники очереди (порядок = порядок выступлений). */
  members: IQueueMember[];
  /** @deprecated миграция со старой схемы; не использовать в новом коде */
  userIds?: Types.ObjectId[];
  updatedAt: Date;
}

const queueMemberSchema = new Schema<IQueueMember>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    active: { type: Boolean, default: true },
  },
  { _id: false },
);

const queueOrderSchema = new Schema<IQueueOrder>(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
      unique: true,
    },
    members: {
      type: [queueMemberSchema],
      default: [],
    },
    userIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: { createdAt: false, updatedAt: true }, versionKey: false },
);

export const QueueOrder: Model<IQueueOrder> = mongoose.model<IQueueOrder>(
  'QueueOrder',
  queueOrderSchema,
);
