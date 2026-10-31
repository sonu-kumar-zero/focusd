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
      <button className={`control ${muted ? "off" : ""}`} onClick={onToggleMic}>
        <span>{muted ? <MicOff /> : <Mic />}</span>
        <small>{muted ? "Unmute" : "Mute"}</small>
      </button>
      <button
        className={`control ${cameraOff ? "off" : ""}`}
        onClick={onToggleCamera}
      >
        <span>{cameraOff ? <VideoOff /> : <Camera />}</span>
        <small>{cameraOff ? "Start video" : "Stop video"}</small>
      </button>
      <button
        className={`control ${sharing ? "active" : ""}`}
        onClick={onToggleScreenShare}
      >
        <span>
          <MonitorUp />
        </span>
        <small>{sharing ? "Stop share" : "Share screen"}</small>
      </button>
      <button
        className={`control ${chatOpen ? "active" : ""}`}
        onClick={onToggleChat}
      >
        <span>
          <MessageCircle />
        </span>
        <small>Chat</small>
      </button>
      <button className="control leave" onClick={onLeave}>
        <span>
          <Phone />
        </span>
        <small>Leave</small>
      </button>
    </div>
  );
}
