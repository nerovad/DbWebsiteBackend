import React, { useEffect, useState, useRef } from "react";
import "./Messages.scss";
import { useApi } from "../../utils/useApi";

type Message = {
  id: string;
  senderId: string;
  senderHandle: string;
  senderAvatar?: string;
  receiverId: string;
  content: string;
  createdAt: string;
  expiresAt: string;
  read: boolean;
};

type Conversation = {
  userId: string;
  userHandle: string;
  userAvatar?: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
};

const Messages: React.FC = () => {
  const api = useApi();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();

    // Set up polling to check for new messages and expired messages
    const interval = setInterval(() => {
      loadConversations();
      if (selectedUserId) {
        loadMessages(selectedUserId);
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [selectedUserId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversations = async () => {
    try {
      const data = await api.get("/api/messages/conversations", []);
      setConversations(data);
    } catch (error) {
      console.error("Failed to load conversations:", error);
    }
  };

  const loadMessages = async (userId: string) => {
    setLoading(true);
    try {
      const data = await api.get(`/api/messages/${userId}`, []);
      setMessages(data);

      // Mark messages as read
      await api.post(`/api/messages/${userId}/read`, {});
    } catch (error) {
      console.error("Failed to load messages:", error);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedUserId || sending) return;

    setSending(true);
    try {
      const message = await api.post("/api/messages/send", {
        receiverId: selectedUserId,
        content: newMessage.trim(),
      });

      setMessages((prev) => [...prev, message]);
      setNewMessage("");
      loadConversations(); // Refresh conversation list
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTimeRemaining = (expiresAt: string) => {
    const now = new Date().getTime();
    const expiry = new Date(expiresAt).getTime();
    const remaining = expiry - now;

    if (remaining <= 0) return "Expired";

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    return date.toLocaleDateString();
  };

  const selectedConversation = conversations.find(
    (c) => c.userId === selectedUserId
  );

  return (
    <div className="messages-container">
      <div className="conversations-panel">
        <div className="panel-header">
          <h3>Messages</h3>
          <span className="info-text">Disappear in 24h</span>
        </div>

        {conversations.length === 0 ? (
          <div className="empty-state">
            <p>No conversations yet</p>
            <span>Start messaging other users!</span>
          </div>
        ) : (
          <div className="conversations-list">
            {conversations.map((conv) => (
              <button
                key={conv.userId}
                className={`conversation-item ${selectedUserId === conv.userId ? "active" : ""
                  }`}
                onClick={() => {
                  setSelectedUserId(conv.userId);
                  loadMessages(conv.userId);
                }}
              >
                <div className="avatar">
                  {conv.userAvatar ? (
                    <img src={conv.userAvatar} alt={conv.userHandle} />
                  ) : (
                    <div className="avatar-placeholder">
                      {conv.userHandle[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="conversation-info">
                  <div className="conversation-header">
                    <span className="user-handle">{conv.userHandle}</span>
                    <span className="time">{formatMessageTime(conv.lastMessageTime)}</span>
                  </div>
                  <div className="last-message">
                    {conv.lastMessage}
                  </div>
                </div>
                {conv.unreadCount > 0 && (
                  <div className="unread-badge">{conv.unreadCount}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="messages-panel">
        {!selectedUserId ? (
          <div className="no-selection">
            <p>Select a conversation to view messages</p>
          </div>
        ) : (
          <>
            <div className="messages-header">
              <div className="header-user">
                <div className="avatar">
                  {selectedConversation?.userAvatar ? (
                    <img src={selectedConversation.userAvatar} alt="" />
                  ) : (
                    <div className="avatar-placeholder">
                      {selectedConversation?.userHandle[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="user-handle">
                  {selectedConversation?.userHandle}
                </span>
              </div>
            </div>

            <div className="messages-list">
              {loading ? (
                <div className="loading">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="empty-messages">
                  <p>No messages yet</p>
                  <span>Send the first message!</span>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`message ${msg.senderId === "me" ? "sent" : "received"
                      }`}
                  >
                    <div className="message-content">{msg.content}</div>
                    <div className="message-meta">
                      <span className="time">{formatMessageTime(msg.createdAt)}</span>
                      <span className="expires">
                        🕐 {formatTimeRemaining(msg.expiresAt)}
                      </span>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="message-input-container">
              <textarea
                className="message-input"
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                rows={1}
              />
              <button
                className="send-btn"
                onClick={sendMessage}
                disabled={!newMessage.trim() || sending}
              >
                {sending ? "..." : "Send"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Messages;
