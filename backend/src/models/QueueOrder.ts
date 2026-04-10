import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export interface IQueueOrder extends Document {
  teamId: Types.ObjectId;
  userIds: Types.ObjectId[];
  updatedAt: Date;
}

const queueOrderSchema = new Schema<IQueueOrder>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true, unique: true },
    userIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

export const QueueOrder: Model<IQueueOrder> = mongoose.model<IQueueOrder>(
  'QueueOrder',
  queueOrderSchema,
);
