import { FormEvent, useState } from "react";
import { CallHeader } from "./components/CallHeader";
import { ChatPanel } from "./components/ChatPanel";
import { LandingPage } from "./components/LandingPage";
import { VideoStage } from "./components/VideoStage";
import { useCallSession } from "./hooks/useCallSession";

export default function App() {
  const session = useCallSession();
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    session.sendMessage(chatInput);
    setChatInput("");
  };

  if (!session.joined) {
    return (
      <LandingPage
        name={session.name}
        roomInput={session.roomInput}
        error={session.error}
        onNameChange={session.setName}
        onRoomChange={session.setRoomInput}
        onCreate={() => void session.begin("create")}
        onJoin={() => void session.begin("join")}
      />
    );
  }

  return (
    <main className="call-page">
      <CallHeader
        status={session.status}
        roomId={session.roomId}
        onCopyInvite={() => void session.copyInvite()}
      />
      <VideoStage
        localStream={session.localStream}
        cameraOff={session.cameraOff}
        muted={session.muted}
        sharing={session.sharing}
        remoteParticipants={session.remoteParticipants}
        chatOpen={chatOpen}
        onToggleMic={session.toggleMic}
        onToggleCamera={session.toggleCamera}
        onToggleScreenShare={() => void session.toggleScreenShare()}
        onToggleChat={() => setChatOpen((open) => !open)}
        onLeave={session.leaveCall}
      />
      {chatOpen && (
        <ChatPanel
          messages={session.messages}
          chatInput={chatInput}
          socketId={session.socketId}
          onClose={() => setChatOpen(false)}
          onInputChange={setChatInput}
          onSend={sendMessage}
        />
      )}
    </main>
  );
}
