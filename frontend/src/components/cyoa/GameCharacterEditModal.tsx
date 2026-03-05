import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { X, Plus, Trash2, Sparkles } from 'lucide-react';
import { gameCharactersApi } from '../../services/api';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { AutoDescribeCharacterModal } from '../modals/AutoDescribeCharacterModal';
import type { GameCharacter, GameCharacterStateDefinition, CyoaCharacterVersion } from '../../types';

type TabId = 'origin' | number; // 'origin' | version id

interface GameCharacterEditModalProps {
  workId: number;
  character: GameCharacter;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function getCharacteristicsBlob(c: GameCharacter | CyoaCharacterVersion): string {
  if (c.characteristics != null && String(c.characteristics).trim()) return String(c.characteristics).trim();
  if ('appearance' in c && c.appearance?.trim()) return (c.appearance + (c.backstory ? '\n\n' + c.backstory : '')).trim();
  return '';
}

const defaultStateDefinition = (): GameCharacterStateDefinition => ({
  name: '',
  stages: [{ label: '0/5 她刚认识用户' }],
});

export const GameCharacterEditModal: React.FC<GameCharacterEditModalProps> = ({
  workId,
  character,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('origin');
  const [name, setName] = useState('');
  const [characteristics, setCharacteristics] = useState('');
  const [stateDefinitions, setStateDefinitions] = useState<GameCharacterStateDefinition[]>([]);
  const [versionDisplayName, setVersionDisplayName] = useState('');
  const [isAutoDescribeModalOpen, setIsAutoDescribeModalOpen] = useState(false);

  const { data: versions = [], refetch: refetchVersions } = useQuery({
    queryKey: ['game-character-versions', workId, character.id],
    queryFn: async () => {
      const res = await gameCharactersApi.listVersions(workId, character.id);
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: isOpen && !!workId && !!character.id,
  });

  const activeVersion = typeof activeTab === 'number' ? versions.find((v) => v.id === activeTab) : null;
  const isOrigin = activeTab === 'origin';

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab('origin');
    setName(character.name);
    setCharacteristics(getCharacteristicsBlob(character));
    setStateDefinitions(
      Array.isArray(character.state_definitions) && character.state_definitions.length > 0
        ? character.state_definitions.map((s) => ({
            name: s.name,
            stages: Array.isArray(s.stages) && s.stages.length > 0 ? s.stages.map((st) => ({ label: st.label || '' })) : [{ label: '' }],
          }))
        : [defaultStateDefinition()]
    );
  }, [isOpen, character.id]);

  useEffect(() => {
    if (activeTab === 'origin') {
      setName(character.name);
      setCharacteristics(getCharacteristicsBlob(character));
      setStateDefinitions(
        Array.isArray(character.state_definitions) && character.state_definitions.length > 0
          ? character.state_definitions.map((s) => ({
              name: s.name,
              stages: Array.isArray(s.stages) && s.stages.length > 0 ? s.stages.map((st) => ({ label: st.label || '' })) : [{ label: '' }],
            }))
          : [defaultStateDefinition()]
      );
      setVersionDisplayName('');
    } else if (activeVersion) {
      setVersionDisplayName(activeVersion.display_name);
      setCharacteristics(activeVersion.characteristics || '');
      setStateDefinitions(
        Array.isArray(activeVersion.state_definitions) && activeVersion.state_definitions.length > 0
          ? activeVersion.state_definitions.map((s) => ({
              name: s.name,
              stages: Array.isArray(s.stages) && s.stages.length > 0 ? s.stages.map((st) => ({ label: st.label || '' })) : [{ label: '' }],
            }))
          : [defaultStateDefinition()]
      );
    }
  }, [activeTab, activeVersion?.id, character.id]);

  const saveOriginMutation = useMutation({
    mutationFn: (data: { name: string; characteristics: string; state_definitions: GameCharacterStateDefinition[] }) =>
      gameCharactersApi.update(workId, character.id, {
        name: data.name,
        appearance: '',
        backstory: '',
        characteristics: data.characteristics,
        state_definitions: data.state_definitions,
      }),
    onSuccess: () => {
      onSuccess();
    },
  });

  const saveVersionMutation = useMutation({
    mutationFn: (data: { display_name: string; characteristics: string; state_definitions: GameCharacterStateDefinition[] }) => {
      if (typeof activeTab !== 'number') return Promise.reject(new Error('No version'));
      return gameCharactersApi.updateVersion(workId, character.id, activeTab, data);
    },
    onSuccess: () => {
      refetchVersions();
      onSuccess();
    },
  });

  const createVersionFromCurrentMutation = useMutation({
    mutationFn: (payload: { characteristics: string; stateDefinitions: GameCharacterStateDefinition[] }) => {
      const nextNum = versions.length + 1;
      const displayName = `${character.name} ${nextNum}`;
      const validStates = payload.stateDefinitions
        .filter((s) => s.name.trim())
        .map((s) => ({
          name: s.name.trim(),
          stages: (s.stages?.length ? s.stages : [{ label: '默认' }]).map((st) => ({ label: (st.label || '').trim() || '默认' })),
        }));
      return gameCharactersApi.createVersion(workId, character.id, {
        display_name: displayName,
        characteristics: payload.characteristics,
        state_definitions: validStates.length ? validStates : [{ name: '', stages: [{ label: '0/5 她刚认识用户' }] }],
      });
    },
    onSuccess: () => {
      refetchVersions();
      onSuccess();
    },
  });

  const deleteVersionMutation = useMutation({
    mutationFn: (versionId: number) => gameCharactersApi.deleteVersion(workId, character.id, versionId),
    onSuccess: (_data, versionId) => {
      refetchVersions();
      onSuccess();
      if (activeTab === versionId) setActiveTab('origin');
    },
  });

  const handleSaveOrigin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const validStates = stateDefinitions
      .filter((s) => s.name.trim())
      .map((s) => ({
        name: s.name.trim(),
        stages: s.stages.filter((st) => st.label.trim()).length > 0 ? s.stages.filter((st) => st.label.trim()).map((st) => ({ label: st.label.trim() })) : [{ label: '默认' }],
      }));
    if (validStates.length === 0) validStates.push(defaultStateDefinition());
    saveOriginMutation.mutate({
      name: name.trim(),
      characteristics: characteristics.trim(),
      state_definitions: validStates,
    });
  };

