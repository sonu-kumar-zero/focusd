import { RefObject, useEffect } from "react";
import { CameraOff, MicOff, Users } from "lucide-react";
import type { PeerInfo } from "../types";
import { CallControls } from "./CallControls";

type RemoteMedia = {
  audio: boolean;
  video: boolean;
  screen: boolean;
};

type VideoStageProps = {
  localVideoRef: RefObject<HTMLVideoElement>;
  remoteVideoRef: RefObject<HTMLVideoElement>;
  localStream: MediaStream | null;
  cameraOff: boolean;
  muted: boolean;
  sharing: boolean;
  remotePeer: PeerInfo | null;
  remoteMedia: RemoteMedia;
  chatOpen: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onLeave: () => void;
};

export function VideoStage({
  localVideoRef,
  remoteVideoRef,
  localStream,
  cameraOff,
  muted,
  sharing,
  remotePeer,
  remoteMedia,
  chatOpen,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onToggleChat,
  onLeave,
}: VideoStageProps) {
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      void localVideoRef.current.play().catch(() => undefined);
    }
  }, [localStream, localVideoRef]);

  return (
    <section className={`stage ${chatOpen ? "with-chat" : ""}`}>
      <div className="video-grid">
        <div className="video-tile local-tile">
          <video ref={localVideoRef} autoPlay muted playsInline />
          {cameraOff && (
            <div className="camera-placeholder">
              <CameraOff size={34} />
              <span>Camera off</span>
            </div>
          )}
          <div className="tile-label">
            <span className="self-dot" /> You {muted && <MicOff size={14} />}
          </div>
          {sharing && <span className="sharing-tag">Sharing screen</span>}
        </div>
        <div className="video-tile remote-tile">
          <video ref={remoteVideoRef} autoPlay playsInline />
          {!remotePeer && (
            <div className="waiting">
              <div className="avatar">
                <Users size={30} />
              </div>
              <h3>Waiting for someone…</h3>
              <p>Share the invite link to bring someone in.</p>
            </div>
          )}
          {remotePeer && !remoteMedia.video && !remoteMedia.screen && (
            <div className="camera-placeholder">
              <CameraOff size={34} />
              <span>Camera off</span>
            </div>
          )}
          <div className="tile-label">
            {remotePeer?.name ?? "Guest"}{" "}
            {!remoteMedia.audio && <MicOff size={14} />}
          </div>
          {remoteMedia.screen && (
            <span className="sharing-tag">Screen sharing</span>
          )}
        </div>
      </div>
      <CallControls
        muted={muted}
        cameraOff={cameraOff}
        sharing={sharing}
        chatOpen={chatOpen}
        onToggleMic={onToggleMic}
        onToggleCamera={onToggleCamera}
        onToggleScreenShare={onToggleScreenShare}
        onToggleChat={onToggleChat}
        onLeave={onLeave}
      />
    </section>
  );
}
