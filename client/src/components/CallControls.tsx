import {
  Camera,
  MessageCircle,
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  VideoOff,
} from "lucide-react";

type CallControlsProps = {
  hasAudio: boolean;
  hasVideo: boolean;
  muted: boolean;
  cameraOff: boolean;
  sharing: boolean;
  chatOpen: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onLeave: () => void;
};

export function CallControls({
  hasAudio,
  hasVideo,
  muted,
  cameraOff,
  sharing,
  chatOpen,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onToggleChat,
  onLeave,
}: CallControlsProps) {
  return (
    <div className="controls">
      <button
        className={`control ${muted ? "off" : ""}`}
        onClick={onToggleMic}
        disabled={!hasAudio}
        aria-label={muted ? "Unmute microphone" : "Mute microphone"}
        title={hasAudio ? undefined : "No microphone available"}
      >
        <span>{muted ? <MicOff /> : <Mic />}</span>
        <small>{muted ? "Unmute" : "Mute"}</small>
      </button>
      <button
        className={`control ${cameraOff ? "off" : ""}`}
        onClick={onToggleCamera}
        disabled={!hasVideo}
        aria-label={cameraOff ? "Start camera" : "Stop camera"}
        title={hasVideo ? undefined : "No camera available"}
      >
        <span>{cameraOff ? <VideoOff /> : <Camera />}</span>
        <small>{cameraOff ? "Start video" : "Stop video"}</small>
      </button>
      <button
        className={`control ${sharing ? "active" : ""}`}
        onClick={onToggleScreenShare}
        aria-label={sharing ? "Stop screen sharing" : "Share screen"}
      >
        <span>
          <MonitorUp />
        </span>
        <small>{sharing ? "Stop share" : "Share screen"}</small>
      </button>
      <button
        className={`control ${chatOpen ? "active" : ""}`}
        onClick={onToggleChat}
        aria-label={chatOpen ? "Close chat" : "Open chat"}
      >
        <span>
          <MessageCircle />
        </span>
        <small>Chat</small>
      </button>
      <button className="control leave" onClick={onLeave} aria-label="Leave call">
        <span>
          <Phone />
        </span>
        <small>Leave</small>
      </button>
    </div>
  );
}
