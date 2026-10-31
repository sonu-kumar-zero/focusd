import { FormEvent } from "react";
import { Send, X } from "lucide-react";
import type { ChatMessage } from "../types";

type ChatPanelProps = {
  messages: ChatMessage[];
  chatInput: string;
  socketId?: string;
  onClose: () => void;
  onInputChange: (value: string) => void;
  onSend: (event: FormEvent) => void;
};

export function ChatPanel({
  messages,
  chatInput,
  socketId,
  onClose,
  onInputChange,
  onSend,
}: ChatPanelProps) {
  return (
    <aside className="chat-panel">
      <div className="chat-heading">
        <strong>In-call messages</strong>
        <button className="plain-icon" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="messages">
        {messages.length === 0 && (
          <p className="chat-empty">
            Messages sent here are visible to everyone in this room.
          </p>
        )}
        {messages.map((message) => (
          <div
            className={`message ${message.senderId === socketId ? "mine" : ""}`}
            key={message.id}
          >
            <span>{message.senderName}</span>
            <p>{message.text}</p>
            <time>
              {new Date(message.sentAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </div>
        ))}
      </div>
      <form className="chat-form" onSubmit={onSend}>
        <input
          value={chatInput}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder="Send a message…"
          maxLength={1000}
        />
        <button className="send-button" type="submit">
          <Send size={17} />
        </button>
      </form>
    </aside>
  );
}
