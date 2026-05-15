import mongoose, {
  Schema,
  type Document,
  type Model,
  type Types,
} from 'mongoose';

export interface IUser extends Document {
  fullName: string;
  teamId: Types.ObjectId;
  isActive: boolean;
  onMaternityLeave: boolean;
  onSickLeave: boolean;
  birthday?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    fullName: { type: String, required: true, trim: true },
    teamId: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
      index: true,
    },
    isActive: { type: Boolean, default: true },
    onMaternityLeave: { type: Boolean, default: false },
    onSickLeave: { type: Boolean, default: false },
    birthday: { type: Date, required: false },
  },
  { timestamps: true },
);

export const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);
