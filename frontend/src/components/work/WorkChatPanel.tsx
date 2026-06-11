import React, { useEffect, useRef, useState } from 'react';
import { Send, Square } from 'lucide-react';
import { aiApi, chatApi } from '../../services/api';
import { ChatMessageList } from '../chat/ChatMessageList';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';
import type { Work, ChatMessage } from '../../types';

interface WorkChatPanelProps {
  work: Work;
  scrollToLatestOnMount?: boolean;
}

export const WorkChatPanel: React.FC<WorkChatPanelProps> = ({ work, scrollToLatestOnMount = false }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isStreamingChat, setIsStreamingChat] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [isReasoningMode, setIsReasoningMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamEventSourceRef = useRef<EventSource | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    // Only auto-scroll after user-triggered chat actions (send/regenerate/streaming).
    if (!shouldAutoScrollRef.current) {
      return;
    }
    scrollToBottom();
  }, [messages, streamingMessage]);

  useEffect(() => {
    // Jump to latest whenever this chat page is opened and messages are present.
    if (!scrollToLatestOnMount || messages.length === 0) {
      return;
    }
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    });
  }, [messages.length, scrollToLatestOnMount]);

  useEffect(() => {
    return () => {
      if (streamEventSourceRef.current) {
        streamEventSourceRef.current.close();
        streamEventSourceRef.current = null;
      }
    };
  }, []);

  const handleSendMessage = async () => {
    const message = inputMessage.trim();
    if (!message || isStreamingChat) return;

    if (!work?.id) {
      console.error('Work not available for chat');
      return;
    }

    shouldAutoScrollRef.current = true;
    setInputMessage('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    // Save user message to backend first and get real ID
    let userMessage: ChatMessage;
    try {
      const response = await chatApi.saveWorkMessage(work.id, 'user', message);
      userMessage = {
        id: response.data.id,
        role: 'user',
        content: message,
        timestamp: response.data.timestamp,
      };
    } catch (error) {
      console.error('Failed to save work chat user message:', error);
      // Fallback: use temporary ID if save fails
      userMessage = {
        id: `${Date.now()}_user`,
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };
    }
    setMessages((prev) => [...prev, userMessage]);

    try {
      if (streamEventSourceRef.current) {
        streamEventSourceRef.current.close();
        streamEventSourceRef.current = null;
      }
      setIsStreamingChat(true);
      setStreamingMessage('');

      const eventSource = aiApi.workChatStream(
        work.id,
        message,
        (chunk: string) => {
          setStreamingMessage((prev) => prev + chunk);
        },
        () => {
          console.log('Work chat streaming started');
        },
        async (fullResponse: string) => {
          setIsStreamingChat(false);
          setStreamingMessage('');
          if (streamEventSourceRef.current) {
            streamEventSourceRef.current.close();
            streamEventSourceRef.current = null;
          }

          try {
            const response = await chatApi.saveWorkMessage(work.id, 'assistant', fullResponse);
            const aiResponse: ChatMessage = {
              id: response.data.id,
              role: 'assistant',
              content: fullResponse,
              timestamp: response.data.timestamp,
            };
            setMessages((prev) => [...prev, aiResponse]);
          } catch (error) {
            console.error('Failed to save work chat AI response:', error);
            // Fallback: add with temporary ID if save fails
            const aiResponse: ChatMessage = {
              id: `${Date.now()}_ai`,
              role: 'assistant',
              content: fullResponse,
              timestamp: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, aiResponse]);
          }
        },
        (error: string) => {
          console.error('Work chat streaming error:', error);
          setIsStreamingChat(false);
          setStreamingMessage('');
          if (streamEventSourceRef.current) {
            streamEventSourceRef.current.close();
            streamEventSourceRef.current = null;
          }
          const fallback: ChatMessage = {
            id: `${Date.now()}_error`,
            role: 'assistant',
            content: 'AI暂时无法回应，请稍后重试。',
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, fallback]);
        },
        isReasoningMode
      );

      streamEventSourceRef.current = eventSource;
    } catch (error) {
      console.error('Failed to start work chat streaming:', error);
      setIsStreamingChat(false);
      if (streamEventSourceRef.current) {
        streamEventSourceRef.current.close();
        streamEventSourceRef.current = null;
      }
      const fallback: ChatMessage = {
        id: `${Date.now()}_error`,
        role: 'assistant',
        content: 'AI暂时无法回应，请稍后重试。',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, fallback]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
      inputRef.current.style.overflowY = inputRef.current.scrollHeight > 200 ? 'auto' : 'hidden';
    }
  };

  const handleStopGeneration = async () => {
    if (streamEventSourceRef.current) {
      streamEventSourceRef.current.close();
      streamEventSourceRef.current = null;
    }

    // Save whatever we have so far
    if (streamingMessage) {
      const messageContent = streamingMessage;
      setIsStreamingChat(false);
      setStreamingMessage('');

      // Save to backend and get real ID
      if (work?.id) {
        try {
          const response = await chatApi.saveWorkMessage(work.id, 'assistant', messageContent);
          const aiResponse: ChatMessage = {
            id: response.data.id,
            role: 'assistant',
            content: messageContent,
            timestamp: response.data.timestamp
          };
          setMessages(prev => [...prev, aiResponse]);
        } catch (error) {
          console.error('Failed to save stopped work message:', error);
          // Fallback: add with temporary ID if save fails
          const aiResponse: ChatMessage = {
            id: `${Date.now()}_ai`,
            role: 'assistant',
            content: messageContent,
            timestamp: new Date().toISOString()
          };
          setMessages(prev => [...prev, aiResponse]);
        }
      }
    } else {
      setIsStreamingChat(false);
      setStreamingMessage('');
    }
  };

  const handleClearChat = async () => {
    if (!confirm('确定要清空聊天记录吗？')) return;
    if (!work?.id) return;

    try {
      await chatApi.clearWorkHistory(work.id);
      setMessages([]);
    } catch (error) {
      console.error('Failed to clear work chat history:', error);
      setMessages([]);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('确定要删除此消息及之后的所有消息吗？')) return;

    if (!work?.id) return;

    try {
      await chatApi.deleteWorkMessage(work.id, messageId);

      // Remove the message and all subsequent messages from local state
      const messageIndex = messages.findIndex(m => m.id === messageId);
      if (messageIndex !== -1) {
        setMessages(prev => prev.slice(0, messageIndex));
      }
    } catch (error) {
      console.error('Failed to delete work message:', error);
    }
  };

  const handleRegenerateMessage = async (messageId: string) => {
    if (!work?.id) return;

    // Find the message to regenerate
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1 || messageIndex === 0) return;

    // Get the previous user message
    const previousMessage = messages[messageIndex - 1];
    if (previousMessage.role !== 'user') return;

    try {
      shouldAutoScrollRef.current = true;
      // Delete this AI message and all subsequent messages
      await chatApi.deleteWorkMessage(work.id, messageId);

      // Remove from local state
      setMessages(prev => prev.slice(0, messageIndex));

      // Resend the previous user message to trigger new AI response
      const userMessageContent = previousMessage.content;

      if (streamEventSourceRef.current) {
        streamEventSourceRef.current.close();
        streamEventSourceRef.current = null;
      }
      setIsStreamingChat(true);
      setStreamingMessage('');

      const eventSource = aiApi.workChatStream(
        work.id,
        userMessageContent,
        (chunk: string) => {
          setStreamingMessage((prev) => prev + chunk);
        },
        () => {
          console.log('Regenerate work chat streaming started');
        },
        async (fullResponse: string) => {
          setIsStreamingChat(false);
          setStreamingMessage('');
          if (streamEventSourceRef.current) {
            streamEventSourceRef.current.close();
            streamEventSourceRef.current = null;
          }

          try {
            const response = await chatApi.saveWorkMessage(work.id, 'assistant', fullResponse);
            const aiResponse: ChatMessage = {
              id: response.data.id,
              role: 'assistant',
              content: fullResponse,
              timestamp: response.data.timestamp,
            };
            setMessages((prev) => [...prev, aiResponse]);
          } catch (error) {
            console.error('Failed to save regenerated work response:', error);
            // Fallback: add with temporary ID if save fails
            const aiResponse: ChatMessage = {
              id: `${Date.now()}_ai`,
              role: 'assistant',
              content: fullResponse,
              timestamp: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, aiResponse]);
          }
        },
        (error: string) => {
          console.error('Regenerate work chat streaming error:', error);
          setIsStreamingChat(false);
          setStreamingMessage('');
          if (streamEventSourceRef.current) {
            streamEventSourceRef.current.close();
            streamEventSourceRef.current = null;
          }
        },
        isReasoningMode
      );

      streamEventSourceRef.current = eventSource;
    } catch (error) {
      console.error('Failed to regenerate work message:', error);
    }
  };

  useEffect(() => {
    const loadHistory = async () => {
      if (!work?.id) return;

      try {
        const response = await chatApi.getWorkHistory(work.id);
        const history = response.data.messages;

        if (history.length > 0) {
          setMessages(history);
        } else {
          const greetingContent = `你好！我是你的作品顾问。我已阅读《${work.title}》的大纲、世界观与章节摘要，可以与你讨论整体故事节奏、角色弧光或未来剧情方向。你想先聊哪一部分？`;

          try {
            const response = await chatApi.saveWorkMessage(work.id, 'assistant', greetingContent);
            const greeting: ChatMessage = {
              id: response.data.id,
              role: 'assistant',
              content: greetingContent,
              timestamp: response.data.timestamp,
            };
            setMessages([greeting]);
          } catch (error) {
            console.error('Failed to save work greeting:', error);
            // Fallback: show greeting with temporary ID if save fails
            const greeting: ChatMessage = {
              id: 'work-greeting',
              role: 'assistant',
              content: greetingContent,
              timestamp: new Date().toISOString(),
            };
            setMessages([greeting]);
          }
        }
      } catch (error) {
        console.error('Failed to load work chat history:', error);
        const fallbackGreeting: ChatMessage = {
          id: 'work-greeting',
          role: 'assistant',
          content: `你好！我是你的作品顾问。我已阅读《${work.title}》的大纲、世界观与章节摘要，可以与你讨论整体故事节奏、角色弧光或未来剧情方向。你想先聊哪一部分？`,
          timestamp: new Date().toISOString(),
        };
        setMessages([fallbackGreeting]);
      }
    };

    if (messages.length === 0) {
      loadHistory();
    }
  }, [work?.id, work?.title, messages.length]);

  return (
    <div className="h-full flex flex-col bg-dark-bg border border-dark-border rounded-lg overflow-hidden">
      <div className="flex-shrink-0 px-4 py-3 bg-dark-surface border-b border-dark-border">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-dark-text">作品顾问聊天</h4>
            <p className="text-xs text-dark-text-muted mt-1">
              基于作品大纲、世界观与章节摘要提供总体建议
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-dark-text-muted select-none">
            <input
              type="checkbox"
              checked={isReasoningMode}
              onChange={(e) => setIsReasoningMode(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-dark-border bg-dark-bg text-dark-primary"
            />
            <span>推理模式</span>
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <ChatMessageList
          messages={messages}
          streamingMessage={streamingMessage}
          isStreamingChat={isStreamingChat}
          errorMessage=""
          assistantLabel="AI顾问"
          userBubbleClass="bg-dark-secondary/40 text-dark-text border border-dark-border"
          isStreamingChatDisabled={isStreamingChat}
          onRegenerate={handleRegenerateMessage}
          onDelete={handleDeleteMessage}
          messagesEndRef={messagesEndRef}
          formatTimestamp={(ts) => new Date(ts).toLocaleString()}
        />
      </div>

      <div className="flex-shrink-0 border-t border-dark-border bg-dark-surface p-4">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Textarea
              ref={inputRef}
              value={inputMessage}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              placeholder="与AI谈话获得建议。"
              className="bg-dark-bg border-dark-border text-sm resize-none overflow-y-auto min-h-[40px] max-h-[200px]"
              rows={1}
              disabled={isStreamingChat}
            />
          </div>

          {isStreamingChat ? (
            <Button
              onClick={handleStopGeneration}
              size="sm"
              className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white"
            >
              <Square size={16} fill="currentColor" />
            </Button>
          ) : (
            <Button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim()}
              size="sm"
              className="flex items-center gap-2 px-3 py-2"
            >
              <Send size={16} />
            </Button>
          )}
        </div>

        {messages.length > 1 && (
          <div className="flex justify-center mt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearChat}
              className="text-xs text-dark-text-muted hover:text-dark-text"
            >
              清空聊天记录
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
