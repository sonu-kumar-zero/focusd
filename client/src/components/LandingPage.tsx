import { Video } from "lucide-react";

type LandingPageProps = {
  name: string;
  roomInput: string;
  error: string;
  onNameChange: (name: string) => void;
  onRoomChange: (room: string) => void;
  onCreate: () => void;
  onJoin: () => void;
};

export function LandingPage({
  name,
  roomInput,
  error,
  onNameChange,
  onRoomChange,
  onCreate,
  onJoin,
}: LandingPageProps) {
  return (
    <main className="landing">
      <div className="brand">
        <div className="brand-icon">
          <Video size={22} />
        </div>
        <span>
          meet<span className="brand-dot">.</span>
        </span>
      </div>
      <section className="join-card">
        <div className="eyebrow">PRIVATE VIDEO CALLS</div>
        <h1>
          Face-to-face,
          <br />
          <span>from anywhere.</span>
        </h1>
        <p className="muted">
          A simple, private video room for up to ten participants.
        </p>
        <label>Your name</label>
        <input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Enter your name"
          maxLength={40}
        />
        <button className="primary full" onClick={onCreate}>
          <Video size={18} /> Create a new call
        </button>
        <div className="or">
          <span />
          OR
          <span />
        </div>
        <label>Have a room code?</label>
        <div className="join-row">
          <input
            value={roomInput}
            onChange={(event) => onRoomChange(event.target.value.toUpperCase())}
            placeholder="ENTER ROOM CODE"
            maxLength={8}
          />
          <button
            className="secondary"
            disabled={!roomInput.trim()}
            onClick={onJoin}
          >
            Join
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        <p className="fine-print">
          By continuing, your browser will ask for camera and microphone
          access.
        </p>
      </section>
      <footer>Built with WebRTC · Audio and video are routed through an SFU</footer>
    </main>
  );
}
