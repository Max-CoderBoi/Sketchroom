import { connectToDatabase } from "@/lib/db";
import { json } from "@/lib/http";
import { checkPusherConnection, isPusherConfigured } from "@/lib/pusher";

export const runtime = "nodejs";

type ServiceHealth = { configured: boolean; reachable: boolean };

async function checkService(configured: boolean, check: () => Promise<unknown>): Promise<ServiceHealth> {
  if (!configured) return { configured: false, reachable: false };

  try {
    await check();
    return { configured: true, reachable: true };
  } catch {
    return { configured: true, reachable: false };
  }
}

export async function GET() {
  const mongodbConfigured = Boolean(process.env.MONGODB_URI);
  const pusherConfigured = isPusherConfigured();
  const [mongodb, pusher] = await Promise.all([
    checkService(mongodbConfigured, async () => {
      const connection = await connectToDatabase();
      const database = connection.connection.db;
      if (!database) throw new Error("MongoDB connection is not initialized.");
      await database.admin().ping();
    }),
    checkService(pusherConfigured, checkPusherConnection),
  ]);
  const healthy = mongodb.reachable && pusher.reachable;

  return json({ status: healthy ? "ok" : "error", services: { mongodb, pusher } }, healthy ? 200 : 503);
}
