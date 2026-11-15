import { z } from "zod";
import { verifyPassword, signToken } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { errorResponse, HttpError, json, readJson } from "@/lib/http";
import User from "@/models/User";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await readJson(request));
    await connectToDatabase();
    const user = await User.findOne({ email: body.email }).select("+passwordHash");
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new HttpError(401, "Email or password is incorrect.");
    }
    return json({
      token: signToken(user._id.toString()),
      user: { id: user._id.toString(), name: user.name, email: user.email, color: user.color },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
