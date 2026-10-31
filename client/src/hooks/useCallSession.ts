import { useCallback, useEffect, useRef, useState } from "react";
import { Device } from "mediasoup-client";
import type { Consumer, Producer, Transport } from "mediasoup-client/types";
import { io, Socket } from "socket.io-client";
import type { ChatMessage, ClientToServerEvents, PeerInfo, ServerToClientEvents } from "../types";

type CallSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type MediaState = { audio: boolean; video: boolean; screen: boolean };
export type RemoteParticipant = PeerInfo & { stream: MediaStream | null; media: MediaState };
const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || "http://localhost:4000";

function getMediaAccessError(error: unknown, fallback: string): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") return "Camera and microphone access was denied. Allow access in your browser and try again.";
    if (error.name === "NotFoundError") return "No camera or microphone was found.";
  }
  return error instanceof Error ? error.message : fallback;
}
async function getAvailableMedia(): Promise<MediaStream> {
  const stream = new MediaStream();
  if (!navigator.mediaDevices?.getUserMedia) return stream;
  try { (await navigator.mediaDevices.getUserMedia({ audio: true, video: false })).getTracks().forEach((track) => stream.addTrack(track)); } catch { /* Audio is optional. */ }
  try { (await navigator.mediaDevices.getUserMedia({ audio: false, video: true })).getTracks().forEach((track) => stream.addTrack(track)); } catch { /* Video is optional. */ }
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
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const socketRef = useRef<CallSocket | null>(null);
  const selfIdRef = useRef("");
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<Transport | null>(null);
  const recvTransportRef = useRef<Transport | null>(null);
  const audioProducerRef = useRef<Producer | null>(null);
  const videoProducerRef = useRef<Producer | null>(null);
  const consumersRef = useRef(new Map<string, Consumer>());
  const producerStreamsRef = useRef(new Map<string, { peerId: string; stream: MediaStream }>());
  const participantsRef = useRef<RemoteParticipant[]>([]);

  const updateParticipant = useCallback((peer: PeerInfo, updates: Partial<RemoteParticipant>) => {
    setRemoteParticipants((current) => {
      const existing = current.find((item) => item.id === peer.id);
      const next = { ...peer, stream: null, media: { audio: true, video: true, screen: false }, ...existing, ...updates };
      const nextParticipants = existing ? current.map((item) => item.id === peer.id ? next : item) : [...current, next];
      participantsRef.current = nextParticipants;
      return nextParticipants;
    });
  }, []);

  const removeProducer = useCallback((producerId: string) => {
    const consumer = consumersRef.current.get(producerId);
    const streamInfo = producerStreamsRef.current.get(producerId);
    if (consumer && streamInfo) streamInfo.stream.removeTrack(consumer.track);
    consumer?.close();
    consumersRef.current.delete(producerId);
    producerStreamsRef.current.delete(producerId);
    if (streamInfo) {
      const participant = participantsRef.current.find((item) => item.id === streamInfo.peerId);
      if (participant) updateParticipant(participant, { stream: streamInfo.stream });
    }
  }, [updateParticipant]);

  const removeParticipant = useCallback((peerId: string) => {
    [...producerStreamsRef.current.entries()].filter(([, info]) => info.peerId === peerId).forEach(([producerId]) => removeProducer(producerId));
    setRemoteParticipants((current) => {
      const next = current.filter((participant) => participant.id !== peerId);
      participantsRef.current = next;
      return next;
    });
  }, [removeProducer]);

  const consumeProducer = useCallback(async (producer: { producerId: string; peerId: string; kind: "audio" | "video"; source: "camera" | "microphone" }) => {
    const socket = socketRef.current;
    const device = deviceRef.current;
    const transport = recvTransportRef.current;
    if (!socket || !device || !transport || consumersRef.current.has(producer.producerId)) return;
    const response = await new Promise<Record<string, unknown>>((resolve) => socket.emit("sfu:consume", { transportId: transport.id, producerId: producer.producerId, rtpCapabilities: device.rtpCapabilities }, resolve));
    if (response.error) throw new Error(String(response.error));
    const consumer = await transport.consume({
      id: String(response.id),
      producerId: String(response.producerId),
      kind: response.kind as "audio" | "video",
      rtpParameters: response.rtpParameters as never,
    });
    consumersRef.current.set(producer.producerId, consumer);
    const stream = producerStreamsRef.current.get(producer.producerId)?.stream ?? new MediaStream();
    stream.addTrack(consumer.track);
    producerStreamsRef.current.set(producer.producerId, { peerId: producer.peerId, stream });
    const peer = participantsRef.current.find((item) => item.id === producer.peerId) ?? { id: producer.peerId, name: "Guest" };
    updateParticipant(peer, { stream });
    const resume = await new Promise<{ error?: string }>((resolve) => socket.emit("sfu:resume-consumer", { consumerId: consumer.id }, resolve));
    if (resume.error) throw new Error(resume.error);
  }, [updateParticipant]);

  const initializeSfu = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) return;
    const capabilities = await new Promise<Record<string, unknown>>((resolve) => socket.emit("sfu:get-router-capabilities", resolve));
    if (capabilities.error) throw new Error(String(capabilities.error));
    const device = new Device();
    await device.load({ routerRtpCapabilities: capabilities.routerRtpCapabilities as never });
    deviceRef.current = device;
    const createTransport = async (direction: "send" | "recv") => {
      const params = await new Promise<Record<string, unknown>>((resolve) => socket.emit("sfu:create-transport", { direction }, resolve));
      if (params.error) throw new Error(String(params.error));
      const transport = direction === "send" ? device.createSendTransport(params as never) : device.createRecvTransport(params as never);
      transport.on("connect", ({ dtlsParameters }, callback, errback) => {
        void new Promise<void>((resolve, reject) => socket.emit("sfu:connect-transport", { transportId: transport.id, dtlsParameters }, (result) => result.error ? reject(new Error(result.error)) : resolve()))
          .then(callback).catch(errback);
      });
      if (direction === "send") {
        transport.on("produce", ({ kind, rtpParameters, appData }, callback, errback) => {
          void new Promise<string>((resolve, reject) => socket.emit("sfu:produce", { transportId: transport.id, kind, rtpParameters, source: appData.source as "camera" | "microphone" }, (result) => result.error ? reject(new Error(result.error)) : resolve(String(result.id))))
            .then((id) => callback({ id })).catch(errback);
        });
        sendTransportRef.current = transport;
      } else recvTransportRef.current = transport;
      return transport;
    };
    const sendTransport = await createTransport("send");
    await createTransport("recv");
    const stream = localStreamRef.current;
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];
      if (audioTrack) audioProducerRef.current = await sendTransport.produce({ track: audioTrack, appData: { source: "microphone" } });
      if (videoTrack) {
        cameraTrackRef.current = videoTrack;
        videoProducerRef.current = await sendTransport.produce({ track: videoTrack, appData: { source: "camera" } });
      }
    }
    const producers = await new Promise<{ producers?: Array<{ producerId: string; peerId: string; kind: "audio" | "video"; source: "camera" | "microphone" }>; error?: string }>((resolve) => socket.emit("sfu:get-producers", resolve));
    if (producers.error) throw new Error(producers.error);
    await Promise.all((producers.producers ?? []).map(consumeProducer));
    setStatus("Connected to SFU");
  }, [consumeProducer]);

  const setupSocket = useCallback((socket: CallSocket) => {
    const enter = (id: string, selfId: string, peers: PeerInfo[], message: string) => {
      selfIdRef.current = selfId;
      setRoomId(id);
      peers.forEach((peer) => updateParticipant(peer, {}));
      setJoined(true);
      setStatus(message);
      void initializeSfu().catch((sfuError) => setError(getMediaAccessError(sfuError, "Could not connect to the media server.")));
    };
    socket.on("room:created", ({ roomId: id, selfId }) => enter(id, selfId, [], "Waiting for participants…"));
    socket.on("room:joined", ({ roomId: id, selfId, peers }) => enter(id, selfId, peers, "Connecting to SFU…"));
    socket.on("peer:joined", (peer) => { updateParticipant(peer, {}); setStatus("Participant joined"); });
    socket.on("peer:left", ({ peerId }) => { removeParticipant(peerId); setStatus("A participant left"); });
    socket.on("room:error", ({ message }) => setError(message));
    socket.on("sfu:new-producer", (producer) => {
      const peer = participantsRef.current.find((item) => item.id === producer.peerId) ?? { id: producer.peerId, name: "Guest" };
      updateParticipant(peer, {});
      void consumeProducer(producer).catch((sfuError) => setError(getMediaAccessError(sfuError, "Could not receive participant media.")));
    });
    socket.on("sfu:producer-closed", ({ producerId }) => removeProducer(producerId));
    socket.on("chat:message", (message) => setMessages((current) => [...current, message]));
    socket.on("peer:media", (payload) => {
      const peer = participantsRef.current.find((participant) => participant.id === payload.peerId);
      if (peer) updateParticipant(peer, { media: { audio: payload.audio, video: payload.video, screen: payload.screen } });
    });
  }, [consumeProducer, initializeSfu, removeParticipant, removeProducer, updateParticipant]);

  const begin = useCallback(async (mode: "create" | "join") => {
    setError("");
    if (!name.trim()) { setError("Enter your name first."); return; }
    try {
      const stream = await getAvailableMedia();
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMuted(!stream.getAudioTracks().length);
      setCameraOff(!stream.getVideoTracks().length);
      const socket: CallSocket = io(SIGNALING_URL, { transports: ["websocket", "polling"] });
      socketRef.current = socket;
      setupSocket(socket);
      socket.once("connect", () => mode === "create" ? socket.emit("room:create", { name: name.trim() }) : socket.emit("room:join", { roomId: roomInput.trim().toUpperCase(), name: name.trim() }));
      socket.on("connect_error", () => setError("Cannot reach signaling server. Is the server running?"));
    } catch (mediaError) { setError(getMediaAccessError(mediaError, "Unable to initialize media devices. You can still join the room.")); }
  }, [name, roomInput, setupSocket]);

  const emitMediaState = useCallback(() => socketRef.current?.emit("peer:media", { audio: Boolean(audioProducerRef.current && !audioProducerRef.current.paused), video: Boolean(videoProducerRef.current && !videoProducerRef.current.paused), screen: Boolean(screenTrackRef.current) }), []);
  const toggleMic = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track || !audioProducerRef.current) return;
    track.enabled = !track.enabled;
    if (track.enabled) audioProducerRef.current.resume(); else audioProducerRef.current.pause();
    setMuted(!track.enabled); emitMediaState();
  }, [emitMediaState]);
  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track || !videoProducerRef.current) return;
    track.enabled = !track.enabled;
    if (track.enabled) videoProducerRef.current.resume(); else videoProducerRef.current.pause();
    setCameraOff(!track.enabled); emitMediaState();
  }, [emitMediaState]);
  const toggleScreenShare = useCallback(async () => {
    if (!videoProducerRef.current) { setError("A camera is required before sharing your screen."); return; }
    if (!navigator.mediaDevices?.getDisplayMedia) { setError("Screen sharing requires HTTPS or localhost."); return; }
    try {
      if (screenTrackRef.current) {
        screenTrackRef.current.stop(); screenTrackRef.current = null;
        if (cameraTrackRef.current) await videoProducerRef.current.replaceTrack({ track: cameraTrackRef.current });
        setSharing(false); emitMediaState(); return;
      }
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = display.getVideoTracks()[0];
      if (!track) return;
      screenTrackRef.current = track;
      await videoProducerRef.current.replaceTrack({ track });
      track.onended = () => void toggleScreenShare();
      setSharing(true); emitMediaState();
    } catch (screenError) { setError(getMediaAccessError(screenError, "Screen sharing was cancelled.")); }
  }, [emitMediaState]);

  const leaveCall = useCallback(() => {
    socketRef.current?.emit("room:leave");
    socketRef.current?.disconnect(); socketRef.current = null;
    sendTransportRef.current?.close(); recvTransportRef.current?.close();
    consumersRef.current.forEach((consumer) => consumer.close()); consumersRef.current.clear();
    audioProducerRef.current?.close(); videoProducerRef.current?.close();
    sendTransportRef.current = null; recvTransportRef.current = null; deviceRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null; setLocalStream(null); screenTrackRef.current = null; cameraTrackRef.current = null;
    producerStreamsRef.current.clear(); participantsRef.current = []; setJoined(false); setRoomId(""); setRemoteParticipants([]); setMessages([]); setMuted(false); setCameraOff(false); setSharing(false); setStatus("Call ended");
  }, []);
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) setRoomInput(room.toUpperCase());
    return () => { socketRef.current?.disconnect(); sendTransportRef.current?.close(); recvTransportRef.current?.close(); localStreamRef.current?.getTracks().forEach((track) => track.stop()); };
  }, []);
  return {
    name, setName, roomInput, setRoomInput, roomId, joined, status, error, muted, cameraOff, sharing, messages, localStream, remoteParticipants,
    socketId: socketRef.current?.id, begin, toggleMic, toggleCamera, toggleScreenShare, leaveCall,
    sendMessage: useCallback((text: string) => { if (text.trim()) socketRef.current?.emit("chat:message", { text: text.trim() }); }, []),
    copyInvite: useCallback(async () => { const invite = `${window.location.origin}/?room=${roomId}`; try { await navigator.clipboard.writeText(invite); setStatus("Invite link copied"); } catch { setError(`Copy this room ID: ${roomId}`); } }, [roomId]),
  };
}
