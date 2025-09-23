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

export const EditorPanel: React.FC<EditorPanelProps> = ({
  content,
  onChange,
  work,
  chapter
}) => {
  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const previousContentRef = useRef(content);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // State for highlighting
  const [highlightedNoteId, setHighlightedNoteId] = useState<number | undefined>(undefined);
  const [highlightPosition, setHighlightPosition] = useState<{start: number, end: number, color: string} | null>(null);

  // Track note positions dynamically
  const [notePositions, setNotePositions] = useState<Map<number, {start: number, end: number}>>(new Map());

  const {
    isAIContinueLoading,
    setAIContinueLoading,
    isAISuggestLoading,
    setAISuggestLoading,
    addNotification
  } = useUIStore();

  const queryClient = useQueryClient();

  // Fetch notes for current chapter
  const { data: notes = [] } = useQuery({
    queryKey: ['notes', work?.id, chapter?.id],
    queryFn: async () => {
      if (!work?.id || !chapter?.id) return [];
      const response = await notesApi.list(work.id, chapter.id);
      return response.data.results || response.data;
    },
    enabled: !!(work?.id && chapter?.id)
  });

  // Function to adjust positions when content changes
  const adjustPositions = (oldContent: string, newContent: string) => {
    if (oldContent === newContent) return;

    // Find the change position
    let changeStart = 0;
    while (changeStart < Math.min(oldContent.length, newContent.length) &&
           oldContent[changeStart] === newContent[changeStart]) {
      changeStart++;
    }

    // Calculate the change in length
    const oldAfterChange = oldContent.slice(changeStart);
    const newAfterChange = newContent.slice(changeStart);
    const lengthDiff = newAfterChange.length - oldAfterChange.length;

    // Update positions for notes that come after the change
    setNotePositions(prev => {
      const updated = new Map(prev);
      for (const [noteId, position] of updated) {
        if (position.start > changeStart) {
          updated.set(noteId, {
            start: Math.max(changeStart, position.start + lengthDiff),
            end: Math.max(changeStart, position.end + lengthDiff)
          });
        } else if (position.end > changeStart) {
          // Note spans across the change point, adjust end position
          updated.set(noteId, {
            start: position.start,
            end: Math.max(position.start, position.end + lengthDiff)
          });
        }
      }
      return updated;
    });
  };

  // Create note mutation
  const createNoteMutation = useMutation({
    mutationFn: (noteData: Partial<Note>) => notesApi.create(noteData),
    onSuccess: (response: any) => {
      const createdNote = response.data;

      // Add the new note position to our tracking map
      if (selectedTextForNote && noteSelectionStart !== undefined && noteSelectionEnd !== undefined) {
        setNotePositions(prev => new Map(prev.set(createdNote.id, {
          start: noteSelectionStart,
          end: noteSelectionEnd
        })));
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
    mutationFn: (note: Note) => notesApi.delete(note.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', work.id, chapter.id] });
      addNotification({
        type: 'success',
        message: '笔记删除成功'
      });
    }
  });

  // Initialize note positions from database
  useEffect(() => {
    if (notes.length > 0) {
      const newPositions = new Map();
      notes.forEach(note => {
        if (note.text_start_position !== null && note.text_end_position !== null) {
          newPositions.set(note.id, {
            start: note.text_start_position,
            end: note.text_end_position
          });
        }
      });
      setNotePositions(newPositions);
    }
  }, [notes]);

  // Track content changes to adjust positions
  useEffect(() => {
    if (previousContentRef.current !== content) {
      adjustPositions(previousContentRef.current, content);
      previousContentRef.current = content;
    }
  }, [content]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (streamEventSource) {
        streamEventSource.close();
      }
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, [streamEventSource]);

  // Early return AFTER all hooks are called
  if (!work || !chapter) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-dark-text-muted">Loading editor...</div>
      </div>
    );
  }

  // Clear highlight function
  const clearHighlight = () => {
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
    setHighlightedNoteId(undefined);
    setHighlightPosition(null);

  };

  // Highlight text in textarea using native selection
  const highlightText = (start: number, end: number) => {
    if (!editorRef.current) return;

    // Set selection range to highlight the text
    editorRef.current.setSelectionRange(start, end);
    editorRef.current.focus();
  };

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


  // Handle clicks in the editor area to clear highlights
  const handleEditorClick = () => {
    // Always clear highlights when clicking anywhere in the editor
    if (highlightPosition || highlightedNoteId !== undefined) {
      clearHighlight();
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
      deleteNoteMutation.mutate(noteToDelete);
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

    console.log(`🔗 Updating note ${note.id} link to new text: "${selectedText}"`);

    // Update the note in database with new link information
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

  // Remove exact duplicate text from AI continuation
  const removeDuplicateText = (existingContent: string, newContent: string): string => {
    if (!existingContent || !newContent) return newContent;

    // Get the last 50 characters from existing content (reasonable overlap window)
    const lastChars = existingContent.slice(-50);

    // Find the longest exact match from the end of existing content
    // that appears at the start of new content
    let maxOverlap = 0;
    for (let i = 1; i <= Math.min(lastChars.length, newContent.length); i++) {
      const endOfExisting = lastChars.slice(-i);
      const startOfNew = newContent.slice(0, i);

      if (endOfExisting === startOfNew) {
        maxOverlap = i;
      }
    }

    // Remove the duplicate part from the beginning of new content
    return maxOverlap > 0 ? newContent.slice(maxOverlap) : newContent;
  };

  // Handle note click to jump to linked position and highlight
  const handleNoteClick = (note: Note) => {
    console.log(`🎯 handleNoteClick called for note ${note.id}`);

    if (!editorRef.current) return;

    // Check if this note is already highlighted - if so, clear the highlight
    if (highlightedNoteId === note.id) {
      console.log(`🔄 Toggling off highlight for note ${note.id}`);
      clearHighlight();
      return;
    }

    // Get current position from our tracking map
    const position = notePositions.get(note.id);

    if (position && position.start <= content.length && position.end <= content.length) {
      console.log(`✅ Found note position: ${position.start}-${position.end}`);

      // Clear any existing highlight timeout
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }

      // Set highlighting with note's color
      setHighlightedNoteId(note.id);
      setHighlightPosition({
        start: position.start,
        end: position.end,
        color: note.color
      });

      // Highlight text using native textarea selection
      highlightText(position.start, position.end);

      // Update selection state with current text at position (for other functionality)
      const currentText = content.slice(position.start, position.end);
      setSelectedText(currentText);
      setSelectionStart(position.start);
      setSelectionEnd(position.end);

      console.log(`📝 Highlighting text: "${currentText}" at positions ${position.start}-${position.end}`);

      // Clear highlight after 10 seconds
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedNoteId(undefined);
        setHighlightPosition(null);
        highlightTimeoutRef.current = null;
      }, 10000);
    } else {
      console.log(`❌ No valid position found for note ${note.id}`);
      // Just focus editor if no valid position
      if (editorRef.current) {
        editorRef.current.focus();
      }
    }
  };

  // AI Continue Writing - Streaming Version
  const handleAIContinue = async () => {
    if (isAIContinueLoading) return;

    try {
      setAIContinueLoading(true);
      let accumulatedContent = '';
      let isFirstChunk = true;
      const startingContent = content;

      const eventSource = aiApi.continueStream(
        work.id,
        chapter.id,
        // onChunk - called for each piece of text
        (chunk: string) => {
          accumulatedContent += chunk;

          // Apply duplicate removal only on the first chunk or complete accumulated content
          let cleanedContent = accumulatedContent;
          if (isFirstChunk) {
            cleanedContent = removeDuplicateText(startingContent, accumulatedContent);
            accumulatedContent = cleanedContent; // Update accumulated content with cleaned version
            isFirstChunk = false;
          }

          const newContent = startingContent + cleanedContent;
          onChange(newContent);

          // Keep cursor at end during streaming
          if (editorRef.current) {
            setTimeout(() => {
              if (editorRef.current) {
                const model = editorRef.current.getModel();
                if (model) {
                  const endPosition = model.getPositionAt(newContent.length);
                  editorRef.current.setPosition(endPosition);
                  editorRef.current.focus();
                }
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
          if (editorRef.current) {
            setTimeout(() => {
              if (editorRef.current) {
                const model = editorRef.current.getModel();
                if (model) {
                  const endPosition = model.getPositionAt(finalContent.length);
                  editorRef.current.setPosition(endPosition);
                  editorRef.current.focus();
                }
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
    <>
      {/* CSS for textarea highlighting */}
      <style>{`
        .writing-textarea::selection {
          background-color: ${highlightPosition?.color ? `${highlightPosition.color}60` : '#3b82f680'} !important;
          color: inherit !important;
        }

        .writing-textarea::-moz-selection {
          background-color: ${highlightPosition?.color ? `${highlightPosition.color}60` : '#3b82f680'} !important;
          color: inherit !important;
        }
      `}</style>

      <div className="h-full flex flex-col bg-dark-bg">
      {/* Editor Area with Inline Notes */}
      <div className="flex-1 flex">
        {/* Notes Margin */}
        <div className="w-80 border-r border-gray-300 bg-gray-50 dark:bg-dark-surface dark:border-dark-border">
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

        {/* Text Editor - Middle Panel */}
        <div className="flex-1 bg-black p-4">
          <textarea
            ref={(el) => {
              editorRef.current = el as any; // Type assertion for compatibility
            }}
            value={content}
            onChange={(e) => {
              onChange(e.target.value);
              updateNotePositions();
            }}
            onSelect={(e) => {
              const target = e.target as HTMLTextAreaElement;
              const start = target.selectionStart;
              const end = target.selectionEnd;

              if (start !== end) {
                const selectedText = target.value.slice(start, end);
                setSelectedText(selectedText);
                setSelectionStart(start);
                setSelectionEnd(end);
                setNoteSelectionStart(start);
                setNoteSelectionEnd(end);
                setSelectedTextForNote(selectedText);
              } else {
                setSelectedText('');
                setSelectedTextForNote('');
              }
            }}
            onClick={handleEditorClick}
            className="w-full h-full bg-black text-white border-none outline-none resize-none writing-textarea"
            style={{
              fontFamily: "'Source Han Serif CN', serif",
              fontSize: '18px',
              lineHeight: '28.8px',
              letterSpacing: '0.02em',
              padding: '16px',
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
            }}
            placeholder="开始写作..."
          />
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
    </>
  );
};