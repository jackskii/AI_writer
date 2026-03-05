import React, { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Send, Loader2, Trash2 } from 'lucide-react';
import { aiApi } from '../../services/api';
import { chaptersApi } from '../../services/api';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';
import type { Work, Chapter } from '../../types';

interface CyoaChatPanelProps {
  work: Work;
  chapter: Chapter;
  onContentSaved?: (content: string) => void;
}

function parseCyoaContent(content: string): { introduction: string; segments: Array<{ role: 'user' | 'assistant'; content: string }> } {
  const raw = (content || '').trim();
  if (!raw) return { introduction: '', segments: [] };
  const match = raw.match(/\n\n(?:User|Agent)\s*:\s*/i);
  if (!match) return { introduction: raw, segments: [] };
  const introduction = raw.slice(0, match.index).trim();
  const rest = raw.slice((match.index as number) + match[0].length);
  const segments: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  const blocks = rest.split(/(?=\n\n(?:User|Agent)\s*:\s*)/i);
  for (const block of blocks) {
    const userMatch = block.match(/^User\s*:\s*(.*)$/is);
    const agentMatch = block.match(/^Agent\s*:\s*(.*)$/is);
    if (userMatch) segments.push({ role: 'user', content: userMatch[1].trim() });
    else if (agentMatch) segments.push({ role: 'assistant', content: agentMatch[1].trim() });
  }
  return { introduction, segments };
}

function serializeCyoaContent(introduction: string, segments: Array<{ role: 'user' | 'assistant'; content: string }>): string {
  const parts: string[] = [];
  if (introduction.trim()) parts.push(introduction.trim());
  for (const s of segments) {
    const label = s.role === 'user' ? 'User' : 'Agent';
    parts.push(`${label}: ${s.content}`);
  }
  return parts.join('\n\n');
}

