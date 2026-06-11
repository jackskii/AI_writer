import React, { useState, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { Send, Square } from 'lucide-react';
import { aiApi, chatApi } from '../../services/api';
import { ChatMessageList } from '../chat/ChatMessageList';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';
import type { Work, Chapter, ChatMessage } from '../../types';

interface ChatPanelProps {
  work: Work;
  chapter: Chapter;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ work, chapter }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isStreamingChat, setIsStreamingChat] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isReasoningMode, setIsReasoningMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamEventSourceRef = useRef<EventSource | null>(null);
  const shouldAutoScrollRef = useRef(false);

  // Auto-scroll to bottom when new messages are added
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    // Only auto-scroll after user-triggered chat actions (send/regenerate/streaming).
    if (!shouldAutoScrollRef.current) {
      return;
    }
    scrollToBottom();
  }, [messages, streamingMessage, errorMessage]);

  // Close active stream when unmounting
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

    // Check if work and chapter are available
    if (!work?.id || !chapter?.id) {
      console.error('Work or chapter not available for chat');
      return;
    }

    shouldAutoScrollRef.current = true;
    setInputMessage('');
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    // Save user message to backend first and get real ID
    let userMessage: ChatMessage;
    try {
      const response = await chatApi.saveMessage(work.id, chapter.id, 'user', message);
      userMessage = {
        id: response.data.id,
        role: 'user',
        content: message,
        timestamp: response.data.timestamp
      };
    } catch (error) {
      console.error('Failed to save user message:', error);
      // Fallback: use temporary ID if save fails
      userMessage = {
        id: Date.now().toString() + '_user',
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      };
    }
    setMessages(prev => [...prev, userMessage]);

    // Try streaming first, fallback to regular API
    try {
      setIsStreamingChat(true);
      setStreamingMessage('');
      setErrorMessage('');

      const eventSource = aiApi.chatStream(
        work.id,
        chapter.id,
        message,
        // onChunk
        (chunk: string) => {
          console.log('Chat chunk received:', chunk);
          flushSync(() => {
            setStreamingMessage(prev => prev + chunk);
          });
        },
        // onStart
        () => {
          console.log('Chat streaming started');
        },
        // onEnd
        async (fullResponse: string) => {
          setIsStreamingChat(false);
          setStreamingMessage('');
          streamEventSourceRef.current = null;

          // Save AI response to backend and get the real ID
          try {
            const response = await chatApi.saveMessage(work.id, chapter.id, 'assistant', fullResponse);
            const aiResponse: ChatMessage = {
              id: response.data.id,
              role: 'assistant',
              content: fullResponse,
              timestamp: response.data.timestamp
            };
            setMessages(prev => [...prev, aiResponse]);
          } catch (error) {
            console.error('Failed to save AI response:', error);
            // Fallback: add with temporary ID if save fails
            const aiResponse: ChatMessage = {
              id: Date.now().toString() + '_ai',
              role: 'assistant',
              content: fullResponse,
              timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, aiResponse]);
          }
        },
        // onError
        (error: string) => {
          console.error('Streaming chat error:', error);
          setIsStreamingChat(false);
          setStreamingMessage('');
          setErrorMessage(error);
          streamEventSourceRef.current = null;

          // Check if it's an API key error and trigger settings modal
          if (error.includes('API密钥') || error.includes('API key')) {
            window.dispatchEvent(new CustomEvent('openSettingsModal', {
              detail: { reason: 'API密钥未配置，请先配置您的DeepSeek API密钥' }
            }));
          }
        },
        isReasoningMode
      );
      
      streamEventSourceRef.current = eventSource;
    } catch (error) {
      console.error('Failed to start streaming:', error);
      setIsStreamingChat(false);
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
      if (work?.id && chapter?.id) {
        try {
          const response = await chatApi.saveMessage(work.id, chapter.id, 'assistant', messageContent);
          const aiResponse: ChatMessage = {
            id: response.data.id,
            role: 'assistant',
            content: messageContent,
            timestamp: response.data.timestamp
          };
          setMessages(prev => [...prev, aiResponse]);
        } catch (error) {
          console.error('Failed to save stopped message:', error);
          // Fallback: add with temporary ID if save fails
          const aiResponse: ChatMessage = {
            id: Date.now().toString() + '_ai',
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

    if (!work?.id || !chapter?.id) return;

    try {
      await chatApi.clearHistory(work.id, chapter.id);
      setMessages([]);
    } catch (error) {
      console.error('Failed to clear chat history:', error);
      // Still clear locally even if API fails
      setMessages([]);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('确定要删除此消息及之后的所有消息吗？')) return;

    if (!work?.id || !chapter?.id) return;

    try {
      await chatApi.deleteMessage(work.id, chapter.id, messageId);

      // Remove the message and all subsequent messages from local state
      const messageIndex = messages.findIndex(m => m.id === messageId);
      if (messageIndex !== -1) {
        setMessages(prev => prev.slice(0, messageIndex));
      }
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  };

  const handleRegenerateMessage = async (messageId: string) => {
    if (!work?.id || !chapter?.id) return;

    // Find the message to regenerate
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1 || messageIndex === 0) return;

    // Get the previous user message
    const previousMessage = messages[messageIndex - 1];
    if (previousMessage.role !== 'user') return;

    try {
      shouldAutoScrollRef.current = true;
      // Delete this AI message and all subsequent messages
      await chatApi.deleteMessage(work.id, chapter.id, messageId);

      // Remove from local state
      setMessages(prev => prev.slice(0, messageIndex));

      // Resend the previous user message to trigger new AI response
      const userMessageContent = previousMessage.content;

      // Try streaming
      setIsStreamingChat(true);
      setStreamingMessage('');
      setErrorMessage('');

      const eventSource = aiApi.chatStream(
        work.id,
        chapter.id,
        userMessageContent,
        // onChunk
        (chunk: string) => {
          flushSync(() => {
            setStreamingMessage(prev => prev + chunk);
          });
        },
        // onStart
        () => {
          console.log('Regenerate streaming started');
        },
        // onEnd
        async (fullResponse: string) => {
          setIsStreamingChat(false);
          setStreamingMessage('');
          streamEventSourceRef.current = null;

          // Save AI response to backend and get the real ID
          try {
            const response = await chatApi.saveMessage(work.id, chapter.id, 'assistant', fullResponse);
            const aiResponse: ChatMessage = {
              id: response.data.id,
              role: 'assistant',
              content: fullResponse,
              timestamp: response.data.timestamp
            };
            setMessages(prev => [...prev, aiResponse]);
          } catch (error) {
            console.error('Failed to save regenerated response:', error);
            // Fallback: add with temporary ID if save fails
            const aiResponse: ChatMessage = {
              id: Date.now().toString() + '_ai',
              role: 'assistant',
              content: fullResponse,
              timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, aiResponse]);
          }
        },
        // onError
        (error: string) => {
          console.error('Regenerate streaming error:', error);
          setIsStreamingChat(false);
          setStreamingMessage('');
          setErrorMessage(error);
          streamEventSourceRef.current = null;
        },
        isReasoningMode
      );

      streamEventSourceRef.current = eventSource;
    } catch (error) {
      console.error('Failed to regenerate message:', error);
    }
  };

  // Auto-resize textarea for chat input
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
      inputRef.current.style.overflowY = inputRef.current.scrollHeight > 200 ? 'auto' : 'hidden';
    }
  }, [inputMessage]);

  // Load chat history and show initial greeting if empty
  useEffect(() => {
    const loadChatHistory = async () => {
      if (!work?.id || !chapter?.id) return;

      try {
        const response = await chatApi.getHistory(work.id, chapter.id);
        const history = response.data.messages;

        if (history.length > 0) {
          setMessages(history);
        } else {
          // Show initial greeting if no history and save to backend
          const greetingContent = `你好！我是你的AI写作助手。我已经了解了你的作品《${work.title}》和当前章节《${chapter.title}》的内容。\n\n有什么我可以帮助你的吗？比如：\n• 讨论情节发展\n• 分析人物性格\n• 解决写作困难\n• 提供创意建议`;

          try {
            const response = await chatApi.saveMessage(work.id, chapter.id, 'assistant', greetingContent);
            const greeting: ChatMessage = {
              id: response.data.id,
              role: 'assistant',
              content: greetingContent,
              timestamp: response.data.timestamp
            };
            setMessages([greeting]);
          } catch (error) {
            console.error('Failed to save greeting:', error);
            // Fallback: show greeting with temporary ID if save fails
            const greeting: ChatMessage = {
              id: 'greeting',
              role: 'assistant',
              content: greetingContent,
              timestamp: new Date().toISOString()
            };
            setMessages([greeting]);
          }
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
        // Fallback to greeting if loading fails
        const greetingContent = `你好！我是你的AI写作助手。我已经了解了你的作品《${work.title}》和当前章节《${chapter.title}》的内容。\n\n有什么我可以帮助你的吗？比如：\n• 讨论情节发展\n• 分析人物性格\n• 解决写作困难\n• 提供创意建议`;

        const greeting: ChatMessage = {
          id: 'greeting',
          role: 'assistant',
          content: greetingContent,
          timestamp: new Date().toISOString()
        };
        setMessages([greeting]);
      }
    };

    if (messages.length === 0) {
      loadChatHistory();
    }
  }, [work?.id, chapter?.id, work?.title, chapter?.title, messages.length]);

  return (
    <div className="h-full flex flex-col bg-dark-bg">
      {/* Header with Reasoning Toggle */}
      <div className="flex-shrink-0 px-4 py-2 bg-dark-surface border-b border-dark-border">
        <div className="flex items-center justify-between">
          <span className="text-xs text-dark-text-muted">使用HTTP模式</span>
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

      {/* Chat Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        <ChatMessageList
          messages={messages}
          streamingMessage={streamingMessage}
          isStreamingChat={isStreamingChat}
          errorMessage={errorMessage}
          assistantLabel="AI助手"
          isStreamingChatDisabled={isStreamingChat}
          onRegenerate={handleRegenerateMessage}
          onDelete={handleDeleteMessage}
          messagesEndRef={messagesEndRef}
        />
      </div>

      {/* Input Area */}
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
