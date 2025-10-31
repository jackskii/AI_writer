import React, { useState, useRef, useEffect } from 'react';
import { isAxiosError, type AxiosResponse } from 'axios';
import { Lightbulb, X, Plus, Edit3, Trash2, StickyNote, ExternalLink, Link, Wand2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { LoadingButton } from '../ui/Loading';
import { useUIStore } from '../../stores/useUIStore';
import { aiApi, notesApi, autoEditApi } from '../../services/api';
import { DeleteNoteConfirmDialog } from '../modals/DeleteNoteConfirmDialog';
import type { Work, Chapter, Note, AutoEdit } from '../../types';

interface EditorPanelProps {
  content: string;
  onChange: (content: string) => void;
  work: Work;
  chapter: Chapter;
  onSave?: () => void;
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
  chapter,
  onSave
}) => {
  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const previousContentRef = useRef(content);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isManualUpdateRef = useRef(false); // Flag to prevent double-adjustment during version switching

  const [selectedText, setSelectedText] = useState('');
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);

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

  // Auto-edit related states
  const [isAutoEditLoading, setIsAutoEditLoading] = useState(false);
  const [autoEdits, setAutoEdits] = useState<Map<number, AutoEdit>>(new Map()); // Track auto-edits by id
  const [autoEditPositions, setAutoEditPositions] = useState<Map<number, {start: number, end: number}>>(new Map());
  const [selectedAutoEdit, setSelectedAutoEdit] = useState<AutoEdit | null>(null);
  const [showVersionPopup, setShowVersionPopup] = useState(false);
  const [versionPopupPosition, setVersionPopupPosition] = useState<{x: number, y: number} | null>(null);

  const {
    isAISuggestLoading,
    setAISuggestLoading,
    addNotification
  } = useUIStore();

  const queryClient = useQueryClient();

  // Fetch notes for current chapter
  const { data: notes = [] } = useQuery<Note[]>({
    queryKey: ['notes', work?.id, chapter?.id],
    queryFn: async () => {
      if (!work?.id || !chapter?.id) return [];
      const response = await notesApi.list(work.id, chapter.id);
      const data = response.data;
      if (Array.isArray(data)) {
        return data;
      }
      return data.results ?? [];
    },
    enabled: !!(work?.id && chapter?.id)
  });

  // Fetch auto-edits for current chapter
  const { data: fetchedAutoEdits = [] } = useQuery({
    queryKey: ['autoEdits', chapter?.id],
    queryFn: async () => {
      if (!chapter?.id) return [];
      const response = await autoEditApi.list(chapter.id);
      return response.data;
    },
    enabled: !!chapter?.id
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

    // Update positions for auto-edits that come after the change
    setAutoEditPositions(prev => {
      const updated = new Map(prev);
      for (const [autoEditId, position] of updated) {
        if (position.start > changeStart) {
          updated.set(autoEditId, {
            start: Math.max(changeStart, position.start + lengthDiff),
            end: Math.max(changeStart, position.end + lengthDiff)
          });
        } else if (position.end > changeStart) {
          // Auto-edit spans across the change point, adjust end position
          updated.set(autoEditId, {
            start: position.start,
            end: Math.max(position.start, position.end + lengthDiff)
          });
        }
      }
      return updated;
    });
  };

  // Create note mutation
  const createNoteMutation = useMutation<AxiosResponse<Note>, unknown, Partial<Note>>({
    mutationFn: (noteData: Partial<Note>) => notesApi.create(noteData),
    onSuccess: (response) => {
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
      notes.forEach((note: Note) => {
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

  // Initialize auto-edit positions and data from database
  useEffect(() => {
    if (fetchedAutoEdits.length > 0) {
      const newAutoEdits = new Map();
      const newPositions = new Map();
      fetchedAutoEdits.forEach((autoEdit: AutoEdit) => {
        newAutoEdits.set(autoEdit.id, autoEdit);
        newPositions.set(autoEdit.id, {
          start: autoEdit.text_start_position,
          end: autoEdit.text_end_position
        });
      });
      setAutoEdits(newAutoEdits);
      setAutoEditPositions(newPositions);
    }
  }, [fetchedAutoEdits]);

  // Track content changes and adjust positions
  useEffect(() => {
    if (previousContentRef.current !== content) {
      // Skip auto-adjustment if this is a manual update (version switch, auto-edit, etc.)
      if (!isManualUpdateRef.current) {
        adjustPositions(previousContentRef.current, content);
      } else {
        // Reset the flag after skipping
        isManualUpdateRef.current = false;
      }
      previousContentRef.current = content;
    }
  }, [content]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

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


  // Function to update note positions (stub for compatibility)
  const updateNotePositions = () => {
    // Note positions are updated automatically via the useEffect that watches content changes
  };

  // Handle clicks in the editor area
  const handleEditorClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    // Get cursor position
    const target = e.target as HTMLTextAreaElement;
    const cursorPos = target.selectionStart;

    console.log('Editor clicked at position:', cursorPos);

    // Check if click is in an auto-edited region
    let clickedAutoEdit: AutoEdit | null = null;

    for (const [autoEditId, position] of autoEditPositions) {
      if (cursorPos >= position.start && cursorPos <= position.end) {
        clickedAutoEdit = autoEdits.get(autoEditId) || null;
        console.log('Clicked in auto-edit region:', autoEditId, position);
        break;
      }
    }

    if (clickedAutoEdit) {
      // Show version popup
      setSelectedAutoEdit(clickedAutoEdit);
      setShowVersionPopup(true);

      // Position popup in the left note section
      // Calculate position to ensure bottom is visible
      const viewportHeight = window.innerHeight;
      const popupHeight = 600; // Max height of popup
      const topPosition = Math.min(e.clientY, viewportHeight - popupHeight - 20);

      setVersionPopupPosition({
        x: 20, // 20px from left edge (in the notes section)
        y: Math.max(20, topPosition) // At least 20px from top
      });
    } else {
      // Close popup if clicking outside auto-edit regions
      setShowVersionPopup(false);
      setSelectedAutoEdit(null);
    }

    // Clear note highlights when clicking anywhere in the editor
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
          const suggestionContent = typeof suggestion === 'string'
            ? suggestion
            : suggestion?.content ?? '';

          try {
            await notesApi.create({
              work: work.id,
              chapter: chapter.id,
              content: suggestionContent,
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

  // AI Auto-Edit for selected text
  const handleAutoEdit = async () => {
    if (isAutoEditLoading || !selectedText) return;

    // Check if any auto-edit already exists in this chapter
    if (autoEdits.size > 0) {
      addNotification({
        type: 'info',
        message: '当前章节已有自动编辑，请先确认或还原现有编辑'
      });
      return;
    }

    try {
      setIsAutoEditLoading(true);
      console.log('Starting auto-edit for text:', selectedText.slice(0, 50));

      addNotification({
        type: 'info',
        message: 'AI自动编辑开始...'
      });

      // Call non-streaming auto-edit API
      const response = await aiApi.autoEdit(work.id, chapter.id, selectedText);
      const finalEditedText = response.data.edited_text;

      console.log('Auto-edit completed');

      // Create AutoEdit record in backend (without versions first)
      try {
        console.log('Creating AutoEdit record...');

        // Step 1: Create the AutoEdit record
        const createResponse = await autoEditApi.create({
          work: work.id,
          chapter: chapter.id,
          text_start_position: selectionStart,
          text_end_position: selectionEnd,
          original_text: selectedText,
          active_version_index: 0, // Start with original (version 0)
        });

        console.log('AutoEdit created:', createResponse.data);
        const createdAutoEdit = createResponse.data;

        // Step 2: Add the first edited version
        console.log('Adding version with text length:', finalEditedText.length);
        const versionResponse = await autoEditApi.addVersion(
          createdAutoEdit.id,
          finalEditedText
        );

        console.log('Version added:', versionResponse.data);
        const updatedAutoEdit = versionResponse.data;

        // Step 3: Update the AutoEdit's end position to match the edited text length
        // (Since we switched to version 1 which has a different length than original)
        const newEndPosition = selectionStart + finalEditedText.length;
        console.log('Updating end position from', selectionEnd, 'to', newEndPosition);

        await autoEditApi.update(updatedAutoEdit.id, {
          text_end_position: newEndPosition
        });

        // Set flag to prevent auto-adjustment
        isManualUpdateRef.current = true;

        // Replace text in editor
        const newContent = content.slice(0, selectionStart) + finalEditedText + content.slice(selectionEnd);
        onChange(newContent);

        console.log('Replaced text with auto-edit:', updatedAutoEdit.id);

        // Track the auto-edit with updated position
        setAutoEdits(prev => new Map(prev).set(updatedAutoEdit.id, updatedAutoEdit));
        setAutoEditPositions(prev => new Map(prev).set(updatedAutoEdit.id, {
          start: selectionStart,
          end: newEndPosition
        }));

        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['autoEdits', chapter.id] });

        addNotification({
          type: 'success',
          message: 'AI自动编辑完成'
        });

      } catch (error: unknown) {
        console.error('Failed to save auto-edit:', error);
        if (isAxiosError(error) && error.response?.data) {
          console.error('Error response:', error.response.data);
        }
        addNotification({
          type: 'error',
          message: `保存编辑失败: ${
            isAxiosError(error)
              ? error.response?.data?.detail || error.message
              : '未知错误'
          }`
        });
      }

      setIsAutoEditLoading(false);

    } catch (error) {
      console.error('Auto-edit error:', error);
      setIsAutoEditLoading(false);
      addNotification({
        type: 'error',
        message: 'AI自动编辑失败，请稍后重试'
      });
    }
  };

  // Handle version switching
  const handleSwitchVersion = async (autoEdit: AutoEdit, versionIndex: number) => {
    try {
      console.log('Switching to version:', versionIndex);

      // Call API to switch version
      const response = await autoEditApi.switchVersion(autoEdit.id, versionIndex);
      const updatedAutoEdit = response.data;

      // Get the text for the selected version
      let versionText: string;
      if (versionIndex === 0) {
        versionText = updatedAutoEdit.original_text;
      } else {
        const version = updatedAutoEdit.versions.find(v => v.version_number === versionIndex);
        versionText = version?.edited_text || updatedAutoEdit.original_text;
      }

      // Get current position of this auto-edit
      const position = autoEditPositions.get(autoEdit.id);
      if (!position) return;

      // Calculate new end position
      const newEndPosition = position.start + versionText.length;
      const lengthDiff = newEndPosition - position.end;

      console.log('Version switch - positions:', {
        start: position.start,
        oldEnd: position.end,
        newEnd: newEndPosition,
        lengthDiff
      });

      // Update the backend with the new end position
      await autoEditApi.update(updatedAutoEdit.id, {
        text_end_position: newEndPosition
      });

      console.log('Updated backend position from', position.end, 'to', newEndPosition);

      // Set flag to prevent auto-adjustment
      isManualUpdateRef.current = true;

      // Replace text in editor
      const newContent = content.slice(0, position.start) + versionText + content.slice(position.end);
      onChange(newContent);

      console.log('Switched version for auto-edit:', autoEdit.id);

      // Update the auto-edit position in local state FIRST
      setAutoEditPositions(prev => {
        const updated = new Map(prev);
        updated.set(updatedAutoEdit.id, {
          start: position.start,
          end: newEndPosition
        });

        // Adjust positions of all auto-edits that come after this one
        for (const [otherAutoEditId, otherPosition] of prev) {
          if (otherAutoEditId !== autoEdit.id && otherPosition.start >= position.end) {
            const newOtherStart = otherPosition.start + lengthDiff;
            const newOtherEnd = otherPosition.end + lengthDiff;

            updated.set(otherAutoEditId, {
              start: newOtherStart,
              end: newOtherEnd
            });

            // Also update backend for these auto-edits
            const otherAutoEdit = autoEdits.get(otherAutoEditId);
            if (otherAutoEdit) {
              autoEditApi.update(otherAutoEditId, {
                text_start_position: newOtherStart,
                text_end_position: newOtherEnd
              }).catch(err => {
                console.error('Failed to update position for auto-edit', otherAutoEditId, err);
              });
            }
          }
        }
        return updated;
      });

      // Adjust note positions that come after
      setNotePositions(prev => {
        const updated = new Map(prev);
        for (const [noteId, notePosition] of prev) {
          if (notePosition.start >= position.end) {
            const newNoteStart = notePosition.start + lengthDiff;
            const newNoteEnd = notePosition.end + lengthDiff;

            updated.set(noteId, {
              start: newNoteStart,
              end: newNoteEnd
            });

            // Also update backend for these notes
            const note = notes.find((n: Note) => n.id === noteId);
            if (note) {
              notesApi.update(noteId, {
                text_start_position: newNoteStart,
                text_end_position: newNoteEnd
              }).catch(err => {
                console.error('Failed to update position for note', noteId, err);
              });
            }
          }
        }
        return updated;
      });

      // Update the auto-edit in state with new position
      const updatedAutoEditWithPosition = {
        ...updatedAutoEdit,
        text_end_position: newEndPosition
      };
      setAutoEdits(prev => new Map(prev).set(updatedAutoEditWithPosition.id, updatedAutoEditWithPosition));

      // Update selected auto-edit
      setSelectedAutoEdit(updatedAutoEditWithPosition);

      // Invalidate queries to ensure data consistency
      queryClient.invalidateQueries({ queryKey: ['autoEdits', chapter.id] });
      queryClient.invalidateQueries({ queryKey: ['notes', work.id, chapter.id] });

      addNotification({
        type: 'success',
        message: versionIndex === 0 ? '已切换到原始文本' : `已切换到版本 ${versionIndex}`
      });

    } catch (error) {
      console.error('Failed to switch version:', error);
      addNotification({
        type: 'error',
        message: '切换版本失败'
      });
    }
  };

  // Handle confirming auto-edit (accept current version as plain text)
  const handleConfirmAutoEdit = async (autoEdit: AutoEdit) => {
    try {
      console.log('Confirming auto-edit:', autoEdit.id);

      // Delete the AutoEdit record from backend
      await autoEditApi.delete(autoEdit.id);

      // Remove from local state
      setAutoEdits(prev => {
        const updated = new Map(prev);
        updated.delete(autoEdit.id);
        return updated;
      });

      setAutoEditPositions(prev => {
        const updated = new Map(prev);
        updated.delete(autoEdit.id);
        return updated;
      });

      // Close popup
      setShowVersionPopup(false);
      setSelectedAutoEdit(null);

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['autoEdits', chapter.id] });

      addNotification({
        type: 'success',
        message: '已确认编辑，文本已转为普通文本'
      });

    } catch (error) {
      console.error('Failed to confirm auto-edit:', error);
      addNotification({
        type: 'error',
        message: '确认编辑失败'
      });
    }
  };

  // Handle reverting auto-edit (revert to original then remove)
  const handleRevertAutoEdit = async (autoEdit: AutoEdit) => {
    try {
      console.log('Reverting auto-edit:', autoEdit.id);

      // Get current position
      const position = autoEditPositions.get(autoEdit.id);
      if (!position) return;

      // Calculate length difference between current version and original
      const currentText = content.slice(position.start, position.end);
      const originalText = autoEdit.original_text;
      const lengthDiff = originalText.length - currentText.length;

      // Set flag to prevent auto-adjustment
      isManualUpdateRef.current = true;

      // Replace with original text
      const newContent = content.slice(0, position.start) + originalText + content.slice(position.end);
      onChange(newContent);

      // Adjust positions of auto-edits and notes that come after
      setAutoEditPositions(prev => {
        const updated = new Map(prev);
        for (const [otherAutoEditId, otherPosition] of prev) {
          if (otherAutoEditId !== autoEdit.id && otherPosition.start >= position.end) {
            updated.set(otherAutoEditId, {
              start: otherPosition.start + lengthDiff,
              end: otherPosition.end + lengthDiff
            });
          }
        }
        // Remove this auto-edit
        updated.delete(autoEdit.id);
        return updated;
      });

      setNotePositions(prev => {
        const updated = new Map(prev);
        for (const [noteId, notePosition] of prev) {
          if (notePosition.start >= position.end) {
            updated.set(noteId, {
              start: notePosition.start + lengthDiff,
              end: notePosition.end + lengthDiff
            });
          }
        }
        return updated;
      });

      // Delete the AutoEdit record from backend
      await autoEditApi.delete(autoEdit.id);

      // Remove from local state
      setAutoEdits(prev => {
        const updated = new Map(prev);
        updated.delete(autoEdit.id);
        return updated;
      });

      // Close popup
      setShowVersionPopup(false);
      setSelectedAutoEdit(null);

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['autoEdits', chapter.id] });

      addNotification({
        type: 'success',
        message: '已还原到原始文本'
      });

    } catch (error) {
      console.error('Failed to revert auto-edit:', error);
      addNotification({
        type: 'error',
        message: '还原失败'
      });
    }
  };

  // Handle creating new edit from original
  const handleCreateNewEditFromOriginal = async (autoEdit: AutoEdit) => {
    try {
      console.log('Creating new edit from original for:', autoEdit.id);

      setIsAutoEditLoading(true);
      setShowVersionPopup(false);

      addNotification({
        type: 'info',
        message: '正在生成新版本...'
      });

      // Call non-streaming auto-edit API
      const response = await aiApi.autoEdit(work.id, chapter.id, autoEdit.original_text);
      const finalEditedText = response.data.edited_text;

      console.log('New auto-edit completed');

      try {
        // Add new version to existing AutoEdit
        const versionResponse = await autoEditApi.addVersion(
          autoEdit.id,
          finalEditedText
        );

        const updatedAutoEdit: AutoEdit = versionResponse.data;

            // Get current position
            const position = autoEditPositions.get(autoEdit.id);
            if (!position) return;

            // Calculate length difference
            const oldLength = position.end - position.start;
            const newLength = finalEditedText.length;
            const lengthDiff = newLength - oldLength;

            // Calculate new end position
            const newEndPosition = position.start + newLength;

            // Update backend position
            await autoEditApi.update(autoEdit.id, {
              text_end_position: newEndPosition
            });

            console.log('Updated backend position after new version from', position.end, 'to', newEndPosition);

            // Set flag to prevent auto-adjustment
            isManualUpdateRef.current = true;

            // Replace text in editor
            const newContent = content.slice(0, position.start) + finalEditedText + content.slice(position.end);
            onChange(newContent);

            console.log('Created new version for auto-edit:', autoEdit.id);

            // Update the auto-edit in state with new position
            const updatedAutoEditWithPosition: AutoEdit = {
              ...updatedAutoEdit,
              text_end_position: newEndPosition
            };
            setAutoEdits(prev => new Map(prev).set(updatedAutoEditWithPosition.id, updatedAutoEditWithPosition));

            // Update position immediately in local state
            setAutoEditPositions(prev => {
              const updated = new Map(prev);
              updated.set(autoEdit.id, {
                start: position.start,
                end: newEndPosition
              });

              // Adjust positions of all auto-edits that come after this one
              for (const [otherAutoEditId, otherPosition] of prev) {
                if (otherAutoEditId !== autoEdit.id && otherPosition.start > position.end) {
                  const newOtherStart = otherPosition.start + lengthDiff;
                  const newOtherEnd = otherPosition.end + lengthDiff;

                  updated.set(otherAutoEditId, {
                    start: newOtherStart,
                    end: newOtherEnd
                  });

                  // Also update backend for these auto-edits
                  const otherAutoEdit = autoEdits.get(otherAutoEditId);
                  if (otherAutoEdit) {
                    autoEditApi.update(otherAutoEditId, {
                      text_start_position: newOtherStart,
                      text_end_position: newOtherEnd
                    }).catch(err => {
                      console.error('Failed to update position for auto-edit', otherAutoEditId, err);
                    });
                  }
                }
              }
              return updated;
            });

            // Also adjust note positions that come after
            setNotePositions(prev => {
              const updated = new Map(prev);
              for (const [noteId, notePosition] of prev) {
                if (notePosition.start > position.end) {
                  const newNoteStart = notePosition.start + lengthDiff;
                  const newNoteEnd = notePosition.end + lengthDiff;

                  updated.set(noteId, {
                    start: newNoteStart,
                    end: newNoteEnd
                  });

                  // Also update backend for these notes
                  const note = notes.find((n: Note) => n.id === noteId);
                  if (note) {
                    notesApi.update(noteId, {
                      text_start_position: newNoteStart,
                      text_end_position: newNoteEnd
                    }).catch(err => {
                      console.error('Failed to update position for note', noteId, err);
                    });
                  }
                }
              }
              return updated;
            });

            queryClient.invalidateQueries({ queryKey: ['autoEdits', chapter.id] });
            queryClient.invalidateQueries({ queryKey: ['notes', work.id, chapter.id] });

        addNotification({
          type: 'success',
          message: '新版本生成完成'
        });

        setIsAutoEditLoading(false);

      } catch (error: unknown) {
        console.error('Failed to save new version:', error);
        setIsAutoEditLoading(false);
        addNotification({
          type: 'error',
          message: `保存新版本失败: ${
            isAxiosError(error)
              ? error.response?.data?.detail || error.message
              : '未知错误'
          }`
        });
      }

    } catch (error) {
      console.error('Create new edit error:', error);
      setIsAutoEditLoading(false);
      addNotification({
        type: 'error',
        message: '生成新版本失败'
      });
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

  const totalWords = calculateWordCount(content);
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
              notes.map((note: Note) => (
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
                        value={editingNote?.content || ''}
                        onChange={(e) => editingNote && setEditingNote({
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
                                editingNote?.color === color.value
                                  ? 'border-dark-primary'
                                  : 'border-dark-border'
                              }`}
                              style={{ backgroundColor: color.value }}
                              onClick={() => editingNote && setEditingNote({
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
                            <div title="点击跳转到关联文本">
                              <ExternalLink size={14} className="text-dark-text-muted mt-0.5" />
                            </div>
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
            ref={editorRef}
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
            onKeyDown={(e) => {
              // Handle Ctrl+S (Windows/Linux) or Cmd+S (Mac) to save
              if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault(); // Prevent browser's default save dialog
                if (onSave) {
                  onSave();
                  addNotification({
                    type: 'success',
                    message: '已保存'
                  });
                }
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
        {/* Stats Bar - Fixed height */}
        <div className="px-6 py-2 border-b border-dark-border h-[48px] flex items-center">
          <div className="flex items-center justify-between text-sm text-dark-text-muted w-full">
            <div className="flex items-center gap-4">
              <span>字数: {totalWords.toLocaleString()}</span>
              <span>字符: {totalChars.toLocaleString()}</span>
              {selectedText && (
                <span className="text-dark-primary">
                  已选择: {calculateWordCount(selectedText)} 字
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 min-h-[32px]">
              {selectedText ? (
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
                  <LoadingButton
                    isLoading={isAutoEditLoading}
                    onClick={handleAutoEdit}
                    disabled={autoEdits.size > 0}
                    className="flex items-center gap-1 px-3 py-1 text-xs"
                  >
                    <Wand2 size={14} />
                    自动编辑
                    {autoEdits.size > 0 && <span className="text-xs">(已有编辑)</span>}
                  </LoadingButton>
                </>
              ) : (
                <div className="h-[32px]"></div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Delete Note Confirmation Dialog */}
      <DeleteNoteConfirmDialog
        note={noteToDelete}
        isOpen={isDeleteDialogOpen}
        onClose={handleCancelDeleteNote}
        onConfirm={handleConfirmDeleteNote}
        isDeleting={deleteNoteMutation.isPending}
      />

      {/* Version Selection Popup */}
      {showVersionPopup && selectedAutoEdit && versionPopupPosition && (
        <div
          className="fixed z-50 bg-dark-surface border border-dark-border rounded-lg shadow-xl p-4 w-[280px]"
          style={{
            left: `${versionPopupPosition.x}px`,
            top: `${versionPopupPosition.y}px`,
            maxHeight: '600px',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Header - Fixed */}
          <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <h3 className="text-sm font-medium text-dark-text">选择版本</h3>
            <button
              onClick={() => setShowVersionPopup(false)}
              className="text-dark-text-muted hover:text-dark-text"
            >
              <X size={16} />
            </button>
          </div>

          {/* Versions List - Scrollable */}
          <div className="space-y-2 overflow-y-auto flex-1 mb-3" style={{ maxHeight: '300px' }}>
            {/* Original Version */}
            <button
              onClick={() => handleSwitchVersion(selectedAutoEdit, 0)}
              className={`w-full text-left p-3 rounded border transition-colors ${
                selectedAutoEdit.active_version_index === 0
                  ? 'bg-dark-primary/20 border-dark-primary text-dark-text'
                  : 'bg-dark-bg border-dark-border text-dark-text-muted hover:border-dark-primary'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">原始文本</span>
                {selectedAutoEdit.active_version_index === 0 && (
                  <span className="text-xs text-dark-primary">当前</span>
                )}
              </div>
              <div className="text-xs max-h-[60px] overflow-y-auto text-left whitespace-pre-wrap break-words">
                {selectedAutoEdit.original_text}
              </div>
            </button>

            {/* Edited Versions */}
            {selectedAutoEdit.versions
              .sort((a, b) => a.version_number - b.version_number)
              .map((version) => (
                <button
                  key={version.id}
                  onClick={() => handleSwitchVersion(selectedAutoEdit, version.version_number)}
                  className={`w-full text-left p-3 rounded border transition-colors ${
                    selectedAutoEdit.active_version_index === version.version_number
                      ? 'bg-dark-primary/20 border-dark-primary text-dark-text'
                      : 'bg-dark-bg border-dark-border text-dark-text-muted hover:border-dark-primary'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">版本 {version.version_number}</span>
                    {selectedAutoEdit.active_version_index === version.version_number && (
                      <span className="text-xs text-dark-primary">当前</span>
                    )}
                  </div>
                  <div className="text-xs max-h-[60px] overflow-y-auto text-left whitespace-pre-wrap break-words">
                    {version.edited_text}
                  </div>
                </button>
              ))}
          </div>

          {/* Action Buttons - Fixed at bottom */}
          <div className="pt-3 border-t border-dark-border flex-shrink-0">
            <LoadingButton
              isLoading={isAutoEditLoading}
              onClick={() => handleCreateNewEditFromOriginal(selectedAutoEdit)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm mb-2"
              variant="outline"
            >
              <Wand2 size={14} />
              从原文生成新版本
            </LoadingButton>

            {/* Confirm and Revert Actions */}
            <div className="flex gap-2">
              <Button
                onClick={() => handleConfirmAutoEdit(selectedAutoEdit)}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm bg-green-600 hover:bg-green-700 text-white"
              >
                <span>✓</span>
                确认编辑
              </Button>
              <Button
                onClick={() => handleRevertAutoEdit(selectedAutoEdit)}
                variant="outline"
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
              >
                <span>↺</span>
                还原原文
              </Button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
};
