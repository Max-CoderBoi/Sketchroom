import { randomInt } from "node:crypto";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { errorResponse, json, readJson } from "@/lib/http";
import { hashPassword, signToken } from "@/lib/auth";
import User from "@/models/User";

export const runtime = "nodejs";

const colors = ["#4F46E5", "#DB2777", "#0891B2", "#16A34A", "#EA580C", "#7C3AED", "#0284C7", "#CA8A04", "#DC2626", "#0F766E"];
const schema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await readJson(request));
    await connectToDatabase();
    const existing = await User.exists({ email: body.email });
    if (existing) return json({ error: "An account with this email already exists." }, 409);

    const user = await User.create({
      name: body.name,
      email: body.email,
      passwordHash: await hashPassword(body.password),
      color: colors[randomInt(colors.length)],
    });
    return json({
      token: signToken(user._id.toString()),
      user: { id: user._id.toString(), name: user.name, email: user.email, color: user.color },
    }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
