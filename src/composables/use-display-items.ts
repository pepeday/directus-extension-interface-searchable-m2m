import { ref, Ref, computed } from 'vue';
import type { RelationM2M } from './use-relations';
import type { StagedChangesPayload, DisplayItem } from '../types';

export function useDisplayItems(
  relationInfo: Ref<RelationM2M | undefined>,
  existingItems: Ref<Record<string, any>[]>,
  stagedChanges: Ref<StagedChangesPayload>
) {
  // Single source of truth for UI
  const consolidatedItems = computed<DisplayItem[]>(() => {
    if (!relationInfo.value) return [];
    
    const junctionPkField = relationInfo.value.junctionPrimaryKeyField.field;
    const result: DisplayItem[] = [];
    
    // Start with existing items
    for (const item of existingItems.value) {
      if (!item || stagedChanges.value.delete.includes(item[junctionPkField])) continue;
      
      const matchingUpdate = stagedChanges.value.update.find(
        u => u[junctionPkField] === item[junctionPkField]
      );
      
      const displayItem: DisplayItem = {
        ...item,
        $type: matchingUpdate ? 'updated' : undefined,
        $edits: matchingUpdate || undefined
      };
      
      result.push(displayItem);
    }
    
    // Add staged creations
    stagedChanges.value.create.forEach((item, index) => {
      if (!item) return;
      
      result.push({
        ...item,
        $type: 'created',
        $index: index,
        $local: true
      });
    });
    
    console.log(`[display] Items: ${result.length} (${result.filter(i => i.$type === 'created').length} new)`);
    return result;
  });

  return {
    consolidatedItems
  };
} 