// ============================================================================
// backend/src/services/report-sse.ts — SSE broadcast service
// ============================================================================

import { ServerResponse } from "http";

interface SSEClient {
  id: string;
  res: ServerResponse;
}

class ReportSSEService {
  private clients: Map<string, SSEClient> = new Map();
  private counter = 0;

  addClient(res: ServerResponse): string {
    const id = `sse_${++this.counter}_${Date.now()}`;
    this.clients.set(id, { id, res });
    console.log(`[SSE] Admin connected: ${id} (total: ${this.clients.size})`);
    return id;
  }

  removeClient(id: string) {
    this.clients.delete(id);
    console.log(
      `[SSE] Admin disconnected: ${id} (total: ${this.clients.size})`,
    );
  }

  broadcast(data: any) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    const dead: string[] = [];

    for (const [id, client] of this.clients) {
      try {
        if (client.res.writableEnded || client.res.destroyed) {
          dead.push(id);
          continue;
        }
        client.res.write(payload);
      } catch (err) {
        dead.push(id);
      }
    }

    // Cleanup dead connections
    for (const id of dead) {
      this.clients.delete(id);
    }

    if (this.clients.size > 0) {
      console.log(
        `[SSE] Broadcast to ${this.clients.size} admin(s):`,
        data.type,
      );
    }
  }

  get connectedCount(): number {
    return this.clients.size;
  }
}

// Singleton — jeden na cały proces
export const reportSSE = new ReportSSEService();