export const CyoaChatPanel: React.FC<CyoaChatPanelProps> = ({ work, chapter, onContentSaved }) => {
  const [introduction, setIntroduction] = useState('');
  const [segments, setSegments] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [isGeneratingIntro, setIsGeneratingIntro] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [introError, setIntroError] = useState('');
  const [chatError, setChatError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const segmentsRef = useRef(segments);
  const introductionRef = useRef(introduction);
  segmentsRef.current = segments;
  introductionRef.current = introduction;

  useEffect(() => {
    const { introduction: intro, segments: segs } = parseCyoaContent(chapter.content || '');
    setIntroduction(intro);
    setSegments((prev) => {
      // Don't overwrite with stale content when we have newer local segments (e.g. just finished streaming)
      if (prev.length > segs.length) return prev;
      return segs;
    });
  }, [chapter.id, chapter.content]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments, streamingContent]);

  const generateIntroduction = async () => {
    if (!work?.id || !chapter?.id) return;
    setIsGeneratingIntro(true);
    setIntroError('');
    try {
      const { introduction: intro } = await aiApi.cyoaIntroduction(work.id, chapter.id);
      setIntroduction(intro);
      const next = serializeCyoaContent(intro, []);
      await chaptersApi.update(work.id, chapter.id, { content: next });
      onContentSaved?.(next);
    } catch (e) {
      setIntroError(e instanceof Error ? e.message : '生成开场白失败');
    } finally {
      setIsGeneratingIntro(false);
    }
  };

  const saveContent = async (intro: string, segs: Array<{ role: 'user' | 'assistant'; content: string }>) => {
    const next = serializeCyoaContent(intro, segs);
    await chaptersApi.update(work.id, chapter.id, { content: next });
    onContentSaved?.(next);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming || !work?.id || !chapter?.id) return;
    setInput('');
    setChatError('');
    const userSegment = { role: 'user' as const, content: text };
    const nextSegments = [...segments, userSegment];
    setSegments(nextSegments);
    setIsStreaming(true);
    setStreamingContent('');
    const messages = nextSegments.map((s) => ({ role: s.role, content: s.content }));
    let fullReply = '';
    try {
      await aiApi.cyoaChatStream(
        work.id,
        chapter.id,
        messages,
        (chunk) => {
          flushSync(() => {
            fullReply += chunk;
            setStreamingContent(fullReply);
          });
        },
        async (fullResponse) => {
          setIsStreaming(false);
          setStreamingContent('');
          const finalSegments = [...nextSegments, { role: 'assistant' as const, content: fullResponse.trim() }];
          setSegments(finalSegments);
          await saveContent(introduction, finalSegments);
        },
        (err) => {
          setIsStreaming(false);
          setStreamingContent('');
          setChatError(err);
        }
      );
    } catch (e) {
      setIsStreaming(false);
      setStreamingContent('');
      setChatError(e instanceof Error ? e.message : '发送失败');
    }
  };

  const handleDeleteSegment = (index: number) => {
    const ok = window.confirm('确认删除这个对话块吗？');
    if (!ok) return;
    const updated = segments.filter((_, i) => i !== index);
    setSegments(updated);
    saveContent(introduction, updated);
  };

  const handleSegmentContentChange = (index: number, value: string) => {
    const updated = [...segments];
    updated[index] = { ...updated[index], content: value };
    setSegments(updated);
  };

  const handleSegmentBlur = () => {
    saveContent(introductionRef.current, segmentsRef.current);
  };

  const handleIntroductionBlur = () => {
    saveContent(introductionRef.current, segmentsRef.current);
  };

  const hasIntro = introduction.length > 0;
  const canSend = hasIntro && !isGeneratingIntro;

  return (
    <div className="h-full flex flex-col bg-dark-bg">
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ scrollbarGutter: 'stable' }}>
        {!hasIntro && !isGeneratingIntro && (
          <div className="rounded-lg border border-dark-border bg-dark-surface/50 p-4 text-center">
            <p className="text-dark-text-muted text-sm mb-3">根据本场事件与角色状态生成第二人称开场白</p>
            <Button onClick={generateIntroduction} disabled={isGeneratingIntro}>
              {isGeneratingIntro ? '生成中...' : '生成开场白'}
            </Button>
            {introError && <p className="text-red-400 text-sm mt-2">{introError}</p>}
          </div>
        )}
        {isGeneratingIntro && (
          <div className="flex items-center gap-2 text-dark-text-muted">
            <Loader2 size={18} className="animate-spin" />
            <span>正在生成开场白...</span>
          </div>
        )}
        {hasIntro && (
          <div className="rounded-lg border border-dark-border bg-black">
            <div className="px-3 py-2 text-xs font-semibold text-dark-text-muted border-b border-dark-border">
              Agent
            </div>
            <textarea
              value={introduction}
              onChange={(e) => setIntroduction(e.target.value)}
              onBlur={handleIntroductionBlur}
              className="w-full p-3 text-dark-text whitespace-pre-wrap chinese-text resize-y min-h-[60px] bg-transparent border-0 rounded focus:ring-1 focus:ring-dark-border focus:outline-none text-sm"
              rows={Math.max(2, Math.min(20, (introduction.match(/\n/g)?.length ?? 0) + 2))}
            />
          </div>
        )}
        {segments.map((seg, i) => (
          <div
            key={i}
            className={`rounded-lg border border-dark-border ${
              seg.role === 'user' ? 'bg-blue-900/20' : 'bg-purple-900/20'
            }`}
          >
            <div className="px-3 py-2 text-xs font-semibold text-dark-text-muted border-b border-dark-border flex items-center justify-between">
              <span>{seg.role === 'user' ? 'User' : 'Agent'}</span>
              <button
                type="button"
                onClick={() => handleDeleteSegment(i)}
                className="p-1 rounded hover:bg-dark-surface/50 text-dark-text-muted hover:text-red-400"
                title="删除此块"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <textarea
              value={seg.content}
              onChange={(e) => handleSegmentContentChange(i, e.target.value)}
              onBlur={handleSegmentBlur}
              className="w-full p-3 text-dark-text text-sm whitespace-pre-wrap resize-y min-h-[60px] bg-transparent border-0 rounded focus:ring-1 focus:ring-dark-border focus:outline-none"
              rows={Math.max(2, Math.min(20, (seg.content.match(/\n/g)?.length ?? 0) + 2))}
            />
          </div>
        ))}
        {isStreaming && (
          <div className="rounded-lg border border-dark-border bg-purple-900/20">
            <div className="px-3 py-2 text-xs font-semibold text-dark-text-muted border-b border-dark-border">
              Agent
            </div>
            <div className="p-3 text-dark-text whitespace-pre-wrap text-sm">
              {streamingContent}
              <Loader2 size={14} className="animate-spin inline-block ml-1 text-dark-text-muted" />
            </div>
          </div>
        )}
        {chatError && <p className="text-red-400 text-sm">{chatError}</p>}
        <div ref={bottomRef} />
      </div>
      <div className="flex-shrink-0 border-t border-dark-border bg-dark-surface">
        <div className="py-2 border-b border-dark-border px-4 md:px-6">
          <span className="text-sm text-dark-text-muted">
            {canSend ? '输入玩家行动或对话，Enter 发送' : '请先生成开场白'}
          </span>
        </div>
        <div className="p-4 flex items-end gap-3">
          <div className="flex-1">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={canSend ? '输入你的行动或对话...' : '请先生成开场白'}
              rows={1}
              className="bg-dark-bg border-dark-border text-sm resize-y min-h-[40px] w-full overflow-y-auto"
              disabled={!canSend || isStreaming}
            />
          </div>
          <Button
            onClick={handleSend}
            disabled={!canSend || isStreaming || !input.trim()}
            size="sm"
            className="flex items-center gap-2 px-3 py-2"
          >
            {isStreaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </Button>
        </div>
      </div>
    </div>
  );
};
