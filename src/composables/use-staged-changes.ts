import { ref, Ref, computed } from 'vue';
import { RelationM2MTypes } from './types';
import { useApi } from '@directus/composables';
import { getEndpoint, getFieldsFromTemplate } from '@directus/utils';

export interface StagedChanges {
  create: Record<string, any>[];
  update: Record<string, any>[];
  delete: string[];
}

export function useStagedChanges(
  relationInfo: Ref<RelationM2MTypes | null>,
  displayItems: Ref<any[]>,
  referencingField: string
) {
  // Add type safety check
  if (!displayItems.value) {
    displayItems.value = [];
  }

  const stagedChanges = ref<StagedChanges>({
    create: [],
    update: [],
    delete: []
  });

  const editDrawer = ref(false);
  const editingItem = ref<{
    collection: string;
    primaryKey: string | number;
    junctionField?: string;
    relatedPrimaryKey?: string | number;
    edits?: Record<string, any>;
  } | null>(null);
  const editDrawerActive = ref(false);
  const api = useApi();

  // Add computed for selected primary keys
  const selectedPrimaryKeys = computed(() => {
    if (!relationInfo.value) return [];

    const junctionField = relationInfo.value.junctionField.field;
    const relatedPkField = relationInfo.value.relatedPrimaryKeyField.field;

    // Get IDs from staged items
    const stagedIds = stagedChanges.value.create
      .map(item => item[junctionField]?.id)
      .filter(id => id !== undefined);

    return stagedIds;
  });

  // Function to open edit drawer
  async function openEditDrawer(item: Record<string, any>, index: number) {
    if (!relationInfo.value) return;
    
    const junctionPkField = relationInfo.value.junctionPrimaryKeyField.field;
    const junctionField = relationInfo.value.junctionField.field;
    const junctionId = item[junctionPkField];
    
    // For new items (no junction ID)
    if (!junctionId) {
      // Get the staged item at the same relative position in the create array
      const displayItemsLength = displayItems.value?.length || 0;
      const stagedItemIndex = index - displayItemsLength;
      const stagedItem = stagedChanges.value.create[stagedItemIndex];
      
      editingItem.value = {
        collection: relationInfo.value.junctionCollection.collection,
        primaryKey: '+',
        junctionField: junctionField,
        relatedPrimaryKey: item[junctionField]?.id,
        edits: {
          ...stagedItem || item
        }
      };
    } else {
      // Existing items with junction ID
      const stagedUpdate = stagedChanges.value.update.find(
        update => update[junctionPkField] === junctionId
      );

      editingItem.value = {
        collection: relationInfo.value.junctionCollection.collection,
        primaryKey: junctionId,
        junctionField: junctionField,
        edits: stagedUpdate || undefined
      };
    }
    
    editDrawerActive.value = true;
  }

  function generateTempId() {
    return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Function to handle updates from drawer
  function handleDrawerUpdate(edits: Record<string, any>) {
    if (!relationInfo.value || !editingItem.value) return;
    
    const junctionId = editingItem.value.primaryKey;
    const junctionField = relationInfo.value.junctionField.field;
    const relatedPkField = relationInfo.value.relatedPrimaryKeyField.field;
    
    console.log('Handling drawer update:', {
      edits,
      junctionId,
      junctionField,
      editingItem: editingItem.value,
      currentStagedChanges: stagedChanges.value
    });
    
    const isNewItem = junctionId === '+';
    
    if (isNewItem) {
      const originalItem = editingItem.value.edits;
      const tempId = originalItem?.[junctionField]?.$tempId;

      console.log('Updating new item:', { tempId, originalItem });

      // Find the item by its temporary ID
      const itemIndex = stagedChanges.value.create.findIndex(item => 
        item[junctionField]?.$tempId === tempId
      );

      console.log('Found item at index:', itemIndex);

      if (itemIndex !== -1) {
        const updatedCreate = [...stagedChanges.value.create];
        const existingItem = updatedCreate[itemIndex];
        
        // Merge the existing item with the new edits, preserving the tempId
        const updatedItem = {
          [junctionField]: {
            ...existingItem[junctionField],
            ...edits[junctionField],
            $tempId: tempId
          }
        };
        
        updatedCreate[itemIndex] = updatedItem;
        console.log('Updated item:', updatedItem);

        const newStagedChanges = {
          ...stagedChanges.value,
          create: updatedCreate
        };

        console.log('New staged changes:', newStagedChanges);
        stagedChanges.value = newStagedChanges;
        return newStagedChanges;
      }
    } else {
      // Handle updates for existing items
      console.log('Updating existing item');
      
      // Find any existing update for this item (including sort)
      const existingUpdate = stagedChanges.value.update.find(
        update => update[relationInfo.value!.junctionPrimaryKeyField.field] === junctionId
      );

      // Find the current item in displayItems to get the related item's ID
      const currentItem = displayItems.value.find(
        item => item[relationInfo.value!.junctionPrimaryKeyField.field] === junctionId
      );

      const relatedItemId = currentItem?.[junctionField]?.[relatedPkField];

      // Merge the edits with existing update data
      const mergedEdits = {
        ...existingUpdate, // Keep existing data (including sort)
        ...edits, // Add new edits
        [relationInfo.value.junctionPrimaryKeyField.field]: junctionId, // Ensure junction ID is preserved
        [junctionField]: {
          ...existingUpdate?.[junctionField], // Keep existing junction field data
          ...edits[junctionField], // Add new junction field edits
          [relatedPkField]: relatedItemId // Ensure related item ID is preserved using the correct PK field
        }
      };

      console.log('Merged edits:', mergedEdits);
      return stageUpdate(mergedEdits, junctionId);
    }
  }

  function stageUpdate(
    edits: Record<string, any>,
    junctionId?: string | number
  ) {
    if (!relationInfo.value) return;
    
    const junctionPkField = relationInfo.value.junctionPrimaryKeyField.field;
    const junctionField = relationInfo.value.junctionField.field;
    const relatedPkField = relationInfo.value.relatedPrimaryKeyField.field;

    // Handle updates for existing items
    if (junctionId && junctionId !== '+') {
      const newStagedChanges = {
        ...stagedChanges.value,
        update: [...stagedChanges.value.update]
      };

      // Find existing update
      const updateIndex = newStagedChanges.update.findIndex(
        update => update[junctionPkField] === junctionId
      );

      // Get the current item to preserve related ID
      const currentItem = displayItems.value.find(
        item => item[junctionPkField] === junctionId
      );

      // Create the update structure, preserving existing fields
      const existingUpdate = updateIndex !== -1 ? newStagedChanges.update[updateIndex] : {};
      
      const updateItem = {
        ...existingUpdate,
        [junctionPkField]: junctionId,
        ...edits
      };

      // Ensure junction field data is properly structured
      if (edits[junctionField]) {
        updateItem[junctionField] = {
          ...existingUpdate[junctionField],
          ...edits[junctionField]
        };

        // Always include the related item ID if we have it
        if (currentItem?.[junctionField]?.[relatedPkField]) {
          updateItem[junctionField][relatedPkField] = currentItem[junctionField][relatedPkField];
        }
      }

      if (updateIndex !== -1) {
        newStagedChanges.update[updateIndex] = updateItem;
      } else {
        newStagedChanges.update.push(updateItem);
      }

      stagedChanges.value = newStagedChanges;
      return newStagedChanges;
    }
  }

  function stageCreate(item: Record<string, any>) {
    if (!relationInfo.value) return;
    
    const junctionField = relationInfo.value.junctionField.field;
    
    // Match Case 1 & 2 from staging-cases
    const stagedItem = {
      [junctionField]: {
        ...(item[junctionField] || {}), // Keep existing data
        $staged: true
      }
    };

    const newStagedChanges = {
      ...stagedChanges.value,
      create: [...stagedChanges.value.create, stagedItem]
    };

    stagedChanges.value = newStagedChanges;
    return newStagedChanges;
  }

  function stageNewItem(item: Record<string, any> | string) {
    if (!relationInfo.value) return;

    const junctionField = relationInfo.value.junctionField.field;
    const relatedPkField = relationInfo.value.relatedPrimaryKeyField.field;
    const tempId = generateTempId();
    
    // If item is a string, it's a text input for creating a new item
    if (typeof item === 'string') {
      const stagedItem = {
        [junctionField]: {
          [referencingField]: item,
          $tempId: tempId
        }
      };

      const newStagedChanges = {
        ...stagedChanges.value,
        create: [...stagedChanges.value.create, stagedItem]
      };

      stagedChanges.value = newStagedChanges;
      return newStagedChanges;
    }

    // If item is an object, it's an existing item being selected
    const stagedItem = {
      [junctionField]: {
        ...(item[junctionField] || {}),
        [relatedPkField]: item[relatedPkField], // Use the correct PK field
        $tempId: tempId
      }
    };

    const newStagedChanges = {
      ...stagedChanges.value,
      create: [...stagedChanges.value.create, stagedItem]
    };

    stagedChanges.value = newStagedChanges;
    return newStagedChanges;
  }

  async function stageExistingItem(item: Record<string, any>, primaryKey: string | number) {
    if (!relationInfo.value) return;

    const junctionField = relationInfo.value.junctionField.field;
    const relatedPkField = relationInfo.value.relatedPrimaryKeyField.field;

    // Only include the junction field data
    const stagedItem = {
      [junctionField]: {
        [relatedPkField]: item[relatedPkField]
      }
    };

    return stageCreate(stagedItem);
  }

  async function stageDrawerSelection(item: string | number | Record<string, any>, primaryKey: string | number) {
    if (!relationInfo.value) return;

    const junctionField = relationInfo.value.junctionField.field;
    const relatedPkField = relationInfo.value.relatedPrimaryKeyField.field;

    const itemId = typeof item === 'string' || typeof item === 'number' 
      ? item 
      : item[relatedPkField];

    // Only include the junction field data
    const stagedItem = {
      [junctionField]: {
        [relatedPkField]: itemId
      }
    };

    return stageCreate(stagedItem);
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
    const junctionField = relationInfo.value.junctionField.field;
    const junctionId = item[junctionPkField];
    
    // For newly created items (Case 6)
    if (!junctionId) {
      const tempId = item[junctionField]?.$tempId;
      const itemIndex = stagedChanges.value.create.findIndex(staged => 
        staged[junctionField]?.$tempId === tempId
      );

      const newStagedChanges = {
        ...stagedChanges.value,
        create: stagedChanges.value.create.filter((_, index) => index !== itemIndex)
      };
      
      stagedChanges.value = newStagedChanges;
      return newStagedChanges;
    }

    // For existing items (Case 5)
    const newStagedChanges = {
      ...stagedChanges.value
    };

    if (stagedChanges.value.delete.includes(junctionId)) {
      newStagedChanges.delete = stagedChanges.value.delete.filter(id => id !== junctionId);
    } else {
      newStagedChanges.delete = [...stagedChanges.value.delete, junctionId];
    }

    stagedChanges.value = newStagedChanges;
    return newStagedChanges;
  }

  async function fetchStagedItems(ids: (string | number)[]) {
    if (!relationInfo.value) return null;

    try {
      const response = await api.get(
        getEndpoint(relationInfo.value.relatedCollection.collection),
        {
          params: {
            fields: [
              relationInfo.value.relatedPrimaryKeyField.field,
              referencingField,
              ...getFieldsFromTemplate(props.template || '')
            ],
            filter: {
              [relationInfo.value.relatedPrimaryKeyField.field]: {
                _in: ids
              }
            }
          }
        }
      );
      // Convert array to map for easier lookup
      const itemsMap: Record<string | number, any> = {};
      response.data.data.forEach((item: any) => {
        const pkField = relationInfo.value!.relatedPrimaryKeyField.field;
        itemsMap[item[pkField]] = item;
      });
      return itemsMap;
    } catch (error) {
      console.error('Error fetching item data:', error);
      return null;
    }
  }

  return {
    stagedChanges,
    editDrawer,
    editingItem,
    editDrawerActive,
    selectedPrimaryKeys,
    stageUpdate,
    stageCreate,
    stageNewItem,
    stageExistingItem,
    stageDrawerSelection,
    findExistingItem,
    isItemDeleted,
    deleteItem,
    openEditDrawer,
    handleDrawerUpdate,
    fetchStagedItems
  };
} 