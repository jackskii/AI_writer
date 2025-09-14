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
// Using completely invisible Unicode characters for markers
const MARKER_BASE_CHARS = [
  '\u200B', // Zero-width space
  '\u200C', // Zero-width non-joiner
  '\u200D', // Zero-width joiner
  '\u2060', // Word joiner (invisible)
  '\uFEFF', // Zero-width no-break space
];

// Create unique invisible sequences for note IDs
const createInvisibleSequence = (noteId: number): string => {
  // Convert note ID to a unique combination of invisible characters
  let sequence = '';
  let id = noteId;
  
  // Use base-5 encoding with invisible characters
  do {
    sequence = MARKER_BASE_CHARS[id % 5] + sequence;
    id = Math.floor(id / 5);
  } while (id > 0);
  
  return sequence;
};

const MarkerUtils = {
  // Encode note ID as invisible Unicode characters
  encodeId: (noteId: number): string => {
    const chars = ['\uFEFF', '\u200C', '\u200D', '\u2060', '\u180E']; // 5 invisible characters for base-5
    let result = '';
    let id = noteId;
    if (id === 0) return chars[0];
    
    while (id > 0) {
      result = chars[id % 5] + result;
      id = Math.floor(id / 5);
    }
    return result;
  },

  // Create start marker for a note
  createStartMarker: (noteId: number): string => {
    const encoded = MarkerUtils.encodeId(noteId);
    return `\u200B${encoded}\u200C`; // Zero-width space + encoded ID + Zero-width non-joiner
  },

  // Create end marker for a note  
  createEndMarker: (noteId: number): string => {
    const encoded = MarkerUtils.encodeId(noteId);
    return `\u200D${encoded}\u2060`; // Zero-width joiner + encoded ID + Word joiner
  },

  // Simple text wrapping with markers - finds text and wraps it
  wrapWithMarkers: (content: string, textToWrap: string, noteId: number): string => {
    const index = content.indexOf(textToWrap);
    if (index === -1) {
      console.log(`❌ Could not find text "${textToWrap}" in content`);
      return content;
    }
    
    const startMarker = MarkerUtils.createStartMarker(noteId);
    const endMarker = MarkerUtils.createEndMarker(noteId);
    
    console.log(`✅ Wrapping text "${textToWrap}" with markers for note ${noteId} at position ${index}`);
    
    return content.slice(0, index) + 
           startMarker + 
           textToWrap + 
           endMarker + 
           content.slice(index + textToWrap.length);
  },

  // Find marker positions by scanning through content
  findMarkers: (content: string, noteId: number): { start: number; end: number } | null => {
    const startMarker = MarkerUtils.createStartMarker(noteId);
    const endMarker = MarkerUtils.createEndMarker(noteId);
    
    const startIdx = content.indexOf(startMarker);
    const endIdx = content.indexOf(endMarker);
    
    if (startIdx === -1 || endIdx === -1) {
      console.log(`❌ Markers not found for note ${noteId}`);
      return null;
    }
    
    // Return positions for textarea selection (after start marker, before end marker)
    const start = startIdx + startMarker.length;
    const end = endIdx;
    
    console.log(`✅ Found markers for note ${noteId}: positions ${start}-${end}`);
    return { start, end };
  },

  // Get text between markers by scanning
  getTextBetweenMarkers: (content: string, noteId: number): string | null => {
    const positions = MarkerUtils.findMarkers(content, noteId);
    if (!positions) return null;
    
    const textWithMarkers = content.slice(positions.start, positions.end);
    return MarkerUtils.stripAllMarkers(textWithMarkers);
  },

  // Remove markers for a specific note by scanning and replacing
  removeMarkers: (content: string, noteId: number): string => {
    const startMarker = MarkerUtils.createStartMarker(noteId);
    const endMarker = MarkerUtils.createEndMarker(noteId);
    
    return content.replace(startMarker, '').replace(endMarker, '');
  },

  // Strip all markers from text for clean display
  stripAllMarkers: (text: string): string => {
    // Remove invisible markers: start and end markers with encoded IDs
    return text.replace(/\u200B[\uFEFF\u200C\u200D\u2060\u180E]+\u200C|\u200D[\uFEFF\u200C\u200D\u2060\u180E]+\u2060/g, '');
  },

  // Check if markers exist for a note (simple scanning)
  hasMarkers: (content: string, noteId: number): boolean => {
    return MarkerUtils.findMarkers(content, noteId) !== null;
  },

  // Adjust selection range to exclude any markers (keep existing functionality)
  adjustSelectionToExcludeMarkers: (text: string, selectionStart: number, selectionEnd: number): { start: number; end: number; changed: boolean } => {
    // Regex to detect invisible marker patterns: start and end markers
    const markerRegex = /\u200B\d+\u200C|\u200D\d+\u2060/g;
    let adjustedStart = selectionStart;
    let adjustedEnd = selectionEnd;
    let changed = false;

    // Find any markers in the selection range and adjust
    const selectedText = text.slice(selectionStart, selectionEnd);
    if (markerRegex.test(selectedText)) {
      // If selection contains markers, move to exclude them
      // This is a simple approach - could be made more sophisticated
      changed = true;
    }

    return { start: adjustedStart, end: adjustedEnd, changed };
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
  
  // Initialize contentWithMarkers from content prop (only when content changes from external source)
  useEffect(() => {
    if (contentWithMarkers === '' && content) {
      console.log('🔄 Initializing contentWithMarkers from content:', content.substring(0, 100));
      setContentWithMarkers(content);
      previousContentRef.current = content;
    }
  }, [content, contentWithMarkers]);

  // Sync previousContentRef when contentWithMarkers changes from external sources
  useEffect(() => {
    previousContentRef.current = contentWithMarkers;
  }, [contentWithMarkers]);

  const queryClient = useQueryClient();

  // Fetch notes for current chapter
  const { data: notes = [] } = useQuery({
    queryKey: ['notes', work.id, chapter.id],
    queryFn: async () => {
      const response = await notesApi.list(work.id, chapter.id);
      return response.data.results || response.data;
    }
  });

  // Note: No complex marker restoration needed with the new simple approach!

  // Create note mutation
  const createNoteMutation = useMutation({
    mutationFn: (noteData: Partial<Note>) => notesApi.create(noteData),
    onSuccess: (response: any) => {
      const createdNote = response.data;
      
      // If note has linked text, wrap it with markers
      if (selectedTextForNote) {
        wrapTextWithMarkers(createdNote.id, selectedTextForNote);
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
    onSuccess: (_, deletedNote) => {
      // Remove markers from content if they exist
      const newContentWithMarkers = MarkerUtils.removeMarkers(contentWithMarkers, deletedNote.id);
      if (newContentWithMarkers !== contentWithMarkers) {
        setContentWithMarkers(newContentWithMarkers);
        onChange(newContentWithMarkers); // Save with markers
        console.log(`✅ Removed markers for deleted note ${deletedNote.id}`);
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

  // Handle text selection for suggestions with marker exclusion
  const handleTextSelect = () => {
    if (!textareaRef.current) return;
    
    const rawStart = textareaRef.current.selectionStart;
    const rawEnd = textareaRef.current.selectionEnd;
    
    if (rawStart !== rawEnd) {
      // Adjust selection to exclude markers
      const adjusted = MarkerUtils.adjustSelectionToExcludeMarkers(
        contentWithMarkers || '',
        rawStart,
        rawEnd
      );
      
      // If selection was adjusted, update the textarea selection
      if (adjusted.changed) {
        console.log(`🎯 Selection adjusted from ${rawStart}-${rawEnd} to ${adjusted.start}-${adjusted.end} to exclude markers`);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.setSelectionRange(adjusted.start, adjusted.end);
          }
        }, 0);
      }
      
      // Use clean content for getting the selected text (what user actually sees)
      const cleanContent = MarkerUtils.stripAllMarkers(contentWithMarkers || '');
      
      // Map the adjusted positions to clean content positions
      const cleanStart = MarkerUtils.stripAllMarkers((contentWithMarkers || '').slice(0, adjusted.start)).length;
      const cleanEnd = cleanStart + MarkerUtils.stripAllMarkers((contentWithMarkers || '').slice(adjusted.start, adjusted.end)).length;
      
      const selected = cleanContent.slice(cleanStart, cleanEnd);
      
      console.log(`📝 Selected text: "${selected}" at clean positions ${cleanStart}-${cleanEnd}`);
      
      setSelectedText(selected);
      setSelectionStart(cleanStart);
      setSelectionEnd(cleanEnd);
      
      // Also set for note creation (using clean positions)
      setNoteSelectionStart(cleanStart);
      setNoteSelectionEnd(cleanEnd);
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
      deleteNoteMutation.mutate(noteToDelete); // Pass the whole note object
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

    // Remove old markers and wrap new text with markers
    const contentWithoutOldMarkers = MarkerUtils.removeMarkers(contentWithMarkers, note.id);
    
    // Update content without old markers first
    setContentWithMarkers(contentWithoutOldMarkers);
    
    // Then wrap the new selected text with markers
    const newContentWithMarkers = MarkerUtils.wrapWithMarkers(
      contentWithoutOldMarkers,
      selectedText,
      note.id
    );
    
    // Update both content states
    setContentWithMarkers(newContentWithMarkers);
    onChange(newContentWithMarkers); // Save with markers
    
    console.log(`🔗 Relinked note ${note.id} to new text: "${selectedText}"`);

    // Step 3: Update the note in database with new link information
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

  // Simple function to wrap text with markers
  const wrapTextWithMarkers = (noteId: number, linkedText: string) => {
    console.log(`📌 Wrapping text with markers for note ${noteId}:`, linkedText);
    
    // Use the simple wrapping function from MarkerUtils
    const newContentWithMarkers = MarkerUtils.wrapWithMarkers(
      contentWithMarkers,
      linkedText,
      noteId
    );
    
    // Update content states
    setContentWithMarkers(newContentWithMarkers);
    onChange(newContentWithMarkers); // Save with markers
    
    return newContentWithMarkers;
  };

  // Store previous content for marker restoration
  const previousContentRef = useRef(contentWithMarkers);

  // Handle keydown to prevent marker deletion
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      const textarea = e.currentTarget;
      const cursorPos = textarea.selectionStart;
      const cursorEnd = textarea.selectionEnd;
      const text = contentWithMarkers || '';
      
      // If there's a selection, check if it contains markers
      if (cursorPos !== cursorEnd) {
        const selectedText = text.slice(cursorPos, cursorEnd);
        const markerRegex = /\u200B[\uFEFF\u200C\u200D\u2060\u180E]+\u200C|\u200D[\uFEFF\u200C\u200D\u2060\u180E]+\u2060/g;
        if (markerRegex.test(selectedText)) {
          console.log('🚫 Preventing deletion of selection containing markers');
          e.preventDefault();
          // Move cursor to start of selection
          setTimeout(() => {
            textarea.setSelectionRange(cursorPos, cursorPos);
          }, 0);
          return;
        }
      } else {
        // Single cursor position - check if we're about to delete part of a marker
        const markerRegex = /\u200B[\uFEFF\u200C\u200D\u2060\u180E]+\u200C|\u200D[\uFEFF\u200C\u200D\u2060\u180E]+\u2060/g;
        let posToCheck = cursorPos;
        if (e.key === 'Backspace' && cursorPos > 0) {
          posToCheck = cursorPos - 1;
        }
        
        // Check a wider range around the cursor for markers
        const startCheck = Math.max(0, posToCheck - 20);
        const endCheck = Math.min(text.length, posToCheck + 20);
        const surroundingText = text.slice(startCheck, endCheck);
        const matches = [...surroundingText.matchAll(/\[START_\d+\]|\[END_\d+\]/g)];
        
        for (const match of matches) {
          const markerStart = startCheck + match.index!;
          const markerEnd = markerStart + match[0].length;
          
          // Check if deletion would affect this marker
          if (e.key === 'Backspace' && cursorPos > markerStart && cursorPos <= markerEnd) {
            console.log(`🚫 Backspacing over marker: ${match[0]}, moving cursor and deleting before marker`);
            e.preventDefault();
            
            // Move cursor to before marker AND delete the character before it
            if (markerStart > 0) {
              const newContent = text.slice(0, markerStart - 1) + text.slice(markerStart);
              setContentWithMarkers(newContent);
              onChange(newContent); // Save with markers
              
              // Position cursor at the deletion point
              setTimeout(() => {
                if (textareaRef.current) {
                  textareaRef.current.setSelectionRange(markerStart - 1, markerStart - 1);
                }
              }, 0);
            } else {
              // Just move cursor if at beginning
              setTimeout(() => {
                textarea.setSelectionRange(markerStart, markerStart);
              }, 0);
            }
            return;
          } else if (e.key === 'Delete' && cursorPos >= markerStart && cursorPos < markerEnd) {
            console.log(`🚫 Deleting over marker: ${match[0]}, moving cursor and deleting after marker`);
            e.preventDefault();
            
            // Move cursor to after marker AND delete the character after it
            if (markerEnd < text.length) {
              const newContent = text.slice(0, markerEnd) + text.slice(markerEnd + 1);
              setContentWithMarkers(newContent);
              onChange(newContent); // Save with markers
              
              // Position cursor after the marker (which is now at the same position due to deletion)
              setTimeout(() => {
                if (textareaRef.current) {
                  textareaRef.current.setSelectionRange(markerEnd, markerEnd);
                }
              }, 0);
            } else {
              // Just move cursor if at end
              setTimeout(() => {
                textarea.setSelectionRange(markerEnd, markerEnd);
              }, 0);
            }
            return;
          }
        }
      }
    }
  };

  // Simple textarea content change handler - markers should never be deleted
  const handleTextareaChange = (newContentWithMarkers: string) => {
    console.log('🔥 handleTextareaChange called - no restoration needed');
    
    // Just pass through - markers should be protected by keydown handler
    setContentWithMarkers(newContentWithMarkers);
    onChange(newContentWithMarkers); // Save with markers
    
    // Update previous content reference
    previousContentRef.current = newContentWithMarkers;
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
    console.log(`🎯 handleNoteClick called for note ${note.id}`);
    
    if (!textareaRef.current) return;

    console.log('📝 ContentWithMarkers for note click:', contentWithMarkers?.substring(0, 200));
    console.log('🏷️ Looking for markers for note:', note.id);

    // Try to find markers for this note by scanning
    const markerPositions = MarkerUtils.findMarkers(contentWithMarkers, note.id);
    console.log('📍 Marker positions found:', markerPositions);
    
    if (markerPositions) {
      console.log(`✅ Markers found! Highlighting positions ${markerPositions.start}-${markerPositions.end}`);
      
      // Markers found - highlight the text between them
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(markerPositions.start, markerPositions.end);
      
      // Calculate scroll position using contentWithMarkers (not clean content)
      const textBeforePosition = contentWithMarkers.slice(0, markerPositions.start);
      const lines = textBeforePosition.split('\n');
      const lineNumber = lines.length - 1;
      const lineHeight = 30;
      const scrollPosition = lineNumber * lineHeight;
      
      textareaRef.current.scrollTop = Math.max(0, scrollPosition - 100);
      
      // Update selection state
      const linkedText = MarkerUtils.getTextBetweenMarkers(contentWithMarkers, note.id) || '';
      console.log('🔗 Linked text:', linkedText);
      setSelectedText(linkedText);
      setSelectionStart(markerPositions.start);
      setSelectionEnd(markerPositions.end);
    } else {
      console.log(`❌ No markers found for note ${note.id}`);
      // No markers found - note has no link or it was deleted, just focus editor
      textareaRef.current.focus();
    }
  };

  // AI Continue Writing - Streaming Version
  const handleAIContinue = async () => {
    if (isAIContinueLoading) return;

    try {
      setAIContinueLoading(true);
      let accumulatedContent = '';
      const startingContentWithMarkers = contentWithMarkers || content;
      const startingContent = content;
      
      const eventSource = aiApi.continueStream(
        work.id, 
        chapter.id,
        // onChunk - called for each piece of text
        (chunk: string) => {
          accumulatedContent += chunk;
          const newContent = startingContent + accumulatedContent;
          
          // Update contentWithMarkers during streaming by appending to initial state
          const newContentWithMarkers = startingContentWithMarkers + accumulatedContent;
            
          setContentWithMarkers(newContentWithMarkers);
          onChange(newContentWithMarkers);
          
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
        // Create AI-generated notes from suggestions using shared marker system
        let createdCount = 0;
        
        for (const suggestion of suggestions) {
          try {
            const response = await notesApi.create({
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
            
            // Wrap the selected text with markers for the AI suggestion
            if (selectedText) {
              wrapTextWithMarkers(response.data.id, selectedText);
            }
            
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
            value={contentWithMarkers || content}
            onChange={(e) => handleTextareaChange(e.target.value)}
            onKeyDown={handleKeyDown}
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