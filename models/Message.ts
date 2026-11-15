import mongoose, { Schema, type InferSchemaType } from "mongoose";

const MessageSchema = new Schema(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "Room", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    userName: { type: String, required: true, maxlength: 60 },
    text: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

MessageSchema.index({ roomId: 1, createdAt: 1 });

export type MessageDocument = InferSchemaType<typeof MessageSchema> & mongoose.Document;
export default (mongoose.models.Message as mongoose.Model<MessageDocument>) ??
  mongoose.model<MessageDocument>("Message", MessageSchema);
