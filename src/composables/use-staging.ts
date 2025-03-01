import { ref, Ref } from 'vue';
import type { RelationM2M } from './use-relations';
import type { StagedChangesPayload, JunctionItem } from '../types';

export function useStaging(relationInfo: Ref<RelationM2M | undefined>) {
  const stagedChanges = ref<StagedChangesPayload>({
    create: [],
    update: [],
    delete: []
  });

  /**
   * Stage a new item with proper junction structure
   */
  function stageCreate(item: Record<string, any>): StagedChangesPayload {
    if (!relationInfo.value) return stagedChanges.value;
    
    const newStagedChanges = {
      ...stagedChanges.value,
      create: [...stagedChanges.value.create]
    };
    
    const itemWithTracking: JunctionItem = {
      ...item,
      _stageId: Math.random().toString(36).substring(2, 9)
    };
    
    newStagedChanges.create.push(itemWithTracking);
    stagedChanges.value = newStagedChanges;
    
    return cleanStagedChanges(newStagedChanges);
  }

  /**
   * Clean temporary fields before emission
   */
  function cleanStagedChanges(changes: StagedChangesPayload): StagedChangesPayload {
    if (!changes) return { create: [], update: [], delete: [] };
    
    return {
      create: changes.create.map(item => {
        const { _stageId, _status, ...cleanItem } = { ...item };
        return cleanItem;
      }),
      update: changes.update.map(item => {
        const { _stageId, _status, ...cleanItem } = { ...item };
        return cleanItem;
      }),
      delete: [...changes.delete]
    };
  }

  /**
   * Check if an item is local (not yet saved)
   */
  function isLocalItem(item: Record<string, any>): boolean {
    if (!relationInfo.value) return false;
    
    const junctionPkField = relationInfo.value.junctionPrimaryKeyField.field;
    return !item[junctionPkField] || item.$type === 'created';
  }

  /**
   * Reset all staged changes
   */
  function resetStagedChanges(): void {
    stagedChanges.value = {
      create: [],
      update: [],
      delete: []
    };
  }

  return {
    stagedChanges,
    stageCreate,
    cleanStagedChanges,
    isLocalItem,
    resetStagedChanges
  };
} 