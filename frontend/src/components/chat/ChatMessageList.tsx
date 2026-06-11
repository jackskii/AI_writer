import React from 'react';
import { Bot, User, Trash2, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage } from '../../types';

interface ChatMessageListProps {
  messages: ChatMessage[];
  streamingMessage: string;
  isStreamingChat: boolean;
  errorMessage: string;
  assistantLabel?: string;
  userBubbleClass?: string;
  isStreamingChatDisabled?: boolean;
  onRegenerate: (messageId: string) => void;
  onDelete: (messageId: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  formatTimestamp?: (timestamp: string) => string;
}

const defaultFormatTime = (timestamp: string) =>
  new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  messages,
  streamingMessage,
  isStreamingChat,
  errorMessage,
  assistantLabel = 'AI助手',
  userBubbleClass = 'bg-dark-primary text-white',
  isStreamingChatDisabled = false,
  onRegenerate,
  onDelete,
  messagesEndRef,
  formatTimestamp = defaultFormatTime,
}) => (
  <>
    {messages.map((message) => (
      <div key={message.id} className="w-full">
        <div className={`flex items-center mb-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div className={`flex items-center gap-2 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div
              className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                message.role === 'assistant' ? 'bg-dark-primary' : 'bg-dark-secondary'
              }`}
            >
              {message.role === 'assistant' ? (
                <Bot size={12} className="text-white" />
              ) : (
                <User size={12} className="text-white" />
              )}
            </div>
            <span className="text-xs text-dark-text-muted">
              {message.role === 'assistant' ? assistantLabel : '你'}
            </span>
          </div>
        </div>

        <div
          className={`w-full p-3 rounded-lg text-sm mb-1 ${
            message.role === 'user'
              ? userBubbleClass
              : 'bg-dark-surface border border-dark-border text-dark-text'
          }`}
        >
          {message.role === 'assistant' ? (
            <div className="prose prose-sm prose-invert max-w-none">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          ) : (
            <div className="whitespace-pre-wrap">{message.content}</div>
          )}
        </div>

        <div className={`flex items-center gap-2 mb-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div className={`text-xs opacity-70 ${message.role === 'user' ? 'text-blue-100' : 'text-dark-text-muted'}`}>
            {formatTimestamp(message.timestamp)}
          </div>
          <div className="flex items-center gap-1">
            {message.role === 'assistant' && (
              <button
                type="button"
                onClick={() => onRegenerate(message.id)}
                disabled={isStreamingChatDisabled}
                className="p-1 rounded hover:bg-dark-bg text-dark-text-muted hover:text-dark-text transition-colors disabled:opacity-50"
                title="重新生成"
              >
                <RotateCcw size={12} />
              </button>
            )}
            <button
              type="button"
              onClick={() => onDelete(message.id)}
              disabled={isStreamingChatDisabled}
              className="p-1 rounded hover:bg-dark-bg text-dark-text-muted hover:text-red-400 transition-colors disabled:opacity-50"
              title="删除此消息及之后的消息"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>
    ))}

    {isStreamingChat && (
      <div className="w-full">
        <div className="flex items-center mb-2 justify-start">
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0 w-6 h-6 bg-dark-primary rounded-full flex items-center justify-center">
              <Bot size={12} className="text-white" />
            </div>
            <span className="text-xs text-dark-text-muted">{assistantLabel}</span>
          </div>
        </div>
        <div className="w-full bg-dark-surface border border-dark-border rounded-lg p-3 mb-1">
          <div className="prose prose-sm prose-invert max-w-none text-dark-text">
            <ReactMarkdown>{streamingMessage}</ReactMarkdown>
            <span className="inline-block w-2 h-4 bg-dark-primary animate-pulse ml-1" />
          </div>
        </div>
        <div className="text-xs opacity-70 mb-4 text-left text-dark-text-muted">正在输入...</div>
      </div>
    )}

    {errorMessage && !isStreamingChat && (
      <div className="w-full">
        <div className="flex items-center mb-2 justify-start">
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center">
              <Bot size={12} className="text-white" />
            </div>
            <span className="text-xs text-dark-text-muted">系统提示</span>
          </div>
        </div>
        <div className="w-full bg-red-900/20 border border-red-600/50 rounded-lg p-3 mb-1">
          <div className="text-sm text-red-300">
            <p className="font-semibold mb-1">错误</p>
            <p>{errorMessage}</p>
            {(errorMessage.includes('API密钥') || errorMessage.includes('API key')) && (
              <p className="mt-2 text-xs">请点击右上角设置按钮配置您的API密钥</p>
            )}
          </div>
        </div>
      </div>
    )}

    <div ref={messagesEndRef} />
  </>
);
