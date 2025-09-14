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
    };
  }, [work.id, chapter.id]);

  // Fallback chat mutation for when WebSocket is not available
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
    if (!message || chatMutation.isPending) return;

    setInputMessage('');

    // Try WebSocket first, fallback to HTTP API
    if (isConnected && chatWebSocket.current) {
      chatWebSocket.current.sendChatMessage(message);
    } else {
      // Add user message to chat for HTTP fallback
      const userMessage: ChatMessage = {
        id: Date.now().toString() + '_user',
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, userMessage]);
      
      // Send to AI via HTTP API
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
          <div
            key={message.id}
            className={`flex items-start gap-3 ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {message.role === 'assistant' && (
              <div className="flex-shrink-0 w-8 h-8 bg-dark-primary rounded-full flex items-center justify-center">
                <Bot size={16} className="text-white" />
              </div>
            )}
            
            <div
              className={`max-w-[80%] p-3 rounded-lg text-sm ${
                message.role === 'user'
                  ? 'bg-dark-primary text-white'
                  : 'bg-dark-surface border border-dark-border text-dark-text'
              }`}
            >
              <div className="whitespace-pre-wrap">{message.content}</div>
              <div className={`text-xs mt-1 opacity-70 ${
                message.role === 'user' ? 'text-blue-100' : 'text-dark-text-muted'
              }`}>
                {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>
            
            {message.role === 'user' && (
              <div className="flex-shrink-0 w-8 h-8 bg-dark-secondary rounded-full flex items-center justify-center">
                <User size={16} className="text-white" />
              </div>
            )}
          </div>
        ))}
        
        {/* Loading indicator for HTTP requests */}
        {chatMutation.isPending && !isConnected && (
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-dark-primary rounded-full flex items-center justify-center">
              <Bot size={16} className="text-white" />
            </div>
            <div className="bg-dark-surface border border-dark-border rounded-lg p-3">
              <div className="flex items-center gap-2 text-dark-text-muted">
                <LoadingSpinner size="sm" />
                <span className="text-sm">AI正在思考...</span>
              </div>
            </div>
          </div>
        )}

        {/* Typing indicator for WebSocket */}
        {isTyping && isConnected && (
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-dark-primary rounded-full flex items-center justify-center">
              <Bot size={16} className="text-white" />
            </div>
            <div className="bg-dark-surface border border-dark-border rounded-lg p-3">
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
              disabled={chatMutation.isPending && !isConnected}
            />
          </div>
          
          <Button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || (chatMutation.isPending && !isConnected)}
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