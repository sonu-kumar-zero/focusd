import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type {
  ChatMessage,
  ClientToServerEvents,
  PeerInfo,
  ServerToClientEvents,
} from "../types";

type CallSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type MediaState = { audio: boolean; video: boolean; screen: boolean };
export type RemoteParticipant = PeerInfo & {
  stream: MediaStream | null;
  media: MediaState;
};

const SIGNALING_URL =
  import.meta.env.VITE_SIGNALING_URL || "http://localhost:4000";

function getIceServers(): RTCIceServer[] {
  const raw = import.meta.env.VITE_ICE_SERVERS as string | undefined;
  if (!raw) return [{ urls: "stun:stun.l.google.com:19302" }];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed as RTCIceServer[])
      : [{ urls: "stun:stun.l.google.com:19302" }];
  } catch {
    console.warn("VITE_ICE_SERVERS is invalid JSON; using default STUN.");
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }
}

function getMediaAccessError(error: unknown, fallback: string): string {
  if (error instanceof DOMException) {
    if (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError"
    ) {
      return "Camera and microphone access was denied. Allow access in your browser and try again.";
    }
    if (error.name === "NotFoundError") return "No camera or microphone was found.";
  }
  return error instanceof Error ? error.message : fallback;
}

async function getAvailableMedia(): Promise<MediaStream> {
  const stream = new MediaStream();
  if (!navigator.mediaDevices?.getUserMedia) return stream;

  try {
    const audio = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    audio.getAudioTracks().forEach((track) => stream.addTrack(track));
  } catch {
    // Audio is optional; continue and try the camera independently.
  }

  try {
    const video = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: true,
    });
    video.getVideoTracks().forEach((track) => stream.addTrack(track));
  } catch {
    // Video is optional; joining without a camera is supported.
  }

  return stream;
}

