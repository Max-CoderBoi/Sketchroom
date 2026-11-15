import mongoose, { Schema, type InferSchemaType } from "mongoose";

const MemberSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["owner", "editor", "viewer"], required: true },
    joinedAt: { type: Date, default: Date.now, required: true },
  },
  { _id: false },
);

const RoomSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, minlength: 6, maxlength: 6 },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: { type: [MemberSchema], default: [] },
    viewOnly: { type: Boolean, default: false },
    strokeSeq: { type: Number, default: 0 },
    thumbnail: { type: String, default: undefined },
  },
  { timestamps: true },
);

RoomSchema.index({ code: 1 }, { unique: true });
RoomSchema.index({ "members.userId": 1 });

export type RoomDocument = InferSchemaType<typeof RoomSchema> & mongoose.Document;
export default (mongoose.models.Room as mongoose.Model<RoomDocument>) ??
  mongoose.model<RoomDocument>("Room", RoomSchema);