  const handleSaveVersion = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof activeTab !== 'number' || !versionDisplayName.trim()) return;
    const validStates = stateDefinitions
      .filter((s) => s.name.trim())
      .map((s) => ({
        name: s.name.trim(),
        stages: s.stages.filter((st) => st.label.trim()).length > 0 ? s.stages.filter((st) => st.label.trim()).map((st) => ({ label: st.label.trim() })) : [{ label: '默认' }],
      }));
    if (validStates.length === 0) validStates.push(defaultStateDefinition());
    saveVersionMutation.mutate({
      display_name: versionDisplayName.trim(),
      characteristics: characteristics.trim(),
      state_definitions: validStates,
    });
  };

  const addStateDefinition = () => setStateDefinitions((prev) => [...prev, defaultStateDefinition()]);
  const removeStateDefinition = (index: number) => setStateDefinitions((prev) => prev.filter((_, i) => i !== index));
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
      next[stateIndex] = { ...next[stateIndex], stages: [...(next[stateIndex].stages || []), { label: '' }] };
      return next;
    });
  };
  const removeStage = (stateIndex: number, stageIndex: number) => {
    setStateDefinitions((prev) => {
      const next = [...prev];
      const stages = (next[stateIndex].stages || []).filter((_, i) => i !== stageIndex);
      next[stateIndex] = { ...next[stateIndex], stages: stages.length ? stages : [{ label: '' }] };
      return next;
    });
  };

  if (!isOpen) return null;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'origin', label: `Origin - ${character.name}` },
    ...versions.map((v) => ({ id: v.id as TabId, label: v.display_name })),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-dark-surface border border-dark-border rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <h3 className="text-lg font-semibold text-dark-text">编辑角色：{character.name}</h3>
          <button type="button" onClick={onClose} className="p-1 text-dark-text-muted hover:text-dark-text">
            <X size={20} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1 px-4 py-2 border-b border-dark-border bg-dark-bg/30">
          {tabs.map((tab) => (
            <button
              key={tab.id === 'origin' ? 'origin' : tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-dark-primary text-white'
                  : 'bg-dark-bg/50 text-dark-text-muted hover:text-dark-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-b border-dark-border">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              createVersionFromCurrentMutation.mutate({
                characteristics,
                stateDefinitions: stateDefinitions,
              })
            }
            disabled={createVersionFromCurrentMutation.isPending}
          >
            {createVersionFromCurrentMutation.isPending ? '创建中...' : '从当前版本新建版本'}
          </Button>
        </div>
        <form onSubmit={isOrigin ? handleSaveOrigin : handleSaveVersion} className="flex flex-col flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            {isOrigin ? (
              <div>
                <label className="block text-sm font-medium text-dark-text mb-1">角色名称</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：Tia" required />
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-dark-text mb-1">版本名称</label>
                  <Input value={versionDisplayName} onChange={(e) => setVersionDisplayName(e.target.value)} placeholder="如：Tia 1" required />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  onClick={() => typeof activeTab === 'number' && window.confirm('确定删除该版本？') && deleteVersionMutation.mutate(activeTab)}
                  disabled={deleteVersionMutation.isPending}
                  title="删除该版本"
                >
                  <Trash2 size={16} /> 删除版本
                </Button>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-dark-text">详细描述</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAutoDescribeModalOpen(true)}
                  disabled={isOrigin ? !name.trim() : !versionDisplayName.trim()}
                  className="flex items-center gap-1 text-xs"
                >
                  <Sparkles size={14} /> AI自动描述
                </Button>
              </div>
              <Textarea value={characteristics} onChange={(e) => setCharacteristics(e.target.value)} placeholder="综合描述..." rows={6} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-dark-text">角色状态</label>
                <Button type="button" variant="outline" size="sm" onClick={addStateDefinition} className="flex items-center gap-1">
                  <Plus size={14} /> 添加状态
                </Button>
              </div>
              <div className="space-y-4 border border-dark-border rounded-md p-3 bg-dark-bg/50">
                {stateDefinitions.map((state, stateIndex) => (
                  <div key={stateIndex} className="border border-dark-border rounded p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input value={state.name} onChange={(e) => updateStateName(stateIndex, e.target.value)} placeholder="状态名称" className="flex-1" />
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeStateDefinition(stateIndex)} title="删除该状态">
                        <Trash2 size={16} />
                      </Button>
                    </div>
                    <div className="pl-2 space-y-1">
                      {(state.stages || []).map((stage, stageIndex) => (
                        <div key={stageIndex} className="flex items-center gap-2">
                          <Input value={stage.label} onChange={(e) => updateStageLabel(stateIndex, stageIndex, e.target.value)} className="flex-1 text-sm" />
                          <Button type="button" variant="ghost" size="sm" onClick={() => removeStage(stateIndex, stageIndex)} disabled={(state.stages?.length || 0) <= 1}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      ))}
                      <Button type="button" variant="ghost" size="sm" onClick={() => addStage(stateIndex)} className="flex items-center gap-1 text-dark-text-muted">
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
            <Button type="submit" disabled={isOrigin ? saveOriginMutation.isPending : saveVersionMutation.isPending}>
              {isOrigin ? (saveOriginMutation.isPending ? '保存中...' : '保存') : (saveVersionMutation.isPending ? '保存中...' : '保存')}
            </Button>
          </div>
        </form>
      </div>
      <AutoDescribeCharacterModal
        workId={workId}
        characterName={character.name}
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
