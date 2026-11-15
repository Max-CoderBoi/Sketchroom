import Pusher from "pusher";

let client: Pusher | null = null;

function getPusher() {
  if (client) return client;
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env;
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) {
    throw new Error("Pusher environment variables are not fully configured.");
  }
  client = new Pusher({
    appId: PUSHER_APP_ID,
    key: PUSHER_KEY,
    secret: PUSHER_SECRET,
    cluster: PUSHER_CLUSTER,
    useTLS: true,
  });
  return client;
}

export async function triggerRoomEvent(code: string, event: string, payload: unknown) {
  try {
    await getPusher().trigger(`presence-room-${code}`, event, payload);
  } catch (error) {
    console.error(`Pusher event "${event}" failed:`, error);
  }
}

export function authorizePresenceChannel(
  socketId: string,
  channelName: string,
  user: { id: string; name: string; color: string; role: string },
) {
  return getPusher().authorizeChannel(socketId, channelName, {
    user_id: user.id,
    user_info: { name: user.name, color: user.color, role: user.role },
  });
}
