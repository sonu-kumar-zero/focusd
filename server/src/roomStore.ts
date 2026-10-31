import { randomBytes } from "node:crypto";
import type { CallSocket, Peer, PeerMedia, Room } from "./types.js";
import { createRoomRouter } from "./mediaServer.js";

export class RoomStore {
  private readonly rooms = new Map<string, Room>();
  private readonly socketRoom = new Map<string, string>();
  private readonly socketNames = new Map<string, string>();

  constructor(private readonly worker: Parameters<typeof createRoomRouter>[0]) {}

  getRoom(socket: CallSocket): Room | undefined {
    return this.rooms.get(this.socketRoom.get(socket.id) ?? "");
  }

  getPeer(socket: CallSocket): PeerMedia | undefined {
    return this.getRoom(socket)?.peers.get(socket.id);
  }

  getRoomById(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getRoomId(socket: CallSocket): string | undefined {
    return this.socketRoom.get(socket.id);
  }

  getName(socket: CallSocket): string {
    return this.socketNames.get(socket.id) ?? "Guest";
  }

  async create(roomId: string, peer: Peer): Promise<Room> {
    const room = await createRoomRouter(this.worker);
    this.rooms.set(roomId, room);
    this.addPeer(roomId, peer, room);
    return room;
  }

  addPeer(roomId: string, peer: Peer, room = this.rooms.get(roomId)): void {
    if (!room) throw new Error("Room not found.");
    room.peers.set(peer.id, { peer, transports: new Map(), producers: new Map(), consumers: new Map() });
    this.socketRoom.set(peer.id, roomId);
    this.socketNames.set(peer.id, peer.name);
  }

  removePeer(socket: CallSocket): { roomId: string; room: Room; peer?: PeerMedia } | undefined {
    const roomId = this.socketRoom.get(socket.id);
    if (!roomId) return undefined;
    const room = this.rooms.get(roomId);
    const peer = room?.peers.get(socket.id);
    if (!room) return undefined;
    room.peers.delete(socket.id);
    this.socketRoom.delete(socket.id);
    this.socketNames.delete(socket.id);
    return { roomId, room, peer };
  }

  deleteIfEmpty(roomId: string, room: Room): void {
    if (room.peers.size === 0) {
      room.router.close();
      this.rooms.delete(roomId);
    }
  }

  static roomId(): string {
    return randomBytes(3).toString("hex").toUpperCase();
  }
}
