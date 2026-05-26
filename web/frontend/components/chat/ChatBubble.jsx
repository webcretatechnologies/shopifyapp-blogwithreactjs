/**
 * ChatBubble & ChatWindow — Custom in-app WebSocket chat support system.
 * Merchants can chat with support directly inside the embedded Shopify app.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Text,
  TextField,
  Button,
  Badge,
  BlockStack,
  InlineStack,
} from "@shopify/polaris";
import { io } from "socket.io-client";

let socket = null;

export default function ChatBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [shopInfo, setShopInfo] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    // Fetch shop domain for room identification
    fetch("/api/shop")
      .then((r) => r.json())
      .then((d) => {
        if (d.shop) setShopInfo(d.shop);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!shopInfo) return;

    socket = io({ path: "/chat-socket", transports: ["websocket"] });

    socket.on("connect", () => {
      setIsConnected(true);
      socket.emit("join_room", {
        room: `shop_${shopInfo.id || shopInfo.domain}`,
      });
    });

    socket.on("disconnect", () => setIsConnected(false));

    socket.on("new_message", (msg) => {
      setMessages((prev) => [...prev, msg]);
      if (!isOpen) setUnreadCount((c) => c + 1);
    });

    socket.on("history", (history) => {
      setMessages(history);
    });

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [shopInfo]);

  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      scrollToBottom();
    }
  }, [isOpen, messages]);

  const sendMessage = useCallback(() => {
    const text = inputText.trim();
    if (!text || !socket) return;

    const msg = {
      text,
      sender: "merchant",
      senderName: shopInfo?.domain || "Merchant",
      room: `shop_${shopInfo?.id || shopInfo?.domain}`,
      timestamp: new Date().toISOString(),
    };

    socket.emit("send_message", msg);
    setMessages((prev) => [...prev, msg]);
    setInputText("");
  }, [inputText, shopInfo]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Chat Window */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: "88px",
            right: "24px",
            width: "360px",
            height: "480px",
            background: "#fff",
            borderRadius: "16px",
            boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
            display: "flex",
            flexDirection: "column",
            zIndex: 9999,
            border: "1px solid #e1e3e5",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              background: "linear-gradient(135deg, #008060, #00a97c)",
              padding: "16px",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                }}
              >
                💬
              </div>
              <div>
                <div style={{ fontWeight: "700", fontSize: "15px" }}>
                  Support Chat
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    opacity: 0.85,
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: isConnected ? "#5DF08B" : "#ccc",
                    }}
                  />
                  {isConnected ? "Online" : "Connecting..."}
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                fontSize: "20px",
                lineHeight: 1,
                padding: "4px",
              }}
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              background: "#f9fafb",
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  marginTop: "40px",
                  color: "#6d7175",
                }}
              >
                <div style={{ fontSize: "36px", marginBottom: "8px" }}>👋</div>
                <div style={{ fontSize: "14px", fontWeight: "600" }}>
                  Hi there!
                </div>
                <div style={{ fontSize: "13px" }}>
                  How can we help you today?
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: "12px",
              borderTop: "1px solid #e1e3e5",
              display: "flex",
              gap: "8px",
              background: "#fff",
            }}
          >
            <input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Enter to send)"
              style={{
                flex: 1,
                padding: "10px 12px",
                border: "1px solid #c9cccf",
                borderRadius: "8px",
                fontSize: "13px",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!inputText.trim() || !isConnected}
              style={{
                padding: "10px 14px",
                background:
                  !inputText.trim() || !isConnected ? "#e1e3e5" : "#008060",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                cursor:
                  !inputText.trim() || !isConnected ? "default" : "pointer",
                fontSize: "16px",
                transition: "background 0.2s ease",
              }}
            >
              ➤
            </button>
          </div>
        </div>
      )}

      {/* Floating Bubble Button */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: isOpen
            ? "#202223"
            : "linear-gradient(135deg, #008060, #00a97c)",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "22px",
          color: "#fff",
          boxShadow: "0 4px 20px rgba(0,128,96,0.35)",
          zIndex: 9999,
          transition: "all 0.3s ease",
          transform: isOpen ? "rotate(45deg)" : "rotate(0)",
        }}
        title={isOpen ? "Close chat" : "Open support chat"}
      >
        {isOpen ? "✕" : "💬"}

        {/* Unread badge */}
        {unreadCount > 0 && !isOpen && (
          <div
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "#d82c0d",
              color: "#fff",
              fontSize: "11px",
              fontWeight: "700",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #fff",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </div>
        )}
      </button>
    </>
  );
}

function MessageBubble({ msg }) {
  const isMerchant = msg.sender === "merchant";
  const time = msg.timestamp
    ? new Date(msg.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isMerchant ? "flex-end" : "flex-start",
        marginBottom: "2px",
      }}
    >
      <div
        style={{
          maxWidth: "80%",
          padding: "8px 12px",
          borderRadius: isMerchant
            ? "14px 14px 2px 14px"
            : "14px 14px 14px 2px",
          background: isMerchant ? "#008060" : "#fff",
          color: isMerchant ? "#fff" : "#202223",
          fontSize: "13px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          border: isMerchant ? "none" : "1px solid #e1e3e5",
        }}
      >
        {!isMerchant && (
          <div
            style={{
              fontSize: "10px",
              fontWeight: "700",
              color: "#6d7175",
              marginBottom: "2px",
            }}
          >
            {msg.senderName || "Support"}
          </div>
        )}
        <div>{msg.text}</div>
        <div
          style={{
            fontSize: "10px",
            opacity: 0.65,
            marginTop: "4px",
            textAlign: isMerchant ? "right" : "left",
          }}
        >
          {time}
        </div>
      </div>
    </div>
  );
}
