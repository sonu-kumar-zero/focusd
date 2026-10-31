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
  "sfu:new-producer": (payload: {
    producerId: string;
    peerId: string;
    kind: "audio" | "video";
    source: "camera" | "microphone";
  }) => void;
  "sfu:producer-closed": (payload: { producerId: string; peerId: string }) => void;
  "chat:message": (message: ChatMessage) => void;
  "peer:media": (payload: { peerId: string; audio: boolean; video: boolean; screen: boolean }) => void;
};

export type ClientToServerEvents = {
  "room:create": (payload: { name: string }) => void;
  "room:join": (payload: { roomId: string; name: string }) => void;
  "room:leave": () => void;
  "sfu:get-router-capabilities": (
    callback: (payload: { routerRtpCapabilities?: unknown; error?: string }) => void,
  ) => void;
  "sfu:create-transport": (
    payload: { direction: "send" | "recv" },
    callback: (payload: {
      id?: string;
      iceParameters?: unknown;
      iceCandidates?: unknown;
      dtlsParameters?: unknown;
      error?: string;
    }) => void,
  ) => void;
  "sfu:connect-transport": (
    payload: { transportId: string; dtlsParameters: unknown },
    callback: (payload: { error?: string }) => void,
  ) => void;
  "sfu:produce": (
    payload: {
      transportId: string;
      kind: "audio" | "video";
      rtpParameters: unknown;
      source: "camera" | "microphone";
    },
    callback: (payload: { id?: string; error?: string }) => void,
  ) => void;
  "sfu:get-producers": (
    callback: (
      payload: {
        producers?: Array<{
          producerId: string;
          peerId: string;
          kind: "audio" | "video";
          source: "camera" | "microphone";
        }>;
        error?: string;
      },
    ) => void,
  ) => void;
  "sfu:consume": (
    payload: {
      transportId: string;
      producerId: string;
      rtpCapabilities: unknown;
    },
    callback: (payload: {
      id?: string;
      producerId?: string;
      kind?: "audio" | "video";
      rtpParameters?: unknown;
      peerId?: string;
      source?: "camera" | "microphone";
      error?: string;
    }) => void,
  ) => void;
  "sfu:resume-consumer": (
    payload: { consumerId: string },
    callback: (payload: { error?: string }) => void,
  ) => void;
  "chat:message": (payload: { text: string }) => void;
  "peer:media": (payload: { audio: boolean; video: boolean; screen: boolean }) => void;
};
