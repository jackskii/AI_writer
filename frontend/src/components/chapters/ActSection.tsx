import React, { useState } from 'react';
import { ChevronDown, ChevronRight, BookOpen, Plus, Edit2, Trash2, FileText } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Button } from '../ui/Button';
import { ChapterListItem } from './ChapterListItem';
import type { Act, Chapter } from '../../types';

interface ActSectionProps {
  actData: Act;
  chapters: Chapter[];
  onChapterClick: (chapter: Chapter) => void;
  onChapterDelete: (chapter: Chapter) => void;
  onChapterSummary: (chapter: Chapter) => void;
  onCreateChapter: (actId: number) => void;
  onEditActName: (actId: number, currentName?: string) => void;
  onDeleteAct: (actId: number) => void;
  onReorderChapters: (actId: number, chapterIds: number[]) => void;
  onActSynopsis: (act: Act) => void;
}

export const ActSection: React.FC<ActSectionProps> = ({
  actData,
  chapters,
  onChapterClick,
  onChapterDelete,
  onChapterSummary,
  onCreateChapter,
  onEditActName,
  onDeleteAct,
  onReorderChapters,
  onActSynopsis
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [localChapters, setLocalChapters] = useState(chapters);

  // Update local chapters when props change
  React.useEffect(() => {
    setLocalChapters(chapters);
  }, [chapters]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const toggleCollapsed = () => {
    setIsCollapsed(prev => !prev);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localChapters.findIndex((c) => c.id === active.id);
      const newIndex = localChapters.findIndex((c) => c.id === over.id);

      const newChapters = arrayMove(localChapters, oldIndex, newIndex);
      setLocalChapters(newChapters);

      // Call API to reorder
      const chapterIds = newChapters.map(c => c.id);
      onReorderChapters(actData.id, chapterIds);
    }
  };

  const totalWords = localChapters.reduce((sum, chapter) => sum + chapter.word_count, 0);
  const displayName = actData.name || `第${actData.order}卷`;
  const hasSynopsis = actData.synopsis && actData.synopsis.trim().length > 0;
  const isSideChapters = actData.act_type === 'side_chapters';

  return (
    <div className="space-y-1">
      {/* Act Header */}
      <div
        className="flex items-center justify-between p-3 bg-dark-surface/30 rounded-lg cursor-pointer hover:bg-dark-surface/50 transition-colors group border border-dark-border/30"
        onClick={toggleCollapsed}
      >
        <div className="flex items-center gap-3">
          {isCollapsed ? (
            <ChevronRight size={16} className="text-dark-text-muted group-hover:text-dark-text transition-colors" />
          ) : (
            <ChevronDown size={16} className="text-dark-text-muted group-hover:text-dark-text transition-colors" />
          )}
          
          <div className="flex items-center gap-2">
            {/* Hide icon on mobile */}
            {isSideChapters ? (
              <FileText size={16} className="text-dark-text-muted hidden md:block" />
            ) : (
              <BookOpen size={16} className="text-dark-primary hidden md:block" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`font-medium text-sm md:text-base ${isSideChapters ? 'text-dark-text-muted' : 'text-dark-text'}`}>
                  {displayName}
                </h3>
                {isSideChapters && (
                  <span className="px-2 py-0.5 text-xs bg-dark-surface border border-dark-border rounded text-dark-text-muted">
                    外传
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditActName(actData.id, actData.name);
                  }}
                  className="h-8 w-8 p-1 bg-dark-surface/50 hover:bg-dark-primary/20 text-dark-text/70 hover:text-dark-primary transition-all rounded"
                  title="编辑卷名"
                >
                  <Edit2 size={16} />
                </Button>
              </div>
              <p className="text-xs text-dark-text-muted">
                {chapters.length}章 · {totalWords.toLocaleString()}字
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 md:gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onActSynopsis(actData);
            }}
            className={`${hasSynopsis ? 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20 hover:border-green-500/50' : 'bg-dark-surface/50 border-dark-border text-dark-text-muted hover:bg-dark-primary/20 hover:text-dark-primary'} text-xs px-2 md:px-3 py-1 h-7 flex items-center gap-0.5 md:gap-1 font-medium`}
            title={hasSynopsis ? "编辑卷摘要" : "生成卷摘要"}
          >
            {/* Hide icon on mobile */}
            <FileText size={12} className="hidden md:block" />
            摘要
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onCreateChapter(actData.id);
            }}
            className="bg-dark-primary/10 border-dark-primary/30 text-dark-primary hover:bg-dark-primary/20 hover:border-dark-primary/50 text-xs px-2 md:px-3 py-1 h-7 flex items-center gap-0.5 md:gap-1 font-medium"
          >
            <Plus size={12} className="hidden md:block" />
            添加章节
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteAct(actData.id);
            }}
            className="h-7 px-1.5 md:px-2 hover:bg-red-500/20 hover:text-red-400 text-dark-text-muted flex items-center gap-0.5 md:gap-1 transition-colors"
            title={isSideChapters ? "外传卷不可删除" : (chapters.length > 0 ? "请先删除所有章节" : "删除空卷")}
            disabled={chapters.length > 0 || isSideChapters}
          >
            <Trash2 size={12} className="hidden md:block" />
            <span className="text-xs">删除</span>
          </Button>
        </div>
      </div>

      {/* Chapters List */}
      {!isCollapsed && (
        <div className="ml-4 space-y-0.5 border-l border-dark-border/20 pl-3">
          {localChapters.length === 0 ? (
            <div className="py-6 text-center text-dark-text-muted">
              <BookOpen size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">此卷暂无章节</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={localChapters.map(c => c.id)}
                strategy={verticalListSortingStrategy}
              >
                {localChapters.map((chapter) => (
                  <ChapterListItem
                    key={chapter.id}
                    chapter={chapter}
                    onClick={() => onChapterClick(chapter)}
                    onDelete={() => onChapterDelete(chapter)}
                    onSummary={() => onChapterSummary(chapter)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}
    </div>
  );
};