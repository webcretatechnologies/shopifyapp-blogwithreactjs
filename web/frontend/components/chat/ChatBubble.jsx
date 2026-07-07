/**
 * ChatBubble & ChatWindow — Custom in-app WebSocket chat support system.
 * Merchants can chat with support directly inside the embedded Shopify app.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Text,
  TextField,
  Button,
  Box,
  BlockStack,
  InlineStack,
  Icon,
  Badge,
} from "@shopify/polaris";
import { ChatIcon, XIcon, SendIcon } from "@shopify/polaris-icons";
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
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            borderRadius: "16px",
            overflow: "hidden",
            boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
            border: "1px solid var(--p-color-border)",
            background: "var(--p-color-bg-surface)",
          }}
        >
          {/* Header */}
          <Box padding="400" background="bg-surface-brand">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="300" blockAlign="center">
                <Box
                  background="bg-surface"
                  borderRadius="500"
                  padding="100"
                >
                  <Icon source={ChatIcon} tone="base" />
                </Box>
                <BlockStack gap="0">
                  <Text variant="headingSm" as="h3" tone="text-inverse">
                    Support Chat
                  </Text>
                  <InlineStack gap="100" blockAlign="center">
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: isConnected ? "var(--p-color-bg-surface-success)" : "var(--p-color-bg-surface-secondary)",
                      }}
                    />
                    <Text variant="bodySm" tone="text-inverse">
                      {isConnected ? "Online" : "Connecting..."}
                    </Text>
                  </InlineStack>
                </BlockStack>
              </InlineStack>
              <Button
                variant="plain"
                icon={XIcon}
                onClick={() => setIsOpen(false)}
                accessibilityLabel="Close chat"
              />
            </InlineStack>
          </Box>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              background: "var(--p-color-bg-surface-secondary)",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {messages.length === 0 && (
              <Box padding="400">
                <BlockStack gap="200" inlineAlign="center">
                  <Text variant="heading3xl" as="div">👋</Text>
                  <Text variant="headingSm" as="h4">Hi there!</Text>
                  <Text variant="bodySm" tone="subdued">How can we help you today?</Text>
                </BlockStack>
              </Box>
            )}
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <Box padding="300" borderBlockStartWidth="025" borderColor="border">
            <InlineStack gap="200" wrap={false} blockAlign="center">
              <div style={{ flex: 1 }} onKeyDown={handleKeyDown}>
                <TextField
                  value={inputText}
                  onChange={setInputText}
                  placeholder="Type a message..."
                  autoComplete="off"
                />
              </div>
              <Button
                icon={SendIcon}
                variant="primary"
                onClick={sendMessage}
                disabled={!inputText.trim() || !isConnected}
              />
            </InlineStack>
          </Box>
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
            ? "var(--p-color-bg-surface-inverse)"
            : "var(--p-color-bg-surface-brand)",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
          zIndex: 9999,
          transition: "all 0.3s ease",
          transform: isOpen ? "rotate(45deg)" : "rotate(0)",
        }}
        title={isOpen ? "Close chat" : "Open support chat"}
      >
        <Icon source={isOpen ? XIcon : ChatIcon} tone="text-inverse" />

        {/* Unread badge */}
        {unreadCount > 0 && !isOpen && (
          <div
            style={{
              position: "absolute",
              top: -4,
              right: -4,
            }}
          >
            <Badge tone="critical">{unreadCount > 9 ? "9+" : unreadCount}</Badge>
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
    <InlineStack align={isMerchant ? "end" : "start"}>
      <Box
        padding="200"
        background={isMerchant ? "bg-surface-brand" : "bg-surface"}
        borderRadius={isMerchant ? "200" : "200"}
        borderWidth={isMerchant ? "0" : "025"}
        borderColor="border"
        shadow="100"
        maxWidth="80%"
      >
        <BlockStack gap="100">
          {!isMerchant && (
            <Text variant="bodyXs" fontWeight="bold" tone="subdued">
              {msg.senderName || "Support"}
            </Text>
          )}
          <Text variant="bodyMd" tone={isMerchant ? "text-inverse" : "base"}>
            {msg.text}
          </Text>
          <div style={{ textAlign: isMerchant ? "right" : "left" }}>
            <Text variant="bodyXs" tone={isMerchant ? "text-inverse" : "subdued"}>
              {time}
            </Text>
          </div>
        </BlockStack>
      </Box>
    </InlineStack>
  );
}
