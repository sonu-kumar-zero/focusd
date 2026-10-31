import type {
  Consumer,
  DtlsParameters,
  Producer,
  RtpCapabilities,
  RtpParameters,
  Router,
  WebRtcTransport,
} from "mediasoup/types";

export type Peer = { id: string; name: string };
export type PeerMedia = {
  peer: Peer;
  transports: Map<string, WebRtcTransport>;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
};
export type Room = { peers: Map<string, PeerMedia>; router: Router };

export type ProducerSummary = {
  producerId: string;
  peerId: string;
  kind: "audio" | "video";
  source: "camera" | "microphone";
};

export type ClientToServerEvents = {
  "room:create": (payload: { name: string }) => void;
  "room:join": (payload: { roomId: string; name: string }) => void;
  "room:leave": () => void;
  "sfu:get-router-capabilities": (callback: (payload: { routerRtpCapabilities?: RtpCapabilities; error?: string }) => void) => void;
  "sfu:create-transport": (payload: { direction: "send" | "recv" }, callback: (payload: Record<string, unknown> & { error?: string }) => void) => void;
  "sfu:connect-transport": (payload: { transportId: string; dtlsParameters: DtlsParameters }, callback: (payload: { error?: string }) => void) => void;
  "sfu:produce": (payload: { transportId: string; kind: "audio" | "video"; rtpParameters: RtpParameters; source: "camera" | "microphone" }, callback: (payload: { id?: string; error?: string }) => void) => void;
  "sfu:get-producers": (callback: (payload: { producers?: ProducerSummary[]; error?: string }) => void) => void;
  "sfu:consume": (payload: { transportId: string; producerId: string; rtpCapabilities: RtpCapabilities }, callback: (payload: Record<string, unknown> & { error?: string }) => void) => void;
  "sfu:resume-consumer": (payload: { consumerId: string }, callback: (payload: { error?: string }) => void) => void;
  "chat:message": (payload: { text: string }) => void;
  "peer:media": (payload: { audio: boolean; video: boolean; screen: boolean }) => void;
};

export type ServerToClientEvents = {
  "room:created": (payload: { roomId: string; selfId: string }) => void;
  "room:joined": (payload: { roomId: string; selfId: string; peers: Peer[] }) => void;
  "peer:joined": (peer: Peer) => void;
  "peer:left": (payload: { peerId: string }) => void;
  "room:error": (payload: { message: string }) => void;
  "sfu:new-producer": (payload: ProducerSummary) => void;
  "sfu:producer-closed": (payload: { producerId: string; peerId: string }) => void;
  "chat:message": (message: { id: string; senderId: string; senderName: string; text: string; sentAt: number }) => void;
  "peer:media": (payload: { peerId: string; audio: boolean; video: boolean; screen: boolean }) => void;
};

export type CallSocket = import("socket.io").Socket<ClientToServerEvents, ServerToClientEvents>;
