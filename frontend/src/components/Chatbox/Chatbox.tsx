import React, { useEffect, useState } from "react";
import io from "socket.io-client";
import "./Chatbox.scss";
import FastForwardIcon from "../../assets/fast_forward_icon.svg";
import { useChatStore } from "../../store/useChatStore";
import { getUsernameColor } from "../../utils/getUsernameColor";

const socket = io("http://localhost:4000", {
  withCredentials: true,
  transports: ["websocket"],
});

interface ChatboxProps {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const Chatbox: React.FC<ChatboxProps> = ({ isOpen, setIsOpen }) => {
  const { channelId, userId, setUserId, messages, setMessages, addMessage } = useChatStore();
  const [message, setMessage] = useState("");

  // Load user id once
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    fetch("http://localhost:4000/api/profile", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => data?.id && setUserId(data.id))
      .catch((e) => console.error("Error fetching user ID:", e));
  }, [setUserId]);

  // Join room + wire listeners
  useEffect(() => {
    if (!channelId) return;

    socket.emit("joinRoom", { channelId });

    const onHistory = (chatHistory: any[]) => {
      const formatted = chatHistory.map((msg) => ({
        user: msg.username || "Unknown",
        content: msg.content,
        created_at: msg.created_at,
      }));
      setMessages(formatted);
    };

    const onReceive = (newMsg: { user: string; content: string; created_at?: string }) => {
      addMessage({
        user: newMsg.user,
        content: newMsg.content,
        created_at: newMsg.created_at ?? new Date().toISOString(),
      });
    };

    // prevent duplicate handlers (hot reload / StrictMode)
    socket.off("chatHistory").off("receiveMessage");
    socket.on("chatHistory", onHistory);
    socket.on("receiveMessage", onReceive);

    return () => {
      socket.off("chatHistory", onHistory);
      socket.off("receiveMessage", onReceive);
    };
  }, [channelId, setMessages, addMessage]);

  const sendMessage = () => {
    const text = message.trim();
    if (!userId || !channelId || !text) return;
    socket.emit("sendMessage", { userId, message: text, channelId });
    setMessage("");
  };

  return (
    <div className={`chatbox-container ${isOpen ? "open" : ""}`}>
      <button
        className={`toggle-button-right ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <img src={FastForwardIcon} alt="Toggle Chat" />
      </button>

      <div className={`chatbox-content ${isOpen ? "open" : ""}`}>
        <h3>Live Chat</h3>

        <div className="messages">
          {messages.map((msg, index) => (
            <p key={index}>
              <strong style={{ color: getUsernameColor(msg.user) }}>{msg.user}:</strong>{" "}
              {msg.content}
            </p>
          ))}
        </div>

        <input
          type="text"
          placeholder="Type a message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <button className="chat-button" onClick={sendMessage}>
          Send
        </button>
      </div>
    </div>
  );
};

export default Chatbox;
