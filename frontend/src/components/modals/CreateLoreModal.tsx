import React, { useState, useEffect, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Plus, Minus, Sparkles, ChevronDown, Check } from 'lucide-react';
import { loreApi } from '../../services/api';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { AutoDescribeModal } from './AutoDescribeModal';
import type { LoreEntry, Faction } from '../../types';

interface CreateLoreModalProps {
  workId: number;
  isOpen: boolean;
  onClose: () => void;
  onLoreCreated: (lore: LoreEntry) => void;
  editEntry?: LoreEntry | null;
  factions?: Faction[];
  defaultFactionId?: number | null;
}

export const CreateLoreModal: React.FC<CreateLoreModalProps> = ({
  workId,
  isOpen,
  onClose,
  onLoreCreated,
  editEntry,
  factions = [],
  defaultFactionId
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggers, setTriggers] = useState<string[]>(['']);
  const [selectedFactions, setSelectedFactions] = useState<number[]>([]);
  const [usedChapters, setUsedChapters] = useState<Array<{chapter_number: number, title: string}>>([]);
  const [isFactionDropdownOpen, setIsFactionDropdownOpen] = useState(false);
  const [isAutoDescribeModalOpen, setIsAutoDescribeModalOpen] = useState(false);

  const isEditMode = !!editEntry;

  // Determine if this is a worldbuilding entry
  const isWorldbuildingEntry = useMemo(() => {
    // Check if editing an existing worldbuilding entry
    if (editEntry && editEntry.factions) {
      const worldbuildingFaction = factions.find(f => f.faction_type === 'worldbuilding');
      if (worldbuildingFaction && editEntry.factions.includes(worldbuildingFaction.id)) {
        return true;
      }
    }
    // Check if creating from worldbuilding faction
    if (defaultFactionId) {
      const defaultFaction = factions.find(f => f.id === defaultFactionId);
      if (defaultFaction?.faction_type === 'worldbuilding') {
        return true;
      }
    }
    return false;
  }, [editEntry, defaultFactionId, factions]);

  // Filter available factions based on entry type
  const availableFactions = useMemo(() => {
    if (isWorldbuildingEntry) {
      // Worldbuilding entries can ONLY belong to worldbuilding faction
      return factions.filter(f => f.faction_type === 'worldbuilding');
    } else {
      // Other entries can belong to any faction EXCEPT worldbuilding
      return factions.filter(f => f.faction_type !== 'worldbuilding' && f.faction_type !== 'no_faction');
    }
  }, [factions, isWorldbuildingEntry]);

  useEffect(() => {
    // Only initialize form when modal is opened or edit target changes.
    // Avoid resetting user input on background refetch.
    if (!isOpen) {
      setIsFactionDropdownOpen(false);
      return;
    }

    setIsFactionDropdownOpen(false);

    if (editEntry) {
      setName(editEntry.name);
      setDescription(editEntry.description);
      setTriggers(editEntry.triggers.length > 0 ? editEntry.triggers : ['']);
      // Filter out 无归属 from displayed selections - it's handled automatically
      const filteredFactions = (editEntry.factions || []).filter(id => {
        const faction = factions.find(f => f.id === id);
        return faction?.faction_type !== 'no_faction';
      });
      setSelectedFactions(filteredFactions);
    } else {
      setName('');
      setDescription('');
      setTriggers(['']);
      // Don't pre-select 无归属 faction - entries with no faction automatically go there
      if (defaultFactionId) {
        const defaultFaction = factions.find(f => f.id === defaultFactionId);
        if (defaultFaction?.faction_type === 'no_faction') {
          setSelectedFactions([]);
        } else {
          setSelectedFactions([defaultFactionId]);
        }
      } else {
        setSelectedFactions([]);
      }
    }
  }, [isOpen, editEntry?.id, defaultFactionId]);

  const saveMutation = useMutation({
    mutationFn: (loreData: { name: string; description: string; triggers: string[]; factions: number[] }) => {
      if (isEditMode && editEntry) {
        return loreApi.update(workId, editEntry.id, loreData);
      } else {
        return loreApi.create(workId, loreData);
      }
    },
    onSuccess: (response) => {
      onLoreCreated(response.data);
      // Reset form
      if (!isEditMode) {
        setName('');
        setDescription('');
        setTriggers(['']);
        setSelectedFactions([]);
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    // Filter out empty triggers
    const validTriggers = triggers.filter(t => t.trim()).map(t => t.trim());
    
    saveMutation.mutate({
      name: name.trim(),
      description: description.trim(),
      triggers: validTriggers,
      factions: selectedFactions
    });
  };

  const toggleFaction = (factionId: number) => {
    setSelectedFactions(prev => 
      prev.includes(factionId)
        ? prev.filter(id => id !== factionId)
        : [...prev, factionId]
    );
  };

  const addTrigger = () => {
    setTriggers([...triggers, '']);
  };

  const removeTrigger = (index: number) => {
    if (triggers.length > 1) {
      setTriggers(triggers.filter((_, i) => i !== index));
    }
  };

  const updateTrigger = (index: number, value: string) => {
    const newTriggers = [...triggers];
    newTriggers[index] = value;
    setTriggers(newTriggers);
  };

  const handleAutoDescribe = () => {
    if (!name.trim()) {
      alert('请先输入条目名称');
      return;
    }
    setIsAutoDescribeModalOpen(true);
  };

  const handleDescriptionGenerated = (newDescription: string, chapters: Array<{chapter_number: number, title: string}>) => {
    setDescription(newDescription);
    setUsedChapters(chapters);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-dark-text">
              {isEditMode ? '编辑世界观条目' : '添加世界观条目'}
            </h3>
            <button
              onClick={onClose}
              className="text-dark-text-muted hover:text-dark-text"
            >
              <X size={20} />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="条目名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：主角、魔法系统、世界背景..."
              required
              autoFocus
            />
            
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-dark-text">
                  详细描述
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAutoDescribe}
                  disabled={!name.trim()}
                  className="flex items-center gap-1 text-xs"
                >
                  <Sparkles size={14} />
                  AI自动描述
                </Button>
              </div>

              {/* Display used chapters after generation */}
              {usedChapters.length > 0 && (
                <div className="mb-2 p-2 bg-dark-bg rounded border border-dark-border">
                  <p className="text-xs text-dark-text-muted">
                    已使用章节: {' '}
                    <span className="text-dark-text">
                      {usedChapters.map((ch, idx) => (
                        <span key={idx}>
                          第{ch.chapter_number}章《{ch.title}》
                          {idx < usedChapters.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </span>
                  </p>
                </div>
              )}

              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="详细描述这个条目的内容、特征、背景等信息..."
                rows={6}
              />
            </div>

            {/* Faction Selection - always show for non-worldbuilding entries */}
            {!isWorldbuildingEntry && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-dark-text">
                  所属阵营
                </label>
                <p className="text-xs text-dark-text-muted mb-3">
                  选择该条目所属的阵营（可多选，不选则归入"无归属"）
                </p>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsFactionDropdownOpen(!isFactionDropdownOpen)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-left hover:border-dark-primary/50 transition-colors"
                  >
                    <span className="text-sm text-dark-text truncate">
                      {selectedFactions.length === 0 
                        ? '选择阵营...' 
                        : `已选择 ${selectedFactions.length} 个阵营`}
                    </span>
                    <ChevronDown size={16} className={`text-dark-text-muted transition-transform ${isFactionDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {/* Dropdown menu - opens downward */}
                  {isFactionDropdownOpen && (
                    <div className="absolute top-full left-0 w-full mt-1 py-1 bg-dark-surface border border-dark-border rounded-lg shadow-lg max-h-48 overflow-y-auto z-[100]">
                      {availableFactions.length > 0 ? (
                        availableFactions.map((faction) => (
                          <button
                            key={faction.id}
                            type="button"
                            onClick={() => toggleFaction(faction.id)}
                            className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-dark-bg transition-colors"
                          >
                            <span className="text-dark-text">{faction.name}</span>
                            {selectedFactions.includes(faction.id) && (
                              <Check size={16} className="text-dark-primary" />
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-dark-text-muted">
                          暂无自定义阵营
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Selected factions preview - shown below dropdown */}
                  {selectedFactions.length > 0 && !isFactionDropdownOpen && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {selectedFactions.map(factionId => {
                        const faction = factions.find(f => f.id === factionId);
                        return faction ? (
                          <span 
                            key={factionId}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-dark-primary/20 text-dark-primary text-xs rounded"
                          >
                            {faction.name}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFaction(factionId);
                              }}
                              className="hover:text-dark-text"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Show info for worldbuilding entries */}
            {isWorldbuildingEntry && (
              <div className="text-sm text-dark-text-muted bg-dark-bg p-3 rounded-lg">
                此条目属于"世界观"分类，无法添加到其他阵营
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-medium text-dark-text">
                触发词 <span className="text-dark-text-muted">(可选)</span>
              </label>
              <p className="text-xs text-dark-text-muted mb-3">
                当故事中出现这些词时，AI会自动加载相关背景信息
              </p>
              {triggers.map((trigger, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={trigger}
                    onChange={(e) => updateTrigger(index, e.target.value)}
                    placeholder="输入触发词..."
                    className="flex-1"
                  />
                  {triggers.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeTrigger(index)}
                      className="px-2"
                    >
                      <Minus size={16} />
                    </Button>
                  )}
                  {index === triggers.length - 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addTrigger}
                      className="px-2"
                    >
                      <Plus size={16} />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={!name.trim() || saveMutation.isPending}
              >
                {saveMutation.isPending 
                  ? (isEditMode ? '保存中...' : '创建中...') 
                  : (isEditMode ? '保存修改' : '创建条目')
                }
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Auto Describe Modal */}
      <AutoDescribeModal
        workId={workId}
        entryName={name.trim()}
        originalDescription={description}
        isOpen={isAutoDescribeModalOpen}
        onClose={() => setIsAutoDescribeModalOpen(false)}
        onDescriptionGenerated={handleDescriptionGenerated}
      />
    </div>
  );
};