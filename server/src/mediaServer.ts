import { createWorker } from "mediasoup";
import type { DtlsState, Router, WebRtcTransport } from "mediasoup/types";
import { MEDIA_CODECS, WORKER_SETTINGS } from "./config.js";
import type { Room } from "./types.js";

export async function createMediaWorker() {
  const worker = await createWorker(WORKER_SETTINGS);
  worker.on("died", () => {
    console.error("mediasoup worker died");
    setTimeout(() => process.exit(1), 2000);
  });
  return worker;
}

export async function createRoomRouter(worker: Awaited<ReturnType<typeof createMediaWorker>>): Promise<Room> {
  return { router: await worker.createRouter({ mediaCodecs: MEDIA_CODECS }), peers: new Map() };
}

export async function createWebRtcTransport(router: Router): Promise<WebRtcTransport> {
  const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP;
  return router.createWebRtcTransport({
    listenIps: [{ ip: "0.0.0.0", ...(announcedIp ? { announcedIp } : {}) }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });
}

export function watchTransport(transport: WebRtcTransport, onClose: () => void): void {
  transport.on("dtlsstatechange", (state: DtlsState) => {
    if (state === "closed") transport.close();
  });
  transport.on("@close", onClose);
}
