import { useEffect, useRef, useState } from "react";
import { CameraOff, MicOff, Users } from "lucide-react";
import type { RemoteParticipant } from "../hooks/useCallSession";
import { CallControls } from "./CallControls";

type VideoTileProps = {
  stream: MediaStream | null;
  muted?: boolean;
  mirrored?: boolean;
  name: string;
  audio: boolean;
  video: boolean;
  screen?: boolean;
};

function VideoTile({
  stream,
  muted = false,
  mirrored = false,
  name,
  audio,
  video,
  screen = false,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  useEffect(() => {
    if (!videoRef.current || !stream) return;
    videoRef.current.srcObject = stream;
    const play = () =>
      videoRef.current?.play().then(
        () => setPlaybackBlocked(false),
        (error: unknown) => {
          if (error instanceof DOMException && error.name === "NotAllowedError") {
            setPlaybackBlocked(true);
            return;
          }
          console.warn(`Unable to play ${name}'s media`, error);
        },
      );
    videoRef.current.onloadedmetadata = play;
    play();
    return () => {
      if (videoRef.current) videoRef.current.onloadedmetadata = null;
    };
  }, [name, stream]);

  const enablePlayback = () => {
    void videoRef.current?.play().then(() => setPlaybackBlocked(false));
  };

  return (
    <div className="video-tile">
      <video
        ref={videoRef}
        autoPlay
        muted={muted}
        playsInline
        style={mirrored ? { transform: "scaleX(-1)" } : undefined}
      />
      {!video && (
        <div className="camera-placeholder">
          <CameraOff size={34} />
          <span>Camera off</span>
        </div>
      )}
      {!stream && (
        <div className="waiting">
          <div className="avatar">
            <Users size={30} />
          </div>
          <h3>Connecting…</h3>
        </div>
      )}
      {playbackBlocked && (
        <button className="media-playback-button" onClick={enablePlayback}>
          Tap to enable audio/video
        </button>
      )}
      <div className="tile-label">
        {name} {!audio && <MicOff size={14} />}
      </div>
      {screen && <span className="sharing-tag">Screen sharing</span>}
    </div>
  );
}

type VideoStageProps = {
  localStream: MediaStream | null;
  cameraOff: boolean;
  muted: boolean;
  sharing: boolean;
  remoteParticipants: RemoteParticipant[];
  chatOpen: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onLeave: () => void;
};

export function VideoStage({
  localStream,
  cameraOff,
  muted,
  sharing,
  remoteParticipants,
  chatOpen,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onToggleChat,
  onLeave,
}: VideoStageProps) {
  return (
    <section className={`stage ${chatOpen ? "with-chat" : ""}`}>
      <div className={`video-grid participant-count-${remoteParticipants.length + 1}`}>
        <VideoTile
          stream={localStream}
          name="You"
          muted
          mirrored
          audio={!muted}
          video={!cameraOff}
          screen={sharing}
        />
        {remoteParticipants.map((participant) => (
          <VideoTile
            key={participant.id}
            stream={participant.stream}
            name={participant.name}
            audio={participant.media.audio}
            video={participant.media.video || participant.media.screen}
            screen={participant.media.screen}
          />
        ))}
      </div>
      <CallControls
        hasAudio={Boolean(localStream?.getAudioTracks().length)}
        hasVideo={Boolean(localStream?.getVideoTracks().length)}
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
