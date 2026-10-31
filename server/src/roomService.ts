import type { Socket } from "socket.io";
import { MAX_ROOM_SIZE } from "./config.js";
import type { CallSocket, Peer, PeerMedia, Room } from "./types.js";
import { RoomStore } from "./roomStore.js";

export function cleanName(value: string): string {
  return String(value ?? "Guest").trim().slice(0, 40) || "Guest";
}

export function closePeer(peer: PeerMedia): void {
  peer.consumers.forEach((consumer) => consumer.close());
  peer.producers.forEach((producer) => producer.close());
  peer.transports.forEach((transport) => transport.close());
}

export function leaveRoom(socket: CallSocket, store: RoomStore): void {
  const removed = store.removePeer(socket);
  if (!removed) return;
  const { roomId, room, peer } = removed;
  peer?.producers.forEach((producer) => socket.to(roomId).emit("sfu:producer-closed", { producerId: producer.id, peerId: socket.id }));
  if (peer) closePeer(peer);
  socket.to(roomId).emit("peer:left", { peerId: socket.id });
  socket.leave(roomId);
  store.deleteIfEmpty(roomId, room);
}

export function joinRoom(
  socket: CallSocket,
  store: RoomStore,
  roomId: string,
  peer: Peer,
): { room: Room; existingPeers: Peer[] } | { error: string } {
  const room = store.getRoomById(roomId);
  if (!room) return { error: "Room not found. Check the code or create a new room." };
  if (room.peers.size >= MAX_ROOM_SIZE) return { error: `This room already has ${MAX_ROOM_SIZE} participants.` };
  const existingPeers = [...room.peers.values()].map(({ peer: info }) => info);
  store.addPeer(roomId, peer, room);
  socket.join(roomId);
  return { room, existingPeers };
}

export function peerFromSocket(socket: Socket, name: string): Peer {
  return { id: socket.id, name: cleanName(name) };
}
