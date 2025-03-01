import { Ref } from 'vue';
import type { RelationM2M } from './use-relations';
import type { StagedChangesPayload } from '../types';
import { useStaging } from './use-staging';

export function useItemOperations(
  relationInfo: Ref<RelationM2M | undefined>,
  stagedChanges: Ref<StagedChangesPayload>
) {
  const { stageCreate, cleanStagedChanges, isLocalItem } = useStaging(relationInfo);

  /**
   * Stage a new item from text input
   */
  async function stageNewItem(
    value: string,
    primaryKey: string | number | null,
    referencingField: string
  ): Promise<StagedChangesPayload | null> {
    if (!relationInfo.value || !primaryKey) return null;
    
    const junctionField = relationInfo.value.junctionField.field;
    const reverseJunctionField = relationInfo.value.reverseJunctionField.field;
    
    const newItem = {
      [reverseJunctionField]: primaryKey,
      [junctionField]: {
        [referencingField]: value
      },
      _stageId: Math.random().toString(36).substring(2, 9)
    };
    
    // Create new changes object with the new item
    const newChanges = {
      ...stagedChanges.value,
      create: [...stagedChanges.value.create, newItem]
    };
    
    // Update state
    stagedChanges.value = newChanges;
    return cleanStagedChanges(newChanges);
  }

  /**
   * Delete an item (staged or existing)
   */
  function deleteItem(item: Record<string, any>): StagedChangesPayload {
    if (!relationInfo.value || !item) return cleanStagedChanges(stagedChanges.value);
    
    const junctionPkField = relationInfo.value.junctionPrimaryKeyField.field;
    const junctionId = item[junctionPkField];
    
    const newStagedChanges = {
      ...stagedChanges.value,
      create: [...stagedChanges.value.create],
      delete: [...stagedChanges.value.delete]
    };
    
    if (isLocalItem(item)) {
      // Remove from create array
      if (item._stageId) {
        newStagedChanges.create = newStagedChanges.create.filter(
          stagedItem => stagedItem._stageId !== item._stageId
        );
      }
    } else if (junctionId && junctionId !== '+') {
      // Toggle in delete array
      const deleteIndex = newStagedChanges.delete.indexOf(junctionId);
      if (deleteIndex !== -1) {
        newStagedChanges.delete.splice(deleteIndex, 1);
      } else {
        newStagedChanges.delete.push(junctionId);
      }
    }
    
    stagedChanges.value = newStagedChanges;
    return cleanStagedChanges(newStagedChanges);
  }

  /**
   * Batch delete multiple items
   */
  function batchDeleteItems(items: Record<string, any>[]): StagedChangesPayload {
    if (!items?.length) return cleanStagedChanges(stagedChanges.value);
    
    let currentChanges = { ...stagedChanges.value };
    for (const item of items) {
      currentChanges = deleteItem(item);
    }
    
    return currentChanges;
  }

  return {
    stageNewItem,
    deleteItem,
    batchDeleteItems
  };
} 