import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { ALLOWED_ORIGIN, PORT } from "./config.js";
import { createMediaWorker } from "./mediaServer.js";
import { registerSocketHandlers } from "./socketHandlers.js";
import { RoomStore } from "./roomStore.js";
import type { ClientToServerEvents, ServerToClientEvents } from "./types.js";

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.get("/health", (_req, res) => res.json({ ok: true, service: "webrtc-sfu" }));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: ALLOWED_ORIGIN, methods: ["GET", "POST"] },
  maxHttpBufferSize: 1e6,
});

const worker = await createMediaWorker();
registerSocketHandlers(io, new RoomStore(worker));

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`WebRTC SFU server listening on http://localhost:${PORT}`);
});
