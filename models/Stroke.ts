import mongoose, { Schema, type InferSchemaType } from "mongoose";

const StrokeSchema = new Schema(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "Room", required: true },
    strokeId: { type: String, required: true, maxlength: 100 },
    part: { type: Number, required: true, min: 0 },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tool: { type: String, enum: ["pen", "highlighter", "line", "rect", "ellipse"], required: true },
    color: { type: String, required: true, match: /^#[0-9a-fA-F]{6}$/ },
    width: { type: Number, required: true, min: 0, max: 1 },
    points: { type: [Number], required: true, validate: (v: number[]) => v.length <= 500 && v.length % 2 === 0 },
    seq: { type: Number, required: true, min: 1 },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

StrokeSchema.index({ roomId: 1, seq: 1 });
StrokeSchema.index({ roomId: 1, strokeId: 1, part: 1 }, { unique: true });

export type StrokeDocument = InferSchemaType<typeof StrokeSchema> & mongoose.Document;
export default (mongoose.models.Stroke as mongoose.Model<StrokeDocument>) ??
  mongoose.model<StrokeDocument>("Stroke", StrokeSchema);
