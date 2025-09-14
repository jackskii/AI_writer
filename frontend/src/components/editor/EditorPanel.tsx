import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Lightbulb, Zap, X, Plus, Edit3, Trash2, StickyNote, ExternalLink, Link, AlertTriangle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { LoadingButton } from '../ui/Loading';
import { useUIStore } from '../../stores/useUIStore';
import { aiApi, notesApi } from '../../services/api';
import { DeleteNoteConfirmDialog } from '../modals/DeleteNoteConfirmDialog';
import type { Work, Chapter, Note } from '../../types';

interface EditorPanelProps {
  content: string;
  onChange: (content: string) => void;
  work: Work;
  chapter: Chapter;
}

const NOTE_COLORS = [
  { value: '#f59e0b', label: '黄色' },
  { value: '#ef4444', label: '红色' },
  { value: '#10b981', label: '绿色' },
  { value: '#3b82f6', label: '蓝色' },
  { value: '#8b5cf6', label: '紫色' },
  { value: '#f97316', label: '橙色' },
];

// Marker utility functions for note anchoring
const MARKER_START_PREFIX = '\u200B\u200C'; // Zero-width space + Zero-width non-joiner
const MARKER_START_SUFFIX = '\u200C\u200B';
const MARKER_END_PREFIX = '\u200B\u200D'; // Zero-width space + Zero-width joiner  
const MARKER_END_SUFFIX = '\u200D\u200B';

const MarkerUtils = {
  // Create start marker for a note
  createStartMarker: (noteId: number): string => {
    return `${MARKER_START_PREFIX}${noteId}${MARKER_START_SUFFIX}`;
  },

  // Create end marker for a note
  createEndMarker: (noteId: number): string => {
    return `${MARKER_END_PREFIX}${noteId}${MARKER_END_SUFFIX}`;
  },

  // Insert markers around selected text
  insertMarkers: (text: string, noteId: number, start: number, end: number): string => {
    const startMarker = MarkerUtils.createStartMarker(noteId);
    const endMarker = MarkerUtils.createEndMarker(noteId);
    
    return text.slice(0, start) + startMarker + text.slice(start, end) + endMarker + text.slice(end);
  },

  // Remove markers for a specific note
  removeMarkers: (text: string, noteId: number): string => {
    const startMarker = MarkerUtils.createStartMarker(noteId);
    const endMarker = MarkerUtils.createEndMarker(noteId);
    
    return text.replace(startMarker, '').replace(endMarker, '');
  },

  // Strip all markers from text for display
  stripAllMarkers: (text: string): string => {
    // Remove all marker patterns
    return text.replace(/[\u200B\u200C\u200D]/g, '');
  },

  // Find current positions of markers in text (returns positions in stripped text)
  findMarkerPositions: (text: string, noteId: number): { start: number; end: number } | null => {
    const startMarker = MarkerUtils.createStartMarker(noteId);
    const endMarker = MarkerUtils.createEndMarker(noteId);
    
    const startIndex = text.indexOf(startMarker);
    const endIndex = text.indexOf(endMarker);
    
    if (startIndex === -1 || endIndex === -1) {
      return null; // Markers not found
    }
    
    // Calculate positions in clean text (without markers before these positions)
    const textBeforeStart = text.slice(0, startIndex);
    const cleanStart = MarkerUtils.stripAllMarkers(textBeforeStart).length;
    
    const textBeforeEnd = text.slice(0, endIndex);
    const cleanEnd = MarkerUtils.stripAllMarkers(textBeforeEnd).length - startMarker.length; // Subtract start marker
    
    return { start: cleanStart, end: cleanEnd };
  },

  // Get text between markers
  getTextBetweenMarkers: (text: string, noteId: number): string | null => {
    const startMarker = MarkerUtils.createStartMarker(noteId);
    const endMarker = MarkerUtils.createEndMarker(noteId);
    
    const startIndex = text.indexOf(startMarker);
    const endIndex = text.indexOf(endMarker);
    
    if (startIndex === -1 || endIndex === -1) {
      return null;
    }
    
    const markedText = text.slice(startIndex + startMarker.length, endIndex);
    return MarkerUtils.stripAllMarkers(markedText);
  },

  // Check if markers exist for a note
  hasMarkers: (text: string, noteId: number): boolean => {
    const startMarker = MarkerUtils.createStartMarker(noteId);
    const endMarker = MarkerUtils.createEndMarker(noteId);
    
    return text.includes(startMarker) && text.includes(endMarker);
  }
};

