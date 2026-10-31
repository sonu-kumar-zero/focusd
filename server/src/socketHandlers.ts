import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";
import { createWebRtcTransport, watchTransport } from "./mediaServer.js";
import { peerFromSocket, joinRoom, leaveRoom } from "./roomService.js";
import { RoomStore } from "./roomStore.js";
import type { CallSocket, ClientToServerEvents, ProducerSummary, ServerToClientEvents } from "./types.js";

type Io = Server<ClientToServerEvents, ServerToClientEvents>;

export function registerSocketHandlers(io: Io, store: RoomStore): void {
  io.on("connection", (socket) => {
    socket.on("room:create", async ({ name }) => {
      leaveRoom(socket, store);
      let roomId = RoomStore.roomId();
      while (store.getRoomById(roomId)) roomId = RoomStore.roomId();
      const peer = peerFromSocket(socket, name);
      await store.create(roomId, peer);
      socket.join(roomId);
      socket.emit("room:created", { roomId, selfId: socket.id });
    });

    socket.on("room:join", ({ roomId: rawRoomId, name }) => {
      leaveRoom(socket, store);
      const roomId = String(rawRoomId ?? "").trim().toUpperCase();
      const result = joinRoom(socket, store, roomId, peerFromSocket(socket, name));
      if ("error" in result) {
        socket.emit("room:error", { message: result.error });
        return;
      }
      socket.emit("room:joined", { roomId, selfId: socket.id, peers: result.existingPeers });
      socket.to(roomId).emit("peer:joined", peerFromSocket(socket, name));
    });

    registerSfuHandlers(socket, store);
    registerRoomMessagingHandlers(socket, io, store);
    socket.on("room:leave", () => leaveRoom(socket, store));
    socket.on("disconnect", () => leaveRoom(socket, store));
  });
}

function registerSfuHandlers(socket: CallSocket, store: RoomStore): void {
  socket.on("sfu:get-router-capabilities", (callback) => {
    const room = store.getRoom(socket);
    if (!room) {
      callback({ error: "Join a room first." });
      return;
    }
    callback({ routerRtpCapabilities: room.router.rtpCapabilities });
  });

  socket.on("sfu:create-transport", async ({ direction }, callback) => {
    const room = store.getRoom(socket);
    const peer = store.getPeer(socket);
    if (!room || !peer) {
      callback({ error: "Join a room first." });
      return;
    }
    try {
      const transport = await createWebRtcTransport(room.router);
      peer.transports.set(transport.id, transport);
      watchTransport(transport, () => peer.transports.delete(transport.id));
      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        direction,
      });
    } catch (error) {
      callback({ error: error instanceof Error ? error.message : "Could not create transport." });
    }
  });

  socket.on("sfu:connect-transport", async ({ transportId, dtlsParameters }, callback) => {
    const transport = store.getPeer(socket)?.transports.get(transportId);
    if (!transport) {
      callback({ error: "Transport not found." });
      return;
    }
    try {
      await transport.connect({ dtlsParameters });
      callback({});
    } catch (error) {
      callback({ error: error instanceof Error ? error.message : "Could not connect transport." });
    }
  });

  socket.on("sfu:produce", async ({ transportId, kind, rtpParameters, source }, callback) => {
    const peer = store.getPeer(socket);
    const roomId = store.getRoomId(socket);
    const transport = peer?.transports.get(transportId);
    if (!peer || !roomId || !transport) {
      callback({ error: "Send transport not found." });
      return;
    }
    try {
      const producer = await transport.produce({ kind, rtpParameters, appData: { source } });
      peer.producers.set(producer.id, producer);
      producer.on("transportclose", () => peer.producers.delete(producer.id));
      socket.to(roomId).emit("sfu:new-producer", { producerId: producer.id, peerId: socket.id, kind, source });
      callback({ id: producer.id });
    } catch (error) {
      callback({ error: error instanceof Error ? error.message : "Could not publish media." });
    }
  });

  socket.on("sfu:get-producers", (callback) => {
    const room = store.getRoom(socket);
    if (!room) {
      callback({ error: "Join a room first." });
      return;
    }
    const producers: ProducerSummary[] = [...room.peers.values()]
      .filter(({ peer }) => peer.id !== socket.id)
      .flatMap(({ peer, producers: peerProducers }) => [...peerProducers.values()].map((producer) => ({
        producerId: producer.id,
        peerId: peer.id,
        kind: producer.kind,
        source: (producer.appData.source ?? "camera") as "camera" | "microphone",
      })));
    callback({ producers });
  });

  socket.on("sfu:consume", async ({ transportId, producerId, rtpCapabilities }, callback) => {
    const room = store.getRoom(socket);
    const peer = store.getPeer(socket);
    const transport = peer?.transports.get(transportId);
    if (!room || !peer || !transport || !room.router.canConsume({ producerId, rtpCapabilities })) {
      callback({ error: "Cannot consume this producer." });
      return;
    }
    try {
      const sourcePeer = [...room.peers.values()].find(({ producers }) => producers.has(producerId));
      const producer = sourcePeer?.producers.get(producerId);
      if (!sourcePeer || !producer || sourcePeer.peer.id === socket.id) {
        callback({ error: "Producer not found." });
        return;
      }
      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: true,
        appData: { peerId: sourcePeer.peer.id, source: producer.appData.source },
      });
      peer.consumers.set(consumer.id, consumer);
      consumer.on("transportclose", () => peer.consumers.delete(consumer.id));
      callback({
        id: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        peerId: sourcePeer.peer.id,
        source: producer.appData.source ?? "camera",
      });
    } catch (error) {
      callback({ error: error instanceof Error ? error.message : "Could not subscribe to media." });
    }
  });

  socket.on("sfu:resume-consumer", async ({ consumerId }, callback) => {
    const consumer = store.getPeer(socket)?.consumers.get(consumerId);
    if (!consumer) {
      callback({ error: "Consumer not found." });
      return;
    }
    try {
      await consumer.resume();
      callback({});
    } catch (error) {
      callback({ error: error instanceof Error ? error.message : "Could not resume media." });
    }
  });
}

function registerRoomMessagingHandlers(socket: CallSocket, io: Io, store: RoomStore): void {
  socket.on("peer:media", (payload) => {
    const roomId = store.getRoomId(socket);
    if (roomId) socket.to(roomId).emit("peer:media", { peerId: socket.id, ...payload });
  });
  socket.on("chat:message", ({ text }) => {
    const roomId = store.getRoomId(socket);
    const safeText = String(text ?? "").trim().slice(0, 1000);
    if (!roomId || !safeText) return;
    io.to(roomId).emit("chat:message", {
      id: randomUUID(),
      senderId: socket.id,
      senderName: store.getName(socket),
      text: safeText,
      sentAt: Date.now(),
    });
  });
}
