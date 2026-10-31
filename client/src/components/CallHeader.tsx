import { Copy } from "lucide-react";
import { Brand } from "./Brand";

type CallHeaderProps = {
  status: string;
  roomId: string;
  onCopyInvite: () => void;
};

export function CallHeader({
  status,
  roomId,
  onCopyInvite,
}: CallHeaderProps) {
  return (
    <header className="call-header">
      <Brand small />
      <div className="room-meta">
        <span className="live-dot" /> {status}{" "}
        <span className="room-code">ROOM {roomId}</span>
      </div>
      <button
        className="icon-button invite"
        onClick={onCopyInvite}
        title="Copy invite link"
      >
        <Copy size={17} />
        <span>Invite</span>
      </button>
      <div className="room-code-banner">
        <span>Room code</span>
        <strong>{roomId || "Loading…"}</strong>
      </div>
    </header>
  );
}
