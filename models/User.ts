import mongoose, { Schema, type InferSchemaType } from "mongoose";

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    color: { type: String, required: true },
  },
  { timestamps: true },
);

UserSchema.index({ email: 1 }, { unique: true });

export type UserDocument = InferSchemaType<typeof UserSchema> & mongoose.Document;
export default (mongoose.models.User as mongoose.Model<UserDocument>) ??
  mongoose.model<UserDocument>("User", UserSchema);