export const EditorPanel: React.FC<EditorPanelProps> = ({
  content,
  onChange,
  work,
  chapter
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [guideText, setGuideText] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamEventSource, setStreamEventSource] = useState<EventSource | null>(null);
  
  // Note-related states
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [selectedColor, setSelectedColor] = useState(NOTE_COLORS[0].value);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [noteSelectionStart, setNoteSelectionStart] = useState(0);
  const [noteSelectionEnd, setNoteSelectionEnd] = useState(0);
  const [selectedTextForNote, setSelectedTextForNote] = useState('');
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  
  // Content with markers (stored in database)
  const [contentWithMarkers, setContentWithMarkers] = useState('');
  
  const {
    isAIContinueLoading,
    setAIContinueLoading,
    isAISuggestLoading,
    setAISuggestLoading,
    addNotification
  } = useUIStore();
  
  // Initialize contentWithMarkers from content prop
  useEffect(() => {
    if (content !== MarkerUtils.stripAllMarkers(contentWithMarkers)) {
      setContentWithMarkers(content);
    }
  }, [content, contentWithMarkers]);

  const queryClient = useQueryClient();

  // Fetch notes for current chapter
  const { data: notes = [] } = useQuery({
    queryKey: ['notes', work.id, chapter.id],
    queryFn: async () => {
      const response = await notesApi.list(work.id, chapter.id);
      return response.data.results || response.data;
    }
  });

  // Create note mutation
  const createNoteMutation = useMutation({
    mutationFn: (noteData: Partial<Note>) => notesApi.create(noteData),
    onSuccess: (createdNote: Note) => {
      // If note has linked text, insert markers into content
      if (selectedTextForNote && noteSelectionStart !== undefined && noteSelectionEnd !== undefined) {
        const newContentWithMarkers = MarkerUtils.insertMarkers(
          contentWithMarkers,
          createdNote.id,
          noteSelectionStart,
          noteSelectionEnd
        );
        setContentWithMarkers(newContentWithMarkers);
        
        // Update the content in parent component (this will save to database)
        onChange(MarkerUtils.stripAllMarkers(newContentWithMarkers));
      }
      
      queryClient.invalidateQueries({ queryKey: ['notes', work.id, chapter.id] });
      setNewNoteContent('');
      setIsCreatingNote(false);
      setSelectedTextForNote('');
      addNotification({
        type: 'success',
        message: '笔记创建成功'
      });
    },
    onError: () => {
      addNotification({
        type: 'error',
        message: '笔记创建失败'
      });
    }
  });

  // Update note mutation
  const updateNoteMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Note> }) => 
      notesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', work.id, chapter.id] });
      setEditingNote(null);
      addNotification({
        type: 'success',
        message: '笔记更新成功'
      });
    }
  });

  // Delete note mutation
  const deleteNoteMutation = useMutation({
    mutationFn: (id: number) => notesApi.delete(id),
    onSuccess: (_, deletedNoteId) => {
      // Remove markers from content if they exist
      const newContentWithMarkers = MarkerUtils.removeMarkers(contentWithMarkers, deletedNoteId);
      if (newContentWithMarkers !== contentWithMarkers) {
        setContentWithMarkers(newContentWithMarkers);
        onChange(MarkerUtils.stripAllMarkers(newContentWithMarkers));
      }
      
      queryClient.invalidateQueries({ queryKey: ['notes', work.id, chapter.id] });
      addNotification({
        type: 'success',
        message: '笔记删除成功'
      });
    }
  });

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (streamEventSource) {
        streamEventSource.close();
      }
    };
  }, [streamEventSource]);

  // Cancel streaming
  const handleCancelStreaming = () => {
    if (streamEventSource) {
      streamEventSource.close();
      setStreamEventSource(null);
    }
    setIsStreaming(false);
    setAIContinueLoading(false);
    addNotification({
      type: 'info',
      message: 'AI续写已取消'
    });
  };

  // Handle text selection for suggestions
  const handleTextSelect = () => {
    if (!textareaRef.current) return;
    
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    
    if (start !== end) {
      const selected = content.slice(start, end);
      setSelectedText(selected);
      setSelectionStart(start);
      setSelectionEnd(end);
      
      // Also set for note creation
      setNoteSelectionStart(start);
      setNoteSelectionEnd(end);
      setSelectedTextForNote(selected);
    } else {
      setSelectedText('');
      setSelectedTextForNote('');
    }
  };

  // Note handling functions
  const handleCreateNote = () => {
    if (!newNoteContent.trim()) return;

    createNoteMutation.mutate({
      work: work.id,
      chapter: chapter.id,
      content: newNoteContent,
      color: selectedColor,
      note_type: 'user',
      text_start_position: selectedTextForNote ? noteSelectionStart : undefined,
      text_end_position: selectedTextForNote ? noteSelectionEnd : undefined,
      linked_text: selectedTextForNote || undefined
    });
  };

  const handleUpdateNote = () => {
    if (!editingNote || !editingNote.content.trim()) return;

    updateNoteMutation.mutate({
      id: editingNote.id,
      data: editingNote
    });
  };

  const handleDeleteNote = (note: Note) => {
    setNoteToDelete(note);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDeleteNote = () => {
    if (noteToDelete) {
      deleteNoteMutation.mutate(noteToDelete.id);
      setIsDeleteDialogOpen(false);
      setNoteToDelete(null);
    }
  };

  const handleCancelDeleteNote = () => {
    setIsDeleteDialogOpen(false);
    setNoteToDelete(null);
  };

  // Handle updating a note's text link
  const handleUpdateNoteLink = (note: Note) => {
    if (!selectedText) {
      addNotification({
        type: 'info',
        message: '请先选择文本，然后点击"更新链接"按钮'
      });
      return;
    }

    // Update the note with new link information
    updateNoteMutation.mutate({
      id: note.id,
      data: {
        ...note,
        linked_text: selectedText,
        text_start_position: selectionStart,
        text_end_position: selectionEnd
      }
    });

    addNotification({
      type: 'success',
      message: '笔记链接已更新'
    });
  };

  const handleStartCreateNote = () => {
    if (selectedTextForNote) {
      setIsCreatingNote(true);
    } else {
      addNotification({
        type: 'info',
        message: '请先选择文本再创建笔记'
      });
    }
  };

  const handleCancelCreateNote = () => {
    setIsCreatingNote(false);
    setNewNoteContent('');
    setSelectedTextForNote('');
  };

  // Calculate line position for notes
  const getLineFromPosition = (position: number) => {
    const textBeforePosition = content.slice(0, position);
    return textBeforePosition.split('\n').length;
  };

  // Handle note click to jump to linked text
  const handleNoteClick = (note: Note) => {
    if (!note.linked_text || !textareaRef.current) return;

    // First try to find exact match
    const exactMatchIndex = content.indexOf(note.linked_text);
    
    if (exactMatchIndex !== -1) {
      // Exact match found - highlight it
      const startPos = exactMatchIndex;
      const endPos = exactMatchIndex + note.linked_text.length;
      
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(startPos, endPos);
      
      // Calculate scroll position
      const textBeforePosition = content.slice(0, startPos);
      const lines = textBeforePosition.split('\n');
      const lineNumber = lines.length - 1;
      const lineHeight = 30;
      const scrollPosition = lineNumber * lineHeight;
      
      textareaRef.current.scrollTop = Math.max(0, scrollPosition - 100);
      
      // Update selection state
      setSelectedText(note.linked_text);
      setSelectionStart(startPos);
      setSelectionEnd(endPos);
    } else {
      // No exact match found - show warning but still focus editor
      textareaRef.current.focus();
      addNotification({
        type: 'warning',
        message: '关联的文本内容已被修改，无法精确定位。请使用"更新链接"功能重新关联。'
      });
    }
  };

  // AI Continue Writing - Streaming Version
  const handleAIContinue = async () => {
    if (isAIContinueLoading) return;

    try {
      setAIContinueLoading(true);
      let accumulatedContent = '';
      const startingContent = content;
      
      const eventSource = aiApi.continueStream(
        work.id, 
        chapter.id,
        // onChunk - called for each piece of text
        (chunk: string) => {
          accumulatedContent += chunk;
          const newContent = startingContent + accumulatedContent;
          onChange(newContent);
          
          // Keep cursor at end during streaming
          if (textareaRef.current) {
            setTimeout(() => {
              if (textareaRef.current) {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(newContent.length, newContent.length);
              }
            }, 0);
          }
        },
        // onStart
        () => {
          console.log('AI streaming started');
          setIsStreaming(true);
          addNotification({
            type: 'info',
            message: 'AI续写开始...'
          });
        },
        // onEnd
        () => {
          console.log('AI streaming completed');
          setIsStreaming(false);
          setAIContinueLoading(false);
          setGuideText('');
          setStreamEventSource(null);
          addNotification({
            type: 'success',
            message: 'AI续写完成'
          });
          
          // Final cursor position
          const finalContent = startingContent + accumulatedContent;
          if (textareaRef.current) {
            setTimeout(() => {
              if (textareaRef.current) {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(finalContent.length, finalContent.length);
              }
            }, 100);
          }
        },
        // onError
        (error: string) => {
          console.error('AI continue streaming error:', error);
          setIsStreaming(false);
          setAIContinueLoading(false);
          setStreamEventSource(null);
          addNotification({
            type: 'error',
            message: `AI续写失败: ${error}`
          });
        },
        guideText || undefined,
        content,
        160
      );
      
      // Store eventSource reference so we can clean it up if needed
      setStreamEventSource(eventSource);
      
    } catch (error) {
      console.error('AI continue error:', error);
      setAIContinueLoading(false);
      addNotification({
        type: 'error',
        message: 'AI续写连接失败，请稍后重试'
      });
    }
  };

  // AI Suggestions for selected text
  const handleAISuggest = async () => {
    if (isAISuggestLoading || !selectedText) return;

    try {
      setAISuggestLoading(true);
      
      const response = await aiApi.suggest(work.id, chapter.id, selectedText);
      const suggestions = response.data.suggestions;
      
      if (suggestions && suggestions.length > 0) {
        // Create AI-generated notes from suggestions
        let createdCount = 0;
        for (const suggestion of suggestions) {
          try {
            await notesApi.create({
              work: work.id,
              chapter: chapter.id,
              content: suggestion.content || suggestion,
              color: '#3b82f6', // Blue color for AI suggestions
              note_type: 'suggestion',
              is_ai_generated: true,
              text_start_position: noteSelectionStart,
              text_end_position: noteSelectionEnd,
              linked_text: selectedText
            });
            createdCount++;
          } catch (error) {
            console.error('Failed to create suggestion note:', error);
          }
        }
        
        if (createdCount > 0) {
          // Refresh notes list
          queryClient.invalidateQueries({ queryKey: ['notes', work.id, chapter.id] });
          addNotification({
            type: 'success',
            message: `已生成 ${createdCount} 条AI建议，请查看笔记面板`
          });
        } else {
          addNotification({
            type: 'error',
            message: '建议生成失败'
          });
        }
      } else {
        addNotification({
          type: 'info',
          message: '暂无建议生成'
        });
      }
      
    } catch (error) {
      console.error('AI suggest error:', error);
      addNotification({
        type: 'error',
        message: 'AI建议生成失败，请稍后重试'
      });
    } finally {
      setAISuggestLoading(false);
    }
  };

  // Calculate word count (Chinese + English mixed)
  const calculateWordCount = (text: string) => {
    if (!text) return 0;
    
    // Count Chinese characters (each character is one word)
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    
    // Count English words (space-separated, excluding Chinese characters)
    const englishText = text.replace(/[\u4e00-\u9fff]/g, ' ');
    const englishWords = englishText.split(/\s+/).filter(word => word.trim()).length;
    
    return chineseChars + englishWords;
  };
  
  const wordCount = calculateWordCount(content);
  const totalChars = content.length;

  return (
    <div className="h-full flex flex-col bg-dark-bg">
      {/* Editor Area with Inline Notes */}
      <div className="flex-1 flex">
        {/* Text Editor */}
        <div className="flex-1 p-6">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => onChange(e.target.value)}
            onSelect={handleTextSelect}
            placeholder="开始您的创作之旅..."
            className="
              w-full h-full resize-none bg-transparent border-none outline-none
              text-dark-text chinese-text text-lg leading-relaxed
              placeholder-dark-text-muted
              focus:ring-0
            "
            style={{
              fontFamily: "'Source Han Serif CN', serif",
              lineHeight: 1.8,
              letterSpacing: '0.02em'
            }}
          />
        </div>

        {/* Notes Margin */}
        <div className="w-80 border-l border-gray-300 bg-gray-50 dark:bg-dark-surface dark:border-dark-border">
          {/* Notes Header */}
          <div className="sticky top-0 bg-gray-50 dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-dark-text">
                <StickyNote size={16} />
                笔记 ({notes.length})
              </div>
              {selectedTextForNote && (
                <Button
                  size="sm"
                  onClick={handleStartCreateNote}
                  className="flex items-center gap-1 text-xs px-2 py-1"
                >
                  <Plus size={12} />
                  添加笔记
                </Button>
              )}
            </div>
            {selectedTextForNote && (
              <div className="mt-2 text-xs text-dark-text-muted bg-dark-bg p-2 rounded border">
                已选择: "{selectedTextForNote.slice(0, 50)}{selectedTextForNote.length > 50 ? '...' : ''}"
              </div>
            )}
          </div>

          {/* Notes List */}
          <div className="p-3 space-y-3 max-h-96 overflow-y-auto">
            {notes.length === 0 ? (
              <div className="text-center py-8 text-dark-text-muted">
                <StickyNote size={24} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">暂无笔记</p>
                <p className="text-xs mt-1">选择文本后添加笔记</p>
              </div>
            ) : (
              notes.map((note) => (
                <div
                  key={note.id}
                  className={`p-3 rounded-lg border-l-4 bg-white dark:bg-dark-bg shadow-sm ${
                    note.linked_text
                      ? 'cursor-pointer hover:shadow-md hover:bg-gray-50 dark:hover:bg-dark-surface transition-all duration-150'
                      : ''
                  }`}
                  style={{ borderLeftColor: note.color }}
                  onClick={() => handleNoteClick(note)}
                >
                  {editingNote?.id === note.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editingNote.content}
                        onChange={(e) => setEditingNote({
                          ...editingNote,
                          content: e.target.value
                        })}
                        className="text-sm"
                        rows={3}
                      />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          {NOTE_COLORS.map((color) => (
                            <button
                              key={color.value}
                              className={`w-4 h-4 rounded-full border-2 ${
                                editingNote.color === color.value
                                  ? 'border-dark-primary'
                                  : 'border-dark-border'
                              }`}
                              style={{ backgroundColor: color.value }}
                              onClick={() => setEditingNote({
                                ...editingNote,
                                color: color.value
                              })}
                            />
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingNote(null)}
                            className="text-xs px-2 py-1"
                          >
                            取消
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleUpdateNote}
                            className="text-xs px-2 py-1"
                          >
                            保存
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-2 mb-2">
                        <div className="text-sm text-dark-text flex-1 whitespace-pre-wrap">
                          {note.content}
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          {note.linked_text && (
                            <ExternalLink size={14} className="text-dark-text-muted mt-0.5" title="点击跳转到关联文本" />
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-dark-text-muted">
                        <div className="flex items-center gap-2">
                          {note.is_ai_generated && (
                            <span className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs font-medium">
                              AI建议
                            </span>
                          )}
                          {note.note_type === 'suggestion' && !note.is_ai_generated && (
                            <span className="px-1.5 py-0.5 bg-purple-500 text-white rounded text-xs font-medium">
                              建议
                            </span>
                          )}
                          <span>{new Date(note.created_at).toLocaleString('zh-CN')}</span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingNote(note);
                            }}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-dark-border rounded"
                            title="编辑笔记"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateNoteLink(note);
                            }}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-dark-border rounded text-blue-400"
                            title="更新链接到当前选中的文本"
                          >
                            <Link size={12} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteNote(note);
                            }}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-dark-border rounded text-red-400"
                            title="删除笔记"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}

            {/* Create Note Form */}
            {isCreatingNote && (
              <div className="p-3 border-2 border-dashed border-dark-border rounded-lg bg-dark-surface">
                <div className="space-y-3">
                  <Textarea
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    placeholder="写下您的想法..."
                    className="text-sm"
                    rows={3}
                    autoFocus
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {NOTE_COLORS.map((color) => (
                        <button
                          key={color.value}
                          className={`w-4 h-4 rounded-full border-2 ${
                            selectedColor === color.value
                              ? 'border-dark-primary'
                              : 'border-dark-border'
                          }`}
                          style={{ backgroundColor: color.value }}
                          onClick={() => setSelectedColor(color.value)}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancelCreateNote}
                        className="text-xs px-2 py-1"
                      >
                        取消
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleCreateNote}
                        disabled={!newNoteContent.trim() || createNoteMutation.isPending}
                        className="text-xs px-2 py-1"
                      >
                        添加
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Panel - Stats and AI Tools */}
      <div className="flex-shrink-0 border-t border-dark-border bg-dark-surface">
        {/* Stats Bar */}
        <div className="px-6 py-2 border-b border-dark-border">
          <div className="flex items-center justify-between text-sm text-dark-text-muted">
            <div className="flex items-center gap-4">
              <span>字数: {wordCount.toLocaleString()}</span>
              <span>字符: {totalChars.toLocaleString()}</span>
              {selectedText && (
                <span className="text-dark-primary">
                  已选择: {calculateWordCount(selectedText)} 字
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedText && (
                <>
                  <Button
                    size="sm"
                    onClick={handleStartCreateNote}
                    className="flex items-center gap-1 px-3 py-1 text-xs"
                    variant="outline"
                  >
                    <StickyNote size={14} />
                    添加笔记
                  </Button>
                  <LoadingButton
                    isLoading={isAISuggestLoading}
                    onClick={handleAISuggest}
                    className="flex items-center gap-1 px-3 py-1 text-xs"
                  >
                    <Lightbulb size={14} />
                    获取建议
                  </LoadingButton>
                </>
              )}
            </div>
          </div>
        </div>

        {/* AI Continue Section */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Input
                value={guideText}
                onChange={(e) => setGuideText(e.target.value)}
                placeholder="输入写作指导（可选），让AI按您的想法续写..."
                className="bg-dark-bg border-dark-border text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <LoadingButton
                isLoading={isAIContinueLoading}
                onClick={handleAIContinue}
                disabled={isStreaming}
                className="flex items-center gap-2 px-4 py-2"
              >
                {isStreaming ? (
                  <>
                    <Zap size={16} className="animate-pulse text-yellow-400" />
                    流式生成中...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    AI续写
                  </>
                )}
              </LoadingButton>
              
              {isStreaming && (
                <Button
                  onClick={handleCancelStreaming}
                  variant="outline"
                  className="flex items-center gap-1 px-3 py-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                >
                  <X size={14} />
                  取消
                </Button>
              )}
            </div>
          </div>
          
          {guideText && (
            <div className="mt-2 text-xs text-dark-text-muted">
              AI将根据您的指导「{guideText.slice(0, 50)}{guideText.length > 50 ? '...' : ''}」进行续写
            </div>
          )}
        </div>
      </div>
      
      {/* Delete Note Confirmation Dialog */}
      <DeleteNoteConfirmDialog
        note={noteToDelete}
        isOpen={isDeleteDialogOpen}
        onClose={handleCancelDeleteNote}
        onConfirm={handleConfirmDeleteNote}
        isDeleting={deleteNoteMutation.isLoading}
      />
    </div>
  );
};