import {
  ActionPanel,
  Action,
  getPreferenceValues,
  Icon,
  openCommandPreferences,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { useState } from "react";
import { TextDecoderStream } from "node:stream/web";
import crypto from "crypto";

type Preferences = {
  chatGPTToken: string;
};

type Message = {
  sent: string;
  received: string;
  receivedId: string;
};

export default function Command() {
  const { chatGPTToken } = getPreferenceValues<Preferences>();

  const [messageValue, setMessageValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Record<string, Message>>({});
  const [conversationId, setConversationId] = useState<string | null>();
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>();

  const sendMessage = async () => {
    setIsLoading(true);
    const messageId = crypto.randomUUID();
    const allMessages = Object.entries(messages);
    const previousMessageId = allMessages.length
      ? allMessages[allMessages.length - 1][1].receivedId
      : crypto.randomUUID();

    const response = await fetch("https://chat.openai.com/backend-api/conversation", {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        "accept-language": "en-US,en;q=0.9",
        authorization: `Bearer ${chatGPTToken}`,
        "content-type": "application/json",
      },
      referrer: "https://chat.openai.com/chat",
      referrerPolicy: "strict-origin-when-cross-origin",
      body: JSON.stringify({
        action: "next",
        messages: [
          {
            id: messageId,
            role: "user",
            content: { content_type: "text", parts: [messageValue] },
          },
        ],
        ...(conversationId ? { conversation_id: conversationId } : {}),
        parent_message_id: previousMessageId,
        model: "text-davinci-002-render",
      }),
      mode: "cors",
      credentials: "include",
    });
    const stream = response.body;
    const textStream = stream?.pipeThrough(new TextDecoderStream());
    setIsLoading(false);
    setSelectedItemId(messageId);

    // @ts-ignore
    for await (const chunk of textStream) {
      try {
        const chunkData = JSON.parse(chunk.replace("data: ", ""));
        if (chunkData?.detail?.code === "token_expired") {
          showToast({
            style: Toast.Style.Failure,
            title: "Token expired",
            message: "Please update the token in the extension preferences",
          });
        } else if (chunkData?.detail) {
          showToast({
            style: Toast.Style.Failure,
            title: "Error",
            message: chunkData.detail,
          });
        }

        if (!conversationId) {
          setConversationId(chunkData.conversation_id);
        }

        setMessages({
          ...messages,
          [messageId]: {
            sent: messageValue,
            received: chunkData.message.content.parts[0],
            receivedId: chunkData.message.id,
          },
        });
      } catch (error) {}
    }

    setMessageValue("");
  };

  const resetConversation = () => {
    setConversationId(null);
    setMessages({});
    setSelectedItemId(undefined);
  };

  return (
    <List
      searchBarPlaceholder="Enter message..."
      searchText={messageValue}
      onSearchTextChange={setMessageValue}
      isLoading={isLoading}
      selectedItemId={selectedItemId}
      actions={
        <ActionPanel>
          <Action title="Send" icon={Icon.Message} onAction={sendMessage} />
          <Action title="Change ChatGPT Token" icon={Icon.Gear} onAction={() => openCommandPreferences()} />
        </ActionPanel>
      }
      isShowingDetail={true}
    >
      {Object.entries(messages).length ? (
        Object.entries(messages).map(([messageId, message]) => (
          <List.Item
            key={messageId}
            id={messageId}
            title={message.sent}
            detail={<List.Item.Detail markdown={`**You:**\n${message.sent}\n\n**ChatGPT:**\n${message.received}`} />}
            actions={
              <ActionPanel>
                <Action title="Send" icon={Icon.Message} onAction={sendMessage} />
                <Action title="Reset Conversation" icon={Icon.Repeat} onAction={resetConversation} />
                <Action title="Change ChatGPT Token" icon={Icon.Gear} onAction={() => openCommandPreferences()} />
              </ActionPanel>
            }
          />
        ))
      ) : (
        <List.EmptyView icon={Icon.Message} title="No messages" />
      )}
    </List>
  );
}
