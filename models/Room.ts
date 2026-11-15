import mongoose, { Schema, type InferSchemaType } from "mongoose";

const MemberSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["owner", "editor", "viewer"], required: true },
    joinedAt: { type: Date, default: Date.now, required: true },
  },
  { _id: false },
);

const PageSchema = new Schema(
  {
    pageId: { type: String, required: true, maxlength: 64 },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 40 },
    order: { type: Number, required: true, min: 0 },
    bookmarkedBy: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
  },
  { _id: false },
);

const RoomSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, minlength: 6, maxlength: 6 },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: { type: [MemberSchema], default: [] },
    pages: { type: [PageSchema], default: [] },
    viewOnly: { type: Boolean, default: false },
    strokeSeq: { type: Number, default: 0 },
    thumbnail: { type: String, default: undefined },
  },
  { timestamps: true },
);

RoomSchema.index({ "members.userId": 1 });
RoomSchema.index({ "pages.pageId": 1 });

export type RoomDocument = InferSchemaType<typeof RoomSchema> & mongoose.Document;
export default (mongoose.models.Room as mongoose.Model<RoomDocument>) ??
  mongoose.model<RoomDocument>("Room", RoomSchema);
