import type { WorkerSettings } from "mediasoup/types";

export const MAX_ROOM_SIZE = 10;
export const PORT = Number(process.env.PORT ?? 4000);
export const ALLOWED_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
export const MEDIA_CODECS = [
  { kind: "audio" as const, mimeType: "audio/opus", clockRate: 48000, channels: 2 },
  { kind: "video" as const, mimeType: "video/VP8", clockRate: 90000 },
];
export const WORKER_SETTINGS: WorkerSettings = {
  logLevel: "warn",
  rtcMinPort: Number(process.env.MEDIASOUP_MIN_PORT ?? 40000),
  rtcMaxPort: Number(process.env.MEDIASOUP_MAX_PORT ?? 40100),
};
