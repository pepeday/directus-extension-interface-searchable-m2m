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
  referencingField: string,
  sortField?: string | null,
  emit?: (event: string, ...args: any[]) => void
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
    
    
    
    // For new items with $tempId
    if (junctionId === '+' && edits[junctionField]?.$tempId) {
      const tempId = edits[junctionField].$tempId;
      const itemIndex = stagedChanges.value.create.findIndex(item => 
        item[junctionField]?.$tempId === tempId
      );

      if (itemIndex !== -1) {
        const updatedCreate = [...stagedChanges.value.create];
        updatedCreate[itemIndex] = {
          ...updatedCreate[itemIndex],
          ...edits
        };

        const newStagedChanges = {
          ...stagedChanges.value,
          create: updatedCreate
        };

        stagedChanges.value = newStagedChanges;
        return newStagedChanges;
      }
    }
    
    // For staged items (existing items that were just added)
    if (edits[junctionField]?.id && edits[junctionField]?.$staged) {
      const itemId = edits[junctionField].id;
      const itemIndex = stagedChanges.value.create.findIndex(item => 
        item[junctionField]?.id === itemId && item[junctionField]?.$staged
      );

      if (itemIndex !== -1) {
        const updatedCreate = [...stagedChanges.value.create];
        updatedCreate[itemIndex] = {
          ...updatedCreate[itemIndex],
          [junctionField]: {
            ...edits[junctionField],
            $staged: true
          }
        };

        const newStagedChanges = {
          ...stagedChanges.value,
          create: updatedCreate
        };

        stagedChanges.value = newStagedChanges;
        return newStagedChanges;
      }
    }
    
    // For existing items
    return stageUpdate(edits, junctionId);
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

    // Get the full item data first
    const itemData = await fetchStagedItems([item[relatedPkField]]);
    const fullItemData = itemData?.[item[relatedPkField]];

    // Create staged item with full data
    const stagedItem = {
      [junctionField]: {
        ...fullItemData,  // Include all item data
        id: item[relatedPkField],
        $staged: true
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

  async function fetchStagedItems(ids: (string | number)[], template?: string) {
    if (!relationInfo.value) return null;

    try {
      const response = await api.get(
        getEndpoint(relationInfo.value.relatedCollection.collection),
        {
          params: {
            fields: [
              relationInfo.value.relatedPrimaryKeyField.field,
              referencingField,
              ...getFieldsFromTemplate(template || '')
            ],
            filter: {
              [relationInfo.value.relatedPrimaryKeyField.field]: {
                _in: ids
              }
            }
          }
        }
      );

      const itemsMap: Record<string | number, any> = {};
      response.data.data.forEach((item: any) => {
        itemsMap[item[relationInfo.value!.relatedPrimaryKeyField.field]] = item;
      });
      return itemsMap;
    } catch (error) {
      console.error('Error fetching item data:', error);
      return null;
    }
  }

  function handleSort(items: any[]) {

    
    if (!relationInfo.value || !sortField) {
      return;
    }
    
    const junctionPkField = relationInfo.value.junctionPrimaryKeyField.field;
    const junctionField = relationInfo.value.junctionField.field;

    // Process each item to update its sort value
    items.forEach((item, index) => {
      const newSortValue = index + 1;
      
      // Log the raw item first

      
      // Check if this is a new item by looking for $tempId or $staged
      const junctionData = item[junctionField];
      const isNewItem = !item[junctionPkField] && junctionData && 
        (junctionData.$tempId || junctionData.$staged);



      if (isNewItem) {
        // Find matching item in create array
        
        const createIndex = stagedChanges.value.create.findIndex(createItem => {
          const createJunctionData = createItem[junctionField];


          if (!createJunctionData) return false;

          // Match by tempId
          if (junctionData.$tempId && createJunctionData.$tempId) {
            const matches = junctionData.$tempId === createJunctionData.$tempId;
            return matches;
          }
          
          // Match by id for staged items
          if (junctionData.$staged && createJunctionData.$staged) {
            const matches = junctionData.id === createJunctionData.id;
            return matches;
          }

          return false;
        });

        if (createIndex !== -1) {
          const updatedItem = {
            ...stagedChanges.value.create[createIndex],
            [sortField]: newSortValue
          };
          
          stagedChanges.value.create[createIndex] = updatedItem;
        }
      } else if (item[junctionPkField]) {
        // Handle existing items
        const existingUpdateIndex = stagedChanges.value.update.findIndex(
          update => update[junctionPkField] === item[junctionPkField]
        );

        const updateItem = {
          [junctionPkField]: item[junctionPkField],
          [sortField]: newSortValue
        };

        if (existingUpdateIndex !== -1) {
          stagedChanges.value.update[existingUpdateIndex] = {
            ...stagedChanges.value.update[existingUpdateIndex],
            ...updateItem
          };
        } else {
          stagedChanges.value.update.push(updateItem);
        }
      }
    });

    stagedChanges.value = {
      ...stagedChanges.value,
      create: [...stagedChanges.value.create],
      update: [...stagedChanges.value.update]
    };
    emit('input', stagedChanges.value);
    return stagedChanges.value;
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
    fetchStagedItems,
    handleSort
  };
} 