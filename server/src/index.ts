import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { Server, Socket } from "socket.io";

type Peer = { id: string; name: string };
type Room = { peers: Map<string, Peer> };

type ClientToServerEvents = {
  "room:create": (payload: { name: string }) => void;
  "room:join": (payload: { roomId: string; name: string }) => void;
  "room:leave": () => void;
  "webrtc:offer": (payload: { to: string; offer: RTCSessionDescriptionInit }) => void;
  "webrtc:answer": (payload: { to: string; answer: RTCSessionDescriptionInit }) => void;
  "webrtc:ice-candidate": (payload: { to: string; candidate: RTCIceCandidateInit }) => void;
  "chat:message": (payload: { text: string }) => void;
  "peer:media": (payload: { audio: boolean; video: boolean; screen: boolean }) => void;
};
type ServerToClientEvents = {
  "room:created": (payload: { roomId: string; selfId: string }) => void;
  "room:joined": (payload: { roomId: string; selfId: string; peers: Peer[] }) => void;
  "peer:joined": (peer: Peer) => void;
  "peer:left": (payload: { peerId: string }) => void;
  "room:error": (payload: { message: string }) => void;
  "webrtc:offer": (payload: { from: string; offer: RTCSessionDescriptionInit }) => void;
  "webrtc:answer": (payload: { from: string; answer: RTCSessionDescriptionInit }) => void;
  "webrtc:ice-candidate": (payload: { from: string; candidate: RTCIceCandidateInit }) => void;
  "chat:message": (message: { id: string; senderId: string; senderName: string; text: string; sentAt: number }) => void;
  "peer:media": (payload: { peerId: string; audio: boolean; video: boolean; screen: boolean }) => void;
};

const app = express();
const allowedOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
app.use(cors({ origin: allowedOrigin }));
app.get("/health", (_req, res) => res.json({ ok: true, service: "webrtc-signaling" }));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: allowedOrigin, methods: ["GET", "POST"] },
  maxHttpBufferSize: 1e6
});

const rooms = new Map<string, Room>();
const socketRoom = new Map<string, string>();
const socketNames = new Map<string, string>();

function makeRoomId(): string {
  return randomBytes(3).toString("hex").toUpperCase();
}
function cleanName(value: string): string {
  return String(value ?? "Guest").trim().slice(0, 40) || "Guest";
}
function leaveRoom(socket: Socket<ClientToServerEvents, ServerToClientEvents>): void {
  const roomId = socketRoom.get(socket.id);
  if (!roomId) return;
  const room = rooms.get(roomId);
  room?.peers.delete(socket.id);
  socket.to(roomId).emit("peer:left", { peerId: socket.id });
  socket.leave(roomId);
  socketRoom.delete(socket.id);
  socketNames.delete(socket.id);
  if (room && room.peers.size === 0) rooms.delete(roomId);
}

io.on("connection", socket => {
  socket.on("room:create", ({ name }) => {
    leaveRoom(socket);
    let roomId = makeRoomId();
    while (rooms.has(roomId)) roomId = makeRoomId();
    const peer = { id: socket.id, name: cleanName(name) };
    rooms.set(roomId, { peers: new Map([[socket.id, peer]]) });
    socketRoom.set(socket.id, roomId);
    socketNames.set(socket.id, peer.name);
    socket.join(roomId);
    socket.emit("room:created", { roomId, selfId: socket.id });
  });

  socket.on("room:join", ({ roomId: rawRoomId, name }) => {
    leaveRoom(socket);
    const roomId = String(rawRoomId ?? "").trim().toUpperCase();
    const room = rooms.get(roomId);
    if (!room) { socket.emit("room:error", { message: "Room not found. Check the code or create a new room." }); return; }
    if (room.peers.size >= 2) { socket.emit("room:error", { message: "This room already has two participants." }); return; }
    const peer = { id: socket.id, name: cleanName(name) };
    const existingPeers = [...room.peers.values()];
    room.peers.set(socket.id, peer);
    socketRoom.set(socket.id, roomId);
    socketNames.set(socket.id, peer.name);
    socket.join(roomId);
    socket.emit("room:joined", { roomId, selfId: socket.id, peers: existingPeers });
    socket.to(roomId).emit("peer:joined", peer);
  });

  socket.on("room:leave", () => leaveRoom(socket));

  socket.on("webrtc:offer", ({ to, offer }) => {
    if (socketRoom.get(socket.id) && socketRoom.get(socket.id) === socketRoom.get(to)) {
      io.to(to).emit("webrtc:offer", { from: socket.id, offer });
    }
  });
  socket.on("webrtc:answer", ({ to, answer }) => {
    if (socketRoom.get(socket.id) && socketRoom.get(socket.id) === socketRoom.get(to)) {
      io.to(to).emit("webrtc:answer", { from: socket.id, answer });
    }
  });
  socket.on("webrtc:ice-candidate", ({ to, candidate }) => {
    if (socketRoom.get(socket.id) && socketRoom.get(socket.id) === socketRoom.get(to)) {
      io.to(to).emit("webrtc:ice-candidate", { from: socket.id, candidate });
    }
  });
  socket.on("peer:media", payload => {
    const roomId = socketRoom.get(socket.id);
    if (roomId) socket.to(roomId).emit("peer:media", { peerId: socket.id, ...payload });
  });
  socket.on("chat:message", ({ text }) => {
    const roomId = socketRoom.get(socket.id);
    const safeText = String(text ?? "").trim().slice(0, 1000);
    if (!roomId || !safeText) return;
    io.to(roomId).emit("chat:message", {
      id: randomUUID(), senderId: socket.id,
      senderName: socketNames.get(socket.id) ?? "Guest",
      text: safeText, sentAt: Date.now()
    });
  });
  socket.on("disconnect", () => leaveRoom(socket));
});

const port = Number(process.env.PORT ?? 4000);
httpServer.listen(port, "0.0.0.0", () => {
  console.log(`WebRTC signaling server listening on http://localhost:${port}`);
});
