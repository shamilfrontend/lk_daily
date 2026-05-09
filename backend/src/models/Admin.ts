import mongoose, {
  Schema,
  type Document,
  type Model,
  type Types,
} from 'mongoose';

export type AdminRole = 'super' | 'team-lead';

export interface IAdmin extends Document {
  login: string;
  passwordHash: string;
  role: AdminRole;
  /** Для `team-lead`: команды, в которых разрешены мутации */
  teamIds: Types.ObjectId[];
}

const adminSchema = new Schema<IAdmin>(
  {
    login: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['super', 'team-lead'],
      default: 'super',
    },
    teamIds: [{ type: Schema.Types.ObjectId, ref: 'Team' }],
  },
  { timestamps: false },
);

export const Admin: Model<IAdmin> = mongoose.model<IAdmin>(
  'Admin',
  adminSchema,
);
