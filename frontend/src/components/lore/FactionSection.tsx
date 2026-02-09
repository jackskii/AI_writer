import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Plus, Edit, Trash2, Users, Globe } from 'lucide-react';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';
import { Card, CardContent } from '../ui/Card';
import type { Faction, LoreEntry } from '../../types';

interface FactionSectionProps {
  faction: Faction;
  loreEntries: LoreEntry[];
  onToggleCollapse: (factionId: number) => void;
  onUpdateFaction: (factionId: number, name: string, description: string) => void;
  onDeleteFaction: (factionId: number) => void;
  onAddCharacter: (factionId: number) => void;
  onEditLoreEntry: (entry: LoreEntry) => void;
  onDeleteLoreEntry: (entry: LoreEntry) => void;
}

export const FactionSection: React.FC<FactionSectionProps> = ({
  faction,
  loreEntries,
  onToggleCollapse,
  onUpdateFaction,
  onDeleteFaction,
  onAddCharacter,
  onEditLoreEntry,
  onDeleteLoreEntry
}) => {
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState(faction.description || '');
  
  useEffect(() => {
    setEditedDescription(faction.description || '');
  }, [faction.description]);

  const isWorldbuilding = faction.faction_type === 'worldbuilding';
  const canDelete = !faction.is_default;

  const handleSaveDescription = () => {
    onUpdateFaction(faction.id, faction.name, editedDescription);
    setIsEditingDescription(false);
  };

  const handleCancelEdit = () => {
    setEditedDescription(faction.description);
    setIsEditingDescription(false);
  };

  const getAddButtonText = () => {
    if (isWorldbuilding) {
      return '添加世界观元素';
    }
    return '添加角色';
  };

  const getIcon = () => {
    if (isWorldbuilding) {
      return <Globe size={18} className="text-dark-primary" />;
    }
    return <Users size={18} className="text-dark-primary" />;
  };

  return (
    <Card className="mb-4">
      {/* Faction Header */}
      <div 
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-dark-bg/50 transition-colors"
        onClick={() => onToggleCollapse(faction.id)}
      >
        <div className="flex items-center gap-3">
          {faction.is_collapsed ? (
            <ChevronRight size={20} className="text-dark-text-muted" />
          ) : (
            <ChevronDown size={20} className="text-dark-text-muted" />
          )}
          {getIcon()}
          <h3 className="text-lg font-semibold text-dark-text">{faction.name}</h3>
          <span className="text-sm text-dark-text-muted">
            ({loreEntries.length}个条目)
          </span>
        </div>
        
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {canDelete && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDeleteFaction(faction.id)}
                className="px-2 py-1 h-auto text-red-400 hover:text-red-300 hover:border-red-400"
              >
                <Trash2 size={14} />
              </Button>
            </>
          )}
          <Button
            size="sm"
            onClick={() => onAddCharacter(faction.id)}
            className="flex items-center gap-1"
          >
            <Plus size={14} />
            {getAddButtonText()}
          </Button>
        </div>
      </div>

      {/* Faction Description */}
      {!faction.is_collapsed && (
        <div className="px-4 pb-2 border-t border-dark-border">
          {isEditingDescription ? (
            <div className="pt-3">
              <Textarea
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                placeholder="添加阵营描述..."
                rows={2}
                className="mb-2"
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveDescription}>保存</Button>
                <Button size="sm" variant="outline" onClick={handleCancelEdit}>取消</Button>
              </div>
            </div>
          ) : (
            <div 
              className="pt-3 text-sm text-dark-text-muted cursor-pointer hover:text-dark-text transition-colors flex items-start gap-2"
              onClick={() => setIsEditingDescription(true)}
            >
              <Edit size={14} className="mt-0.5 flex-shrink-0 opacity-50" />
              <span>{faction.description || '点击添加阵营描述...'}</span>
            </div>
          )}
        </div>
      )}

      {/* Lore Entries */}
      {!faction.is_collapsed && (
        <CardContent className="pt-0">
          {loreEntries.length === 0 ? (
            <div className="text-center py-6 text-dark-text-muted text-sm">
              {isWorldbuilding ? '暂无世界观元素' : '暂无角色'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {loreEntries.map((entry) => (
                <div 
                  key={entry.id}
                  onClick={() => onEditLoreEntry(entry)}
                  className="group relative p-3 bg-dark-bg rounded-lg border border-dark-border hover:border-dark-primary/50 hover:bg-dark-surface/50 transition-colors cursor-pointer"
                >
                  <h4 className="font-medium text-dark-text truncate pr-8">{entry.name}</h4>
                  <p className="text-sm text-dark-text-muted line-clamp-2 mt-1">
                    {entry.description}
                  </p>
                  {entry.triggers.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {entry.triggers.slice(0, 2).map((trigger, idx) => (
                        <span 
                          key={idx}
                          className="px-2 py-0.5 text-xs bg-dark-surface rounded text-dark-text-muted"
                        >
                          {trigger}
                        </span>
                      ))}
                      {entry.triggers.length > 2 && (
                        <span className="px-2 py-0.5 text-xs text-dark-text-muted">
                          +{entry.triggers.length - 2}
                        </span>
                      )}
                    </div>
                  )}
                  {/* Delete button - show on hover */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteLoreEntry(entry);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100 text-dark-text-muted hover:text-red-400 hover:bg-dark-bg transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};
