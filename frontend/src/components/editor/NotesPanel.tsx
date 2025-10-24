import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit3 } from 'lucide-react';
import { notesApi } from '../../services/api';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';
import { useUIStore } from '../../stores/useUIStore';
import type { Work, Chapter, Note } from '../../types';

interface NotesPanelProps {
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

export const NotesPanel: React.FC<NotesPanelProps> = ({
  work,
  chapter
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [selectedColor, setSelectedColor] = useState(NOTE_COLORS[0].value);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  
  const { addNotification } = useUIStore();
  const queryClient = useQueryClient();

  // Fetch notes for current chapter
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['notes', work.id, chapter.id],
    queryFn: async () => {
      const response = await notesApi.list(work.id, chapter.id);
      const data = response.data;
      if (Array.isArray(data)) {
        return data;
      }
      return data.results ?? [];
    }
  });

  // Create note mutation
  const createNoteMutation = useMutation({
    mutationFn: (noteData: Partial<Note>) => notesApi.create(noteData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', work.id, chapter.id] });
      setNewNoteContent('');
      setIsCreating(false);
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', work.id, chapter.id] });
      addNotification({
        type: 'success',
        message: '笔记删除成功'
      });
    }
  });

  const handleCreateNote = () => {
    if (!newNoteContent.trim()) return;

    createNoteMutation.mutate({
      work: work.id,
      chapter: chapter.id,
      content: newNoteContent,
      color: selectedColor,
      note_type: 'user'
    });
  };

  const handleUpdateNote = () => {
    if (!editingNote || !editingNote.content.trim()) return;

    updateNoteMutation.mutate({
      id: editingNote.id,
      data: editingNote
    });
  };

  const handleDeleteNote = (noteId: number) => {
    if (confirm('确定要删除这条笔记吗？')) {
      deleteNoteMutation.mutate(noteId);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-dark-text-muted">加载中...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-dark-bg">
      {/* Notes List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {notes.length === 0 ? (
          <div className="text-center py-8 text-dark-text-muted">
            <Edit3 size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">暂无笔记</p>
            <p className="text-xs mt-1">添加笔记来记录您的想法</p>
          </div>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className="p-3 rounded-lg border-l-4 bg-dark-surface"
              style={{ borderLeftColor: note.color }}
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
                          className={`w-5 h-5 rounded-full border-2 ${
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
                  <div className="text-sm text-dark-text mb-2 whitespace-pre-wrap">
                    {note.content}
                  </div>
                  <div className="flex items-center justify-between text-xs text-dark-text-muted">
                    <div className="flex items-center gap-2">
                      {note.is_ai_generated && (
                        <span className="px-1.5 py-0.5 bg-blue-900 text-blue-200 rounded">
                          AI
                        </span>
                      )}
                      <span>{new Date(note.created_at).toLocaleString('zh-CN')}</span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingNote(note)}
                        className="p-1 hover:bg-dark-border rounded"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        className="p-1 hover:bg-dark-border rounded text-red-400"
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
      </div>

      {/* Create Note Section */}
      <div className="flex-shrink-0 border-t border-dark-border bg-dark-surface p-4">
        {isCreating ? (
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
                    className={`w-5 h-5 rounded-full border-2 ${
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
                  onClick={() => {
                    setIsCreating(false);
                    setNewNoteContent('');
                  }}
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
        ) : (
          <Button
            onClick={() => setIsCreating(true)}
            variant="outline"
            size="sm"
            className="w-full flex items-center gap-2 justify-center"
          >
            <Plus size={16} />
            添加笔记
          </Button>
        )}
      </div>
    </div>
  );
};
