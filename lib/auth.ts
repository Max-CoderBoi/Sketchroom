import bcrypt from "bcryptjs";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { HttpError } from "@/lib/http";
import User, { type UserDocument } from "@/models/User";

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured.");
  return secret;
}

export function signToken(userId: string) {
  return jwt.sign({}, jwtSecret(), { subject: userId, expiresIn: "7d" });
}

export async function getUserFromRequest(request: Request | NextRequest): Promise<UserDocument> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new HttpError(401, "Authentication required.");

  const secret = jwtSecret();
  let payload: string | JwtPayload;
  try {
    payload = jwt.verify(authorization.slice(7).trim(), secret);
  } catch {
    throw new HttpError(401, "Invalid or expired token.");
  }
  if (typeof payload === "string" || !payload.sub) {
    throw new HttpError(401, "Invalid or expired token.");
  }

  await connectToDatabase();
  const user = await User.findById(payload.sub);
  if (!user) throw new HttpError(401, "Authentication required.");
  return user;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
