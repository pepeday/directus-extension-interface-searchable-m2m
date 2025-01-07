import { ref, Ref } from 'vue';
import { RelationM2MTypes } from './types';
import { useApi } from '@directus/composables';
import { getEndpoint, getFieldsFromTemplate } from '@directus/utils';

export interface StagedChanges {
  create: Record<string, any>[];
  update: Record<string, any>[];
  delete: string[];
}

export function useStagedChanges(relationInfo: Ref<RelationM2MTypes | null>) {
  const stagedChanges = ref<StagedChanges>({
    create: [],
    update: [],
    delete: []
  });

  const editDrawer = ref(false);
  const editItem = ref<Record<string, any> | null>(null);
  const api = useApi();

  function stageUpdate(item: Record<string, any>) {
    if (!relationInfo.value) return;
    
    const junctionField = relationInfo.value.junctionField.field;
    const junctionId = item.junction_id;

    const newStagedChanges = {
      ...stagedChanges.value,
      update: [...stagedChanges.value.update]
    };

    const updateIndex = newStagedChanges.update.findIndex(
      update => update.id === junctionId
    );

    if (updateIndex !== -1) {
      newStagedChanges.update.splice(updateIndex, 1);
    }

    newStagedChanges.update.push({
      id: junctionId,
      [junctionField]: {
        ...item
      }
    });

    stagedChanges.value = newStagedChanges;
    return newStagedChanges;
  }

  function stageCreate(item: Record<string, any>) {
    if (!relationInfo.value) return;
    
    const newStagedChanges = {
      ...stagedChanges.value,
      create: [...stagedChanges.value.create]
    };

    newStagedChanges.create.push({
      ...item
    });

    stagedChanges.value = newStagedChanges;
    return newStagedChanges;
  }

  async function stageNewItem(value: string, primaryKey: string | number, referencingField: string) {
    if (!relationInfo.value) return;

    const junctionField = relationInfo.value.junctionField.field;
    const newItem = {
      [junctionField]: {
        [referencingField]: value
      }
    };

    return stageCreate(newItem);
  }

  async function stageExistingItem(item: Record<string, any>, primaryKey: string | number) {
    if (!relationInfo.value) return;

    const junctionField = relationInfo.value.junctionField.field;
    const relatedPkField = relationInfo.value.relatedPrimaryKeyField.field;

    const newItem = {
      [relationInfo.value.reverseJunctionField.field]: primaryKey,
      [junctionField]: {
        id: item[relatedPkField]
      }
    };

    return stageCreate(newItem);
  }

  async function stageDrawerSelection(item: string | number | Record<string, any>, primaryKey: string | number) {
    if (!relationInfo.value) return;

    const junctionField = relationInfo.value.junctionField.field;
    const relatedPkField = relationInfo.value.relatedPrimaryKeyField.field;

    const itemId = typeof item === 'string' || typeof item === 'number' ? item : item[relatedPkField];

    const newItem = {
      [relationInfo.value.reverseJunctionField.field]: primaryKey,
      [junctionField]: {
        id: itemId
      }
    };

    return stageCreate(newItem);
  }

  async function findExistingItem(keyword: string, referencingField: string, template: string | null): Promise<Record<string, any> | null> {
    if (!relationInfo.value) return null;

    try {
      const response = await api.get(getEndpoint(relationInfo.value.relatedCollection.collection), {
        params: {
          limit: 1,
          fields: [
            relationInfo.value.relatedPrimaryKeyField.field,
            referencingField,
            ...getFieldsFromTemplate(template || '')
          ],
          filter: {
            [referencingField]: {
              _eq: keyword
            }
          }
        }
      });

      return response?.data?.data?.[0] || null;
    } catch (error) {
      console.error('Error finding item:', error);
      return null;
    }
  }

  function isItemDeleted(item: Record<string, any>): boolean {
    if (!relationInfo.value) return false;
    const junctionPkField = relationInfo.value.junctionPrimaryKeyField.field;
    return stagedChanges.value.delete.includes(item[junctionPkField]);
  }

  function deleteItem(item: Record<string, any>) {
    if (!relationInfo.value) return;

    const junctionPkField = relationInfo.value.junctionPrimaryKeyField.field;
    const junctionId = item[junctionPkField];
    
    console.log('Deleting item:', {
      junctionPkField,
      junctionId,
      currentDeleteArray: stagedChanges.value.delete
    });
    
    if (!junctionId) return;

    const newStagedChanges = {
      ...stagedChanges.value
    };

    // Check if ID is already in delete array
    if (stagedChanges.value.delete.includes(junctionId)) {
      console.log('Item already in delete array - removing it');
      // Remove it if it's there (undo deletion)
      newStagedChanges.delete = stagedChanges.value.delete.filter(id => id !== junctionId);
    } else {
      console.log('Item not in delete array - adding it');
      // Add it if it's not there (mark for deletion)
      newStagedChanges.delete = [...stagedChanges.value.delete, junctionId];
    }

    console.log('New staged changes:', newStagedChanges);
    stagedChanges.value = newStagedChanges;
    return newStagedChanges;
  }

  return {
    stagedChanges,
    editDrawer,
    editItem,
    stageUpdate,
    stageCreate,
    stageNewItem,
    stageExistingItem,
    stageDrawerSelection,
    findExistingItem,
    isItemDeleted,
    deleteItem
  };
} 