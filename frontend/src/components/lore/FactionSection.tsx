import React from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, Users, Globe } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, CardContent } from '../ui/Card';
import type { Faction, LoreEntry } from '../../types';

interface FactionSectionProps {
  faction: Faction;
  isCollapsed: boolean;
  loreEntries: LoreEntry[];
  onToggleCollapse: (factionId: number) => void;
  onDeleteFaction: (factionId: number) => void;
  onAddCharacter: (factionId: number) => void;
  onEditLoreEntry: (entry: LoreEntry) => void;
  onDeleteLoreEntry: (entry: LoreEntry) => void;
}

export const FactionSection: React.FC<FactionSectionProps> = ({
  faction,
  isCollapsed,
  loreEntries,
  onToggleCollapse,
  onDeleteFaction,
  onAddCharacter,
  onEditLoreEntry,
  onDeleteLoreEntry
}) => {
  const isWorldbuilding = faction.faction_type === 'worldbuilding';
  const canDelete = !faction.is_default;

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
        <div className="flex items-center gap-3 min-w-0">
          {isCollapsed ? (
            <ChevronRight size={20} className="text-dark-text-muted" />
          ) : (
            <ChevronDown size={20} className="text-dark-text-muted" />
          )}
          {getIcon()}
          <h3 className="text-lg font-semibold text-dark-text flex-shrink-0">{faction.name}</h3>
          <span className="text-sm text-dark-text-muted truncate min-w-0">
            {faction.description || '暂无描述'}
          </span>
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

      {/* Lore Entries */}
      {!isCollapsed && (
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
                  <div className="flex items-start gap-2 pr-8">
                    <h4 className="font-medium text-dark-text flex-shrink-0 max-w-[38%] truncate">{entry.name}</h4>
                    <p className="text-sm text-dark-text-muted line-clamp-2 min-w-0 flex-1">
                      {entry.description}
                    </p>
                  </div>
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
