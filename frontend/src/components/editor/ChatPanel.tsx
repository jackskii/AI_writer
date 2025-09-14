import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Wifi, WifiOff } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { aiApi, ChatWebSocket } from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { LoadingSpinner } from '../ui/Loading';
import type { Work, Chapter, ChatMessage } from '../../types';

interface ChatPanelProps {
  work: Work;
  chapter: Chapter;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ work, chapter }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatWebSocket = useRef<ChatWebSocket | null>(null);
  const typingTimer = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom when new messages are added
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Disable WebSocket for now, use HTTP API only
  useEffect(() => {
    if (!work || !chapter) return;

    // Skip WebSocket connection, use HTTP fallback
    setIsConnected(false);

    return () => {
      if (typingTimer.current) {
        clearTimeout(typingTimer.current);
      }
      if (streamEventSource) {
        streamEventSource.close();
        setStreamEventSource(null);
      }
    };
  }, [work.id, chapter.id]);

  // State for streaming
  const [isStreamingChat, setIsStreamingChat] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [streamEventSource, setStreamEventSource] = useState<EventSource | null>(null);

  // Fallback chat mutation for when streaming fails
  const chatMutation = useMutation({
    mutationFn: (message: string) => aiApi.chat(work.id, chapter.id, message),
    onSuccess: (response, message) => {
      const aiResponse: ChatMessage = {
        id: Date.now().toString() + '_ai',
        role: 'assistant',
        content: response.data.response,
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, aiResponse]);
    },
    onError: (error) => {
      const errorMessage: ChatMessage = {
        id: Date.now().toString() + '_error',
        role: 'assistant',
        content: 'AI暂时无法回应，请稍后重试。',
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, errorMessage]);
      console.error('Chat error:', error);
    }
  });

  const handleSendMessage = () => {
    const message = inputMessage.trim();
    if (!message || isStreamingChat || chatMutation.isPending) return;

    setInputMessage('');

    // Add user message immediately
    const userMessage: ChatMessage = {
      id: Date.now().toString() + '_user',
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);

    // Try streaming first, fallback to regular API
    try {
      setIsStreamingChat(true);
      setStreamingMessage('');
      
      const eventSource = aiApi.chatStream(
        work.id,
        chapter.id,
        message,
        // onChunk
        (chunk: string) => {
          setStreamingMessage(prev => prev + chunk);
        },
        // onStart
        () => {
          console.log('Chat streaming started');
        },
        // onEnd
        (fullResponse: string) => {
          const aiResponse: ChatMessage = {
            id: Date.now().toString() + '_ai',
            role: 'assistant',
            content: fullResponse,
            timestamp: new Date().toISOString()
          };
          
          setMessages(prev => [...prev, aiResponse]);
          setIsStreamingChat(false);
          setStreamingMessage('');
          setStreamEventSource(null);
        },
        // onError
        (error: string) => {
          console.error('Streaming chat error:', error);
          setIsStreamingChat(false);
          setStreamingMessage('');
          setStreamEventSource(null);
          
          // Fallback to regular API
          chatMutation.mutate(message);
        }
      );
      
      setStreamEventSource(eventSource);
    } catch (error) {
      console.error('Failed to start streaming:', error);
      setIsStreamingChat(false);
      chatMutation.mutate(message);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputMessage(e.target.value);
    
    // Send typing indicator via WebSocket
    if (isConnected && chatWebSocket.current) {
      chatWebSocket.current.sendTypingIndicator(true);
      
      // Clear previous timer
      if (typingTimer.current) {
        clearTimeout(typingTimer.current);
      }
      
      // Stop typing indicator after 2 seconds of inactivity
      typingTimer.current = setTimeout(() => {
        if (chatWebSocket.current) {
          chatWebSocket.current.sendTypingIndicator(false);
        }
      }, 2000);
    }
  };

  const handleClearChat = () => {
    if (confirm('确定要清空聊天记录吗？')) {
      setMessages([]);
    }
  };

  // Initial AI greeting
  useEffect(() => {
    if (messages.length === 0 && work && chapter) {
      const greeting: ChatMessage = {
        id: 'greeting',
        role: 'assistant',
        content: `你好！我是你的AI写作助手。我已经了解了你的作品《${work.title}》和当前章节《${chapter.title}》的内容。\n\n有什么我可以帮助你的吗？比如：\n• 讨论情节发展\n• 分析人物性格\n• 解决写作困难\n• 提供创意建议`,
        timestamp: new Date().toISOString()
      };
      setMessages([greeting]);
    }
  }, [work, chapter, messages.length]);

  return (
    <div className="h-full flex flex-col bg-dark-bg">
      {/* Connection Status */}
      <div className="flex-shrink-0 px-4 py-2 bg-dark-surface border-b border-dark-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-blue-500'}`} />
            <span className="text-xs text-dark-text-muted">
              {isConnected ? 'WebSocket已连接' : '使用HTTP模式'}
            </span>
          </div>
          <div className="flex items-center gap-1 text-dark-text-muted">
            {isConnected ? (
              <Wifi size={14} className="text-green-500" />
            ) : (
              <WifiOff size={14} className="text-blue-500" />
            )}
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className="w-full">
            {/* Avatar on top */}
            <div className={`flex items-center mb-2 ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}>
              <div className={`flex items-center gap-2 ${
                message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}>
                <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                  message.role === 'assistant' 
                    ? 'bg-dark-primary' 
                    : 'bg-dark-secondary'
                }`}>
                  {message.role === 'assistant' ? (
                    <Bot size={12} className="text-white" />
                  ) : (
                    <User size={12} className="text-white" />
                  )}
                </div>
                <span className="text-xs text-dark-text-muted">
                  {message.role === 'assistant' ? 'AI助手' : '你'}
                </span>
              </div>
            </div>
            
            {/* Full width text bubble */}
            <div
              className={`w-full p-3 rounded-lg text-sm mb-1 ${
                message.role === 'user'
                  ? 'bg-dark-primary text-white'
                  : 'bg-dark-surface border border-dark-border text-dark-text'
              }`}
            >
              <div className="whitespace-pre-wrap">{message.content}</div>
            </div>
            
            {/* Timestamp */}
            <div className={`text-xs opacity-70 mb-4 ${
              message.role === 'user' 
                ? 'text-right text-blue-100' 
                : 'text-left text-dark-text-muted'
            }`}>
              {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
        ))}
        
        {/* Streaming message indicator */}
        {isStreamingChat && (
          <div className="w-full">
            {/* Avatar on top */}
            <div className="flex items-center mb-2 justify-start">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 w-6 h-6 bg-dark-primary rounded-full flex items-center justify-center">
                  <Bot size={12} className="text-white" />
                </div>
                <span className="text-xs text-dark-text-muted">AI助手</span>
              </div>
            </div>
            
            {/* Streaming content */}
            <div className="w-full bg-dark-surface border border-dark-border rounded-lg p-3 mb-1">
              <div className="whitespace-pre-wrap text-dark-text">
                {streamingMessage}
                <span className="inline-block w-2 h-4 bg-dark-primary animate-pulse ml-1" />
              </div>
            </div>
            
            {/* Timestamp */}
            <div className="text-xs opacity-70 mb-4 text-left text-dark-text-muted">
              正在输入...
            </div>
          </div>
        )}

        {/* Loading indicator for HTTP requests */}
        {chatMutation.isPending && !isStreamingChat && (
          <div className="w-full">
            {/* Avatar on top */}
            <div className="flex items-center mb-2 justify-start">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 w-6 h-6 bg-dark-primary rounded-full flex items-center justify-center">
                  <Bot size={12} className="text-white" />
                </div>
                <span className="text-xs text-dark-text-muted">AI助手</span>
              </div>
            </div>
            
            {/* Full width loading bubble */}
            <div className="w-full bg-dark-surface border border-dark-border rounded-lg p-3">
              <div className="flex items-center gap-2 text-dark-text-muted">
                <LoadingSpinner size="sm" />
                <span className="text-sm">AI正在思考...</span>
              </div>
            </div>
          </div>
        )}

        {/* Typing indicator for WebSocket */}
        {isTyping && isConnected && (
          <div className="w-full">
            {/* Avatar on top */}
            <div className="flex items-center mb-2 justify-start">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 w-6 h-6 bg-dark-primary rounded-full flex items-center justify-center">
                  <Bot size={12} className="text-white" />
                </div>
                <span className="text-xs text-dark-text-muted">AI助手</span>
              </div>
            </div>
            
            {/* Full width typing bubble */}
            <div className="w-full bg-dark-surface border border-dark-border rounded-lg p-3">
              <div className="flex items-center gap-2 text-dark-text-muted">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-dark-text-muted rounded-full animate-bounce" style={{animationDelay: '0ms'}} />
                  <div className="w-2 h-2 bg-dark-text-muted rounded-full animate-bounce" style={{animationDelay: '150ms'}} />
                  <div className="w-2 h-2 bg-dark-text-muted rounded-full animate-bounce" style={{animationDelay: '300ms'}} />
                </div>
                <span className="text-sm">AI正在输入...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 border-t border-dark-border bg-dark-surface p-4">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Input
              ref={inputRef}
              value={inputMessage}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder="与AI助手聊天..."
              className="bg-dark-bg border-dark-border text-sm"
              disabled={isStreamingChat || chatMutation.isPending}
            />
          </div>
          
          <Button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isStreamingChat || chatMutation.isPending}
            size="sm"
            className="flex items-center gap-2 px-3 py-2"
          >
            <Send size={16} />
          </Button>
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