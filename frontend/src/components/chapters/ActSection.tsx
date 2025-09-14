import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, BookOpen, Plus, Edit2, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { ChapterListItem } from './ChapterListItem';
import type { Chapter } from '../../types';

interface ActSectionProps {
  act: number;
  actName?: string;
  chapters: Chapter[];
  onChapterClick: (chapter: Chapter) => void;
  onChapterDelete: (chapter: Chapter) => void;
  onChapterSummary: (chapter: Chapter) => void;
  onCreateChapter: (actId: number) => void;
  onEditActName: (actId: number, currentName?: string) => void;
  onDeleteAct: (actId: number) => void;
}

export const ActSection: React.FC<ActSectionProps> = ({
  act,
  actName,
  chapters,
  onChapterClick,
  onChapterDelete,
  onChapterSummary,
  onCreateChapter,
  onEditActName,
  onDeleteAct
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleCollapsed = () => {
    setIsCollapsed(prev => !prev);
  };

  const totalWords = chapters.reduce((sum, chapter) => sum + chapter.word_count, 0);
  const displayName = actName || `第${act}卷`;

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
            <BookOpen size={16} className="text-dark-primary" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-dark-text">
                  {displayName}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditActName(act, actName);
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

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onCreateChapter(act);
            }}
            className="bg-dark-primary/10 border-dark-primary/30 text-dark-primary hover:bg-dark-primary/20 hover:border-dark-primary/50 text-xs px-3 py-1 h-7 flex items-center gap-1 font-medium"
          >
            <Plus size={12} />
            添加章节
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteAct(act);
            }}
            className="h-7 px-2 hover:bg-red-500/20 hover:text-red-400 text-dark-text-muted flex items-center gap-1 transition-colors"
            title={chapters.length > 0 ? "请先删除所有章节" : "删除空卷"}
            disabled={chapters.length > 0}
          >
            <Trash2 size={12} />
            <span className="text-xs">删除</span>
          </Button>
        </div>
      </div>

      {/* Chapters List */}
      {!isCollapsed && (
        <div className="ml-4 space-y-0.5 border-l border-dark-border/20 pl-3">
          {chapters.length === 0 ? (
            <div className="py-6 text-center text-dark-text-muted">
              <BookOpen size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">此卷暂无章节</p>
            </div>
          ) : (
            chapters.map((chapter) => (
              <ChapterListItem
                key={chapter.id}
                chapter={chapter}
                onClick={() => onChapterClick(chapter)}
                onDelete={() => onChapterDelete(chapter)}
                onSummary={() => onChapterSummary(chapter)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};