export function useCallSession() {
  const [name, setName] = useState("Guest");
  const [roomInput, setRoomInput] = useState("");
  const [roomId, setRoomId] = useState("");
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState("Ready to connect");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [remoteParticipants, setRemoteParticipants] = useState<
    RemoteParticipant[]
  >([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const socketRef = useRef<CallSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const peerConnectionsRef = useRef(new Map<string, RTCPeerConnection>());
  const remoteStreamsRef = useRef(new Map<string, MediaStream>());
  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const makingOffersRef = useRef(new Set<string>());
  const participantsRef = useRef<RemoteParticipant[]>([]);

  const updateParticipant = useCallback(
    (peer: PeerInfo, updates: Partial<RemoteParticipant>) => {
      setRemoteParticipants((current) => {
        const existing = current.find((item) => item.id === peer.id);
        const next = {
          ...peer,
          stream: null,
          media: { audio: true, video: true, screen: false },
          ...existing,
          ...updates,
        };
        const nextParticipants = existing
          ? current.map((item) => (item.id === peer.id ? next : item))
          : [...current, next];
        participantsRef.current = nextParticipants;
        return nextParticipants;
      });
    },
    [],
  );

  const removeParticipant = useCallback((peerId: string) => {
    peerConnectionsRef.current.get(peerId)?.close();
    peerConnectionsRef.current.delete(peerId);
    remoteStreamsRef.current.delete(peerId);
    pendingCandidatesRef.current.delete(peerId);
    makingOffersRef.current.delete(peerId);
    setRemoteParticipants((current) => {
      const next = current.filter((participant) => participant.id !== peerId);
      participantsRef.current = next;
      return next;
    });
  }, []);

  const flushCandidates = useCallback(
    async (peerId: string, pc: RTCPeerConnection) => {
      const candidates = pendingCandidatesRef.current.get(peerId) ?? [];
      pendingCandidatesRef.current.delete(peerId);
      for (const candidate of candidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (candidateError) {
          console.warn("Unable to add queued ICE candidate", candidateError);
        }
      }
    },
    [],
  );

  const createPeerConnection = useCallback(
    (peer: PeerInfo) => {
      const existing = peerConnectionsRef.current.get(peer.id);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: getIceServers() });
      peerConnectionsRef.current.set(peer.id, pc);
      localStreamRef.current
        ?.getTracks()
        .forEach((track) => pc.addTrack(track, localStreamRef.current!));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current?.emit("webrtc:ice-candidate", {
            to: peer.id,
            candidate: event.candidate.toJSON(),
          });
        }
      };
      pc.ontrack = (event) => {
        const stream = remoteStreamsRef.current.get(peer.id) ?? new MediaStream();
        remoteStreamsRef.current.set(peer.id, stream);
        if (!stream.getTracks().includes(event.track)) stream.addTrack(event.track);
        updateParticipant(peer, { stream });
      };
      pc.oniceconnectionstatechange = () => {
        if (
          pc.iceConnectionState === "failed" ||
          pc.iceConnectionState === "disconnected"
        ) {
          setError(
            `${peer.name} connection ${pc.iceConnectionState}. Check HTTPS, TURN, and firewall settings.`,
          );
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          setError(
            "A participant connection failed. A TURN server may be required on this network.",
          );
        }
        const connected = [...peerConnectionsRef.current.values()].filter(
          (connection) => connection.connectionState === "connected",
        ).length;
        setStatus(connected ? `${connected} participant${connected > 1 ? "s" : ""} connected` : "Connecting…");
      };
      return pc;
    },
    [updateParticipant],
  );

  const startOffer = useCallback(
    async (peer: PeerInfo) => {
      const pc = createPeerConnection(peer);
      if (makingOffersRef.current.has(peer.id)) return;
      try {
        makingOffersRef.current.add(peer.id);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current?.emit("webrtc:offer", { to: peer.id, offer });
      } catch (offerError) {
        setError(
          offerError instanceof Error
            ? offerError.message
            : "Could not start call.",
        );
      } finally {
        makingOffersRef.current.delete(peer.id);
      }
    },
    [createPeerConnection],
  );

  const setupSocket = useCallback(
    (socket: CallSocket) => {
      socket.on("room:created", ({ roomId: id }) => {
        setRoomId(id);
        setJoined(true);
        setStatus("Waiting for participants…");
      });
      socket.on("room:joined", ({ roomId: id, peers }) => {
        setRoomId(id);
        setJoined(true);
        setStatus(peers.length ? "Connecting…" : "Waiting for participants…");
        peers.forEach((peer) => updateParticipant(peer, {}));
      });
      socket.on("peer:joined", (peer) => {
        updateParticipant(peer, {});
        setStatus("Connecting…");
        void startOffer(peer);
      });
      socket.on("peer:left", ({ peerId }) => {
        removeParticipant(peerId);
        setStatus("A participant left");
      });
      socket.on("room:error", ({ message }) => setError(message));
      socket.on("webrtc:offer", async ({ from, offer }) => {
        const peer = participantsRef.current.find((item) => item.id === from) ?? {
          id: from,
          name: "Guest",
        };
        const pc = createPeerConnection(peer);
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          await flushCandidates(from, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("webrtc:answer", { to: from, answer });
        } catch (offerError) {
          setError(
            offerError instanceof Error
              ? offerError.message
              : "Could not answer call.",
          );
        }
      });
      socket.on("webrtc:answer", async ({ from, answer }) => {
        const pc = peerConnectionsRef.current.get(from);
        if (!pc) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          await flushCandidates(from, pc);
        } catch (answerError) {
          setError(
            answerError instanceof Error
              ? answerError.message
              : "Could not complete call setup.",
          );
        }
      });
      socket.on("webrtc:ice-candidate", async ({ from, candidate }) => {
        const pc = peerConnectionsRef.current.get(from);
        if (!pc || !pc.remoteDescription) {
          pendingCandidatesRef.current.set(from, [
            ...(pendingCandidatesRef.current.get(from) ?? []),
            candidate,
          ]);
          return;
        }
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (candidateError) {
          console.warn("Unable to add ICE candidate", candidateError);
        }
      });
      socket.on("chat:message", (message) =>
        setMessages((current) => [...current, message]),
      );
      socket.on("peer:media", (payload) => {
        const peer = participantsRef.current.find(
          (participant) => participant.id === payload.peerId,
        );
        if (peer) {
          updateParticipant(peer, {
            media: {
              audio: payload.audio,
              video: payload.video,
              screen: payload.screen,
            },
          });
        }
      });
    },
    [
      createPeerConnection,
      flushCandidates,
      removeParticipant,
      startOffer,
      updateParticipant,
    ],
  );

  const begin = useCallback(
    async (mode: "create" | "join") => {
      setError("");
      if (!name.trim()) {
        setError("Enter your name first.");
        return;
      }
      try {
        const stream = await getAvailableMedia();
        localStreamRef.current = stream;
        setLocalStream(stream);
        setMuted(stream.getAudioTracks().length === 0);
        setCameraOff(stream.getVideoTracks().length === 0);
        const socket: CallSocket = io(SIGNALING_URL, {
          transports: ["websocket", "polling"],
        });
        socketRef.current = socket;
        setupSocket(socket);
        socket.once("connect", () => {
          if (mode === "create") {
            socket.emit("room:create", { name: name.trim() });
          } else {
            socket.emit("room:join", {
              roomId: roomInput.trim().toUpperCase(),
              name: name.trim(),
            });
          }
        });
        socket.on("connect_error", () =>
          setError("Cannot reach signaling server. Is the server running?"),
        );
      } catch (mediaError) {
        setError(
          getMediaAccessError(
            mediaError,
            "Unable to initialize media devices. You can still join the room.",
          ),
        );
      }
    },
    [name, roomInput, setupSocket],
  );

  const emitMediaState = useCallback(() => {
    socketRef.current?.emit("peer:media", {
      audio: Boolean(localStreamRef.current?.getAudioTracks()[0]?.enabled),
      video: Boolean(localStreamRef.current?.getVideoTracks()[0]?.enabled),
      screen: Boolean(screenTrackRef.current),
    });
  }, []);

  const toggleMic = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
    emitMediaState();
  }, [emitMediaState]);

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCameraOff(!track.enabled);
    emitMediaState();
  }, [emitMediaState]);

  const toggleScreenShare = useCallback(async () => {
    if (!peerConnectionsRef.current.size) {
      setError("Wait for a participant to connect before sharing your screen.");
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("Screen sharing requires HTTPS or localhost.");
      return;
    }
    try {
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
        const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
        for (const pc of peerConnectionsRef.current.values()) {
          const sender = pc
            .getSenders()
            .find((item) => item.track?.kind === "video");
          if (sender && cameraTrack) await sender.replaceTrack(cameraTrack);
        }
        setSharing(false);
        emitMediaState();
        return;
      }
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = display.getVideoTracks()[0];
      if (!track) return;
      screenTrackRef.current = track;
      for (const pc of peerConnectionsRef.current.values()) {
        const sender = pc
          .getSenders()
          .find((item) => item.track?.kind === "video");
        if (sender) await sender.replaceTrack(track);
      }
      track.onended = () => void toggleScreenShare();
      setSharing(true);
      emitMediaState();
    } catch (screenError) {
      setError(getMediaAccessError(screenError, "Screen sharing was cancelled."));
    }
  }, [emitMediaState]);

  const leaveCall = useCallback(() => {
    socketRef.current?.emit("room:leave");
    socketRef.current?.disconnect();
    socketRef.current = null;
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    screenTrackRef.current = null;
    remoteStreamsRef.current.clear();
    pendingCandidatesRef.current.clear();
    participantsRef.current = [];
    setJoined(false);
    setRoomId("");
    setRemoteParticipants([]);
    setMessages([]);
    setMuted(false);
    setCameraOff(false);
    setSharing(false);
    setStatus("Call ended");
  }, []);

  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) setRoomInput(room.toUpperCase());
    return () => {
      socketRef.current?.disconnect();
      peerConnectionsRef.current.forEach((pc) => pc.close());
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return {
    name,
    setName,
    roomInput,
    setRoomInput,
    roomId,
    joined,
    status,
    error,
    muted,
    cameraOff,
    sharing,
    messages,
    localStream,
    remoteParticipants,
    socketId: socketRef.current?.id,
    begin,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    leaveCall,
    sendMessage: useCallback((text: string) => {
      if (text.trim()) socketRef.current?.emit("chat:message", { text: text.trim() });
    }, []),
    copyInvite: useCallback(async () => {
      const invite = `${window.location.origin}/?room=${roomId}`;
      try {
        await navigator.clipboard.writeText(invite);
        setStatus("Invite link copied");
      } catch {
        setError(`Copy this room ID: ${roomId}`);
      }
    }, [roomId]),
  };
}
