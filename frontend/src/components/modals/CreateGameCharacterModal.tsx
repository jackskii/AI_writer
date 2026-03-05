import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Plus, Trash2, Sparkles } from 'lucide-react';
import { gameCharactersApi } from '../../services/api';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { AutoDescribeCharacterModal } from './AutoDescribeCharacterModal';
import type { GameCharacter, GameCharacterStateDefinition } from '../../types';

interface CreateGameCharacterModalProps {
  workId: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editCharacter?: GameCharacter | null;
}

const defaultStateDefinition = (): GameCharacterStateDefinition => ({
  name: '',
  stages: [{ label: '0/5 她刚认识用户' }],
});

/** Build display blob from character: prefer characteristics, else appearance + backstory */
function getCharacteristicsBlob(c: GameCharacter): string {
  if (c.characteristics != null && String(c.characteristics).trim()) return String(c.characteristics).trim();
  const parts: string[] = [];
  if (c.appearance?.trim()) parts.push(c.appearance.trim());
  if (c.backstory?.trim()) parts.push(c.backstory.trim());
  return parts.join('\n\n');
}

export const CreateGameCharacterModal: React.FC<CreateGameCharacterModalProps> = ({
  workId,
  isOpen,
  onClose,
  onSuccess,
  editCharacter,
}) => {
  const [name, setName] = useState('');
  const [characteristics, setCharacteristics] = useState('');
  const [stateDefinitions, setStateDefinitions] = useState<GameCharacterStateDefinition[]>([]);
  const [isAutoDescribeModalOpen, setIsAutoDescribeModalOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editCharacter) {
      setName(editCharacter.name);
      setCharacteristics(getCharacteristicsBlob(editCharacter));
      setStateDefinitions(
        Array.isArray(editCharacter.state_definitions) && editCharacter.state_definitions.length > 0
          ? editCharacter.state_definitions.map((s) => ({
              name: s.name,
              stages: Array.isArray(s.stages) && s.stages.length > 0
                ? s.stages.map((st) => ({ label: st.label || '' }))
                : [{ label: '' }],
            }))
          : [defaultStateDefinition()]
      );
    } else {
      setName('');
      setCharacteristics('');
      setStateDefinitions([defaultStateDefinition()]);
    }
  }, [isOpen, editCharacter?.id]);

  const saveMutation = useMutation({
    mutationFn: (data: {
      name: string;
      characteristics: string;
      state_definitions: GameCharacterStateDefinition[];
    }) => {
      const payload = {
        name: data.name,
        appearance: '',
        backstory: '',
        characteristics: data.characteristics,
        state_definitions: data.state_definitions,
      };
      if (editCharacter) {
        return gameCharactersApi.update(workId, editCharacter.id, payload);
      }
      return gameCharactersApi.create(workId, payload);
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const validStates = stateDefinitions
      .filter((s) => s.name.trim())
      .map((s) => ({
        name: s.name.trim(),
        stages: s.stages.filter((st) => st.label.trim()).length > 0
          ? s.stages.filter((st) => st.label.trim()).map((st) => ({ label: st.label.trim() }))
          : [{ label: '默认' }],
      }));
    if (validStates.length === 0) validStates.push(defaultStateDefinition());
    saveMutation.mutate({
      name: name.trim(),
      characteristics: characteristics.trim(),
      state_definitions: validStates,
    });
  };

  const addStateDefinition = () => {
    setStateDefinitions((prev) => [...prev, defaultStateDefinition()]);
  };

  const removeStateDefinition = (index: number) => {
    setStateDefinitions((prev) => prev.filter((_, i) => i !== index));
  };

  const updateStateName = (index: number, stateName: string) => {
    setStateDefinitions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], name: stateName };
      return next;
    });
  };

  const updateStageLabel = (stateIndex: number, stageIndex: number, label: string) => {
    setStateDefinitions((prev) => {
      const next = [...prev];
      const stages = [...(next[stateIndex].stages || [])];
      stages[stageIndex] = { label };
      next[stateIndex] = { ...next[stateIndex], stages };
      return next;
    });
  };

  const addStage = (stateIndex: number) => {
    setStateDefinitions((prev) => {
      const next = [...prev];
      const stages = [...(next[stateIndex].stages || []), { label: '' }];
      next[stateIndex] = { ...next[stateIndex], stages };
      return next;
    });
  };

  const removeStage = (stateIndex: number, stageIndex: number) => {
    setStateDefinitions((prev) => {
      const next = [...prev];
      const stages = (next[stateIndex].stages || []).filter((_, i) => i !== stageIndex);
      if (stages.length === 0) stages.push({ label: '' });
      next[stateIndex] = { ...next[stateIndex], stages };
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-dark-surface border border-dark-border rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <h3 className="text-lg font-semibold text-dark-text">
            {editCharacter ? '编辑角色' : '新建角色'}
          </h3>
          <button type="button" onClick={onClose} className="p-1 text-dark-text-muted hover:text-dark-text">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-text mb-1">角色名称</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：Tia" required />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-dark-text">详细描述</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAutoDescribeModalOpen(true)}
                  disabled={!name.trim()}
                  className="flex items-center gap-1 text-xs"
                >
                  <Sparkles size={14} />
                  AI自动描述
                </Button>
              </div>
              <Textarea
                value={characteristics}
                onChange={(e) => setCharacteristics(e.target.value)}
                placeholder="外貌、性格、背景等综合描述，或使用 AI自动描述..."
                rows={6}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-dark-text">角色状态（用于章节中选择阶段）</label>
                <Button type="button" variant="outline" size="sm" onClick={addStateDefinition} className="flex items-center gap-1">
                  <Plus size={14} /> 添加状态
                </Button>
              </div>
              <div className="space-y-4 border border-dark-border rounded-md p-3 bg-dark-bg/50">
                {stateDefinitions.map((state, stateIndex) => (
                  <div key={stateIndex} className="border border-dark-border rounded p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={state.name}
                        onChange={(e) => updateStateName(stateIndex, e.target.value)}
                        placeholder="状态名称，如：好感度"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeStateDefinition(stateIndex)}
                        title="删除该状态"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                    <div className="pl-2 space-y-1">
                      <span className="text-xs text-dark-text-muted">阶段（可编辑，可添加）</span>
                      {(state.stages || []).map((stage, stageIndex) => (
                        <div key={stageIndex} className="flex items-center gap-2">
                          <Input
                            value={stage.label}
                            onChange={(e) => updateStageLabel(stateIndex, stageIndex, e.target.value)}
                            placeholder="如：0/5 她刚认识用户"
                            className="flex-1 text-sm"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeStage(stateIndex, stageIndex)}
                            disabled={(state.stages?.length || 0) <= 1}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => addStage(stateIndex)}
                        className="flex items-center gap-1 text-dark-text-muted"
                      >
                        <Plus size={14} /> 添加阶段
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-dark-border">
            <Button type="button" variant="ghost" onClick={onClose}>取消</Button>
            <Button type="submit" disabled={saveMutation.isPending || !name.trim()}>
              {saveMutation.isPending ? '保存中...' : editCharacter ? '保存' : '创建'}
            </Button>
          </div>
        </form>
      </div>
      <AutoDescribeCharacterModal
        workId={workId}
        characterName={name.trim()}
        originalCharacteristics={characteristics}
        isOpen={isAutoDescribeModalOpen}
        onClose={() => setIsAutoDescribeModalOpen(false)}
        onCharacteristicsGenerated={(chars) => {
          setCharacteristics(chars);
          setIsAutoDescribeModalOpen(false);
        }}
      />
    </div>
  );
};
