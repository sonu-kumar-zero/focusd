export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: number;
};

export type PeerInfo = { id: string; name: string };

export type ServerToClientEvents = {
  "room:created": (payload: { roomId: string; selfId: string }) => void;
  "room:joined": (payload: { roomId: string; selfId: string; peers: PeerInfo[] }) => void;
  "peer:joined": (peer: PeerInfo) => void;
  "peer:left": (payload: { peerId: string }) => void;
  "room:error": (payload: { message: string }) => void;
  "webrtc:offer": (payload: { from: string; offer: RTCSessionDescriptionInit }) => void;
  "webrtc:answer": (payload: { from: string; answer: RTCSessionDescriptionInit }) => void;
  "webrtc:ice-candidate": (payload: { from: string; candidate: RTCIceCandidateInit }) => void;
  "chat:message": (message: ChatMessage) => void;
  "peer:media": (payload: { peerId: string; audio: boolean; video: boolean; screen: boolean }) => void;
};

export type ClientToServerEvents = {
  "room:create": (payload: { name: string }) => void;
  "room:join": (payload: { roomId: string; name: string }) => void;
  "room:leave": () => void;
  "webrtc:offer": (payload: { to: string; offer: RTCSessionDescriptionInit }) => void;
  "webrtc:answer": (payload: { to: string; answer: RTCSessionDescriptionInit }) => void;
  "webrtc:ice-candidate": (payload: { to: string; candidate: RTCIceCandidateInit }) => void;
  "chat:message": (payload: { text: string }) => void;
  "peer:media": (payload: { audio: boolean; video: boolean; screen: boolean }) => void;
};
