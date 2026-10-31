import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type {
  ChatMessage,
  ClientToServerEvents,
  PeerInfo,
  ServerToClientEvents,
} from "./types";
import { CallHeader } from "./components/CallHeader";
import { ChatPanel } from "./components/ChatPanel";
import { LandingPage } from "./components/LandingPage";
import { VideoStage } from "./components/VideoStage";

type CallSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
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
    if (error.name === "NotFoundError") {
      return "No camera or microphone was found.";
    }
  }
  return error instanceof Error ? error.message : fallback;
}

export default function App() {
  const [name, setName] = useState("Guest");
  const [roomInput, setRoomInput] = useState("");
  const [roomId, setRoomId] = useState("");
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState("Ready to connect");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [remotePeer, setRemotePeer] = useState<PeerInfo | null>(null);
  const [remoteMedia, setRemoteMedia] = useState({
    audio: true,
    video: true,
    screen: false,
  });

  const socketRef = useRef<CallSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const makingOfferRef = useRef(false);

  const emitMediaState = useCallback(() => {
    socketRef.current?.emit("peer:media", {
      audio: !(localStreamRef.current?.getAudioTracks()[0]?.enabled === false),
      video: !(localStreamRef.current?.getVideoTracks()[0]?.enabled === false),
      screen: Boolean(screenTrackRef.current),
    });
  }, []);

  const createPeerConnection = useCallback((peerId: string) => {
    if (peerRef.current) return peerRef.current;
    const pc = new RTCPeerConnection({ iceServers: getIceServers() });
    peerRef.current = pc;

    const local = localStreamRef.current;
    if (local) local.getTracks().forEach((track) => pc.addTrack(track, local));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("webrtc:ice-candidate", {
          to: peerId,
          candidate: event.candidate.toJSON(),
        });
      }
    };
    pc.ontrack = (event) => {
      const stream =
        event.streams[0] ??
        remoteStreamRef.current ??
        new MediaStream();
      remoteStreamRef.current = stream;
      if (!stream.getTracks().includes(event.track)) {
        stream.addTrack(event.track);
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
        void remoteVideoRef.current.play().catch(() => undefined);
      }
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      setStatus(state === "connected" ? "Connected" : `Connection ${state}`);
      if (state === "failed")
        setError(
          "Connection failed. A TURN server may be required on this network.",
        );
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "disconnected") setStatus("Reconnecting…");
    };
    return pc;
  }, []);

  const flushCandidates = useCallback(async (pc: RTCPeerConnection) => {
    const candidates = pendingCandidatesRef.current.splice(0);
    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn("Unable to add queued ICE candidate", err);
      }
    }
  }, []);

  const startOffer = useCallback(
    async (peerId: string) => {
      const pc = createPeerConnection(peerId);
      if (makingOfferRef.current) return;
      try {
        makingOfferRef.current = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current?.emit("webrtc:offer", { to: peerId, offer });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not start call.");
      } finally {
        makingOfferRef.current = false;
      }
    },
    [createPeerConnection],
  );

  const setupSocket = useCallback(
    (socket: CallSocket) => {
      socket.on("room:created", ({ roomId: id }) => {
        setRoomId(id);
        setJoined(true);
        setStatus("Waiting for the other person…");
      });
      socket.on("room:joined", ({ roomId: id, peers }) => {
        setRoomId(id);
        setJoined(true);
        setStatus(
          peers.length ? "Connecting…" : "Waiting for the other person…",
        );
        if (peers[0]) {
          setRemotePeer(peers[0]);
        }
      });
      socket.on("peer:joined", (peer) => {
        setRemotePeer(peer);
        setStatus("Other person joined — connecting…");
        void startOffer(peer.id);
      });
      socket.on("peer:left", ({ peerId }) => {
        setRemotePeer((current) => (current?.id === peerId ? null : current));
        setStatus("The other person left");
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        remoteStreamRef.current = null;
        peerRef.current?.close();
        peerRef.current = null;
        pendingCandidatesRef.current = [];
      });
      socket.on("room:error", ({ message }) => setError(message));
      socket.on("webrtc:offer", async ({ from, offer }) => {
        const pc = createPeerConnection(from);
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          await flushCandidates(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("webrtc:answer", { to: from, answer });
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Could not answer call.",
          );
        }
      });
      socket.on("webrtc:answer", async ({ answer }) => {
        const pc = peerRef.current;
        if (!pc) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          await flushCandidates(pc);
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not complete call setup.",
          );
        }
      });
      socket.on("webrtc:ice-candidate", async ({ candidate }) => {
        const pc = peerRef.current;
        if (!pc || !pc.remoteDescription) {
          pendingCandidatesRef.current.push(candidate);
          return;
        }
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn("Unable to add ICE candidate", err);
        }
      });
      socket.on("chat:message", (message) =>
        setMessages((current) => [...current, message]),
      );
      socket.on("peer:media", (payload) =>
        setRemoteMedia({
          audio: payload.audio,
          video: payload.video,
          screen: payload.screen,
        }),
      );
    },
    [createPeerConnection, flushCandidates, startOffer],
  );

  const begin = async (mode: "create" | "join") => {
    setError("");
    if (!name.trim()) {
      setError("Enter your name first.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        window.isSecureContext
          ? "Camera and microphone access is not supported by this browser."
          : "Camera and microphone require a secure connection. Open this app at http://localhost:5173 or configure HTTPS.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });

      console.log({ stream });

      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const socket: CallSocket = io(SIGNALING_URL, {
        transports: ["websocket", "polling"],
      });
      socketRef.current = socket;
      setupSocket(socket);
      socket.once("connect", () => {
        if (mode === "create")
          socket.emit("room:create", { name: name.trim() });
        else
          socket.emit("room:join", {
            roomId: roomInput.trim().toUpperCase(),
            name: name.trim(),
          });
      });
      socket.on("connect_error", () =>
        setError("Cannot reach signaling server. Is the server running?"),
      );
    } catch (err) {
      setError(
        getMediaAccessError(
          err,
          "Camera and microphone permission is required.",
        ),
      );
    }
  };

  const toggleMic = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
    emitMediaState();
  };

  const toggleCamera = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCameraOff(!track.enabled);
    emitMediaState();
  };

  const toggleScreenShare = async () => {
    const pc = peerRef.current;
    if (!pc) {
      setError(
        "Wait for the other participant to connect before sharing your screen.",
      );
      return;
    }
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
      const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
      const sender = pc
        .getSenders()
        .find((item) => item.track?.kind === "video");
      if (sender && cameraTrack) await sender.replaceTrack(cameraTrack);
      setSharing(false);
      emitMediaState();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError(
        window.isSecureContext
          ? "Screen sharing is not supported by this browser."
          : "Screen sharing requires a secure connection. Open this app over HTTPS or localhost.",
      );
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      const track = display.getVideoTracks()[0];
      if (!track) return;
      screenTrackRef.current = track;
      const sender = pc
        .getSenders()
        .find((item) => item.track?.kind === "video");
      if (sender) await sender.replaceTrack(track);
      track.onended = () => {
        void toggleScreenShare();
      };
      setSharing(true);
      emitMediaState();
    } catch (err) {
      setError(getMediaAccessError(err, "Screen sharing was cancelled."));
    }
  };

  const leaveCall = () => {
    socketRef.current?.emit("room:leave");
    socketRef.current?.disconnect();
    socketRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    screenTrackRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setJoined(false);
    setRoomId("");
    setRemotePeer(null);
    setMessages([]);
    setMuted(false);
    setCameraOff(false);
    setSharing(false);
    setStatus("Call ended");
    setChatOpen(false);
  };

  useEffect(
    () => () => {
      socketRef.current?.disconnect();
      peerRef.current?.close();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const copyInvite = async () => {
    const invite = `${window.location.origin}/?room=${roomId}`;
    try {
      await navigator.clipboard.writeText(invite);
      setStatus("Invite link copied");
    } catch {
      setError(`Copy this room ID: ${roomId}`);
    }
  };

  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) setRoomInput(room.toUpperCase());
  }, []);

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    socketRef.current?.emit("chat:message", { text });
    setChatInput("");
  };

  if (!joined) {
    return (
      <LandingPage
        name={name}
        roomInput={roomInput}
        error={error}
        onNameChange={setName}
        onRoomChange={setRoomInput}
        onCreate={() => void begin("create")}
        onJoin={() => void begin("join")}
      />
    );
  }

  return (
    <main className="call-page">
      <CallHeader
        status={status}
        roomId={roomId}
        onCopyInvite={() => void copyInvite()}
      />
      <VideoStage
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        localStream={localStreamRef.current}
        cameraOff={cameraOff}
        muted={muted}
        sharing={sharing}
        remotePeer={remotePeer}
        remoteMedia={remoteMedia}
        chatOpen={chatOpen}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onToggleScreenShare={() => void toggleScreenShare()}
        onToggleChat={() => setChatOpen((open) => !open)}
        onLeave={leaveCall}
      />
      {chatOpen && (
        <ChatPanel
          messages={messages}
          chatInput={chatInput}
          socketId={socketRef.current?.id}
          onClose={() => setChatOpen(false)}
          onInputChange={setChatInput}
          onSend={sendMessage}
        />
      )}
    </main>
  );
}
