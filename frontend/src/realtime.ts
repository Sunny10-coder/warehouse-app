import { useEffect } from "react";
import { getBackendBaseUrl, getToken } from "@/src/api";

type Topic = "users" | "schedules" | "attendance" | "leaves" | "dashboard" | "reports" | "all";

type RealtimeMessage = {
  topic?: Topic;
};

const topicMatches = (incoming: Topic | undefined, subscribed: Topic[]) => {
  if (!incoming) return false;
  return incoming === "all" || subscribed.includes("all") || subscribed.includes(incoming);
};

export function useRealtimeRefresh(refresh: () => void | Promise<void>, topics: Topic[]) {
  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = async () => {
      const baseUrl = getBackendBaseUrl();
      const token = await getToken();
      if (!baseUrl || !token || closed) return;

      const wsUrl = `${baseUrl.replace(/^http/, "ws")}/api/realtime/ws?token=${encodeURIComponent(token)}`;
      socket = new WebSocket(wsUrl);

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as RealtimeMessage;
          if (topicMatches(message.topic, topics)) {
            void refresh();
          }
        } catch {
          // Ignore malformed realtime pings; normal API refresh remains available.
        }
      };

      socket.onclose = () => {
        if (!closed) {
          reconnectTimer = setTimeout(connect, 5000);
        }
      };
    };

    void connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [refresh, topics.join("|")]);
}
