import { Ref, ref, computed } from 'vue';
import { Filter } from '@directus/types';
import { useApi } from '@directus/composables';
import { getEndpoint } from '@directus/utils';
import { RelationM2M } from './use-relations';

export type RelationFK = string | number | BigInt;
export type RelationItem = RelationFK | Record<string, any>;

export interface StagedChanges {
    create: Record<string, any>[];
    update: Record<string, any>[];
    delete: string[];
}

interface UseItemManagementOptions {
    relationInfo: Ref<RelationM2M | null>;
    displayItems: Ref<any[]>;
    stagedChanges: Ref<StagedChanges>;
    referencingField: string;
    fetchFields: Ref<string[]>;
    allowMultiple?: boolean;
}

export function useItemManagement(options: UseItemManagementOptions) {
    const { relationInfo, displayItems, stagedChanges, referencingField, fetchFields, allowMultiple } = options;
    const api = useApi();
    const loading = ref(false);

    function fromSeparatedTag(value: string): string[] | null {
        if (!value) return null;
        
        // Check for comma or semicolon separation
        if (value.includes(',') || value.includes(';')) {
            return value
                .split(/[,;]/)
                .map(tag => tag.trim())
                .filter(tag => tag.length > 0);
        }
        
        return null;
    }

    async function stageLocalInput(inputValue: string) {
        if (!inputValue || !referencingField) return;
        
        // If input contains multiple values (comma or semicolon separated)
        if (allowMultiple) {
            const values = fromSeparatedTag(inputValue);
            if (values) {
                const newChanges = { ...stagedChanges.value };
                for (const value of values) {
                    const result = await stageItemObject({ [referencingField]: value.trim() });
                    if (result) {
                        Object.assign(newChanges, result);
                    }
                }
                return newChanges;
            }
        }
        
        // Single value
        return await stageItemObject({ [referencingField]: inputValue.trim() });
    }

    const isItemDeleted = (item: any) => {
        if (!relationInfo.value) return false;
        return stagedChanges.value.delete.includes(item[relationInfo.value.junctionPrimaryKeyField.field]);
    };

    const getItemIcon = (item: any): string => {
        if (!relationInfo.value) return 'close';
        
        const junctionPkField = relationInfo.value.junctionPrimaryKeyField.field;
        
        if (!item[junctionPkField]) {
            return 'delete';
        }
        
        return isItemDeleted(item) ? 'settings_backup_restore' : 'close';
    };

    async function stageItemObject(item: Record<string, RelationItem>) {
        if (!relationInfo.value) return;
        
        const junctionField = relationInfo.value.junctionField.field;
        
        const newStagedChanges = {
            create: [...stagedChanges.value.create],
            update: [...stagedChanges.value.update],
            delete: [...stagedChanges.value.delete]
        };
        
        const newItem = {
            [junctionField]: {
                ...item
            }
        };
        
        newStagedChanges.create.push(newItem);
        displayItems.value = [...displayItems.value, newItem];
        
        return newStagedChanges;
    }

    async function saveEdit(editItem: any) {
        if (!relationInfo.value) return;
        
        const junctionId = editItem?.junction_id;
        const junctionField = relationInfo.value.junctionField.field;
        
        const newStagedChanges = {
            create: [...stagedChanges.value.create],
            update: [...stagedChanges.value.update],
            delete: [...stagedChanges.value.delete]
        };

        if (!junctionId) {
            const displayItemIndex = displayItems.value.findIndex(
                item => !item[relationInfo.value!.junctionPrimaryKeyField.field] && 
                       item[junctionField].name === stagedChanges.value.create[stagedChanges.value.create.length - 1][junctionField].name
            );

            if (displayItemIndex !== -1) {
                newStagedChanges.create[newStagedChanges.create.length - 1] = {
                    [junctionField]: {
                        ...editItem
                    }
                };

                displayItems.value[displayItemIndex] = {
                    [junctionField]: {
                        ...editItem
                    }
                };
            }
        } else {
            const updateIndex = newStagedChanges.update.findIndex(
                update => update.id === junctionId
            );
            if (updateIndex !== -1) {
                newStagedChanges.update.splice(updateIndex, 1);
            }

            newStagedChanges.update.push({
                id: junctionId,
                [junctionField]: editItem
            });
        }
        
        return newStagedChanges;
    }

    function deleteItem(item: any) {
        if (!relationInfo.value) return;
        
        const junctionPkField = relationInfo.value.junctionPrimaryKeyField.field;
        const junctionField = relationInfo.value.junctionField.field;
        const itemId = item[junctionPkField];

        const newStagedChanges = {
            create: [...stagedChanges.value.create],
            update: [...stagedChanges.value.update],
            delete: [...stagedChanges.value.delete]
        };

        if (!itemId) {
            const createIndex = newStagedChanges.create.findIndex(
                createItem => createItem[junctionField].id === item[junctionField].id
            );
            
            if (createIndex !== -1) {
                newStagedChanges.create.splice(createIndex, 1);
            }
        } else {
            const deleteIndex = newStagedChanges.delete.indexOf(itemId);
            
            if (deleteIndex === -1) {
                newStagedChanges.delete.push(itemId);
            } else {
                newStagedChanges.delete.splice(deleteIndex, 1);
            }
        }

        return newStagedChanges;
    }

    async function loadItems(ids: (string | number)[]) {
        if (!relationInfo.value || !ids.length) {
            displayItems.value = [];
            return;
        }
        
        loading.value = true;
        try {
            const response = await api.get(getEndpoint(relationInfo.value.junctionCollection.collection), {
                params: {
                    fields: fetchFields.value,
                    filter: {
                        id: {
                            _in: ids.filter(id => typeof id === 'number').join(','),
                        },
                    },
                    deep: {
                        [relationInfo.value.junctionField.field]: {
                            _filter: {}
                        }
                    }
                },
            });

            if (response?.data?.data) {
                displayItems.value = response.data.data;
            }
        } catch (error) {
            console.error('Error loading items:', JSON.stringify(error));
        } finally {
            loading.value = false;
        }
    }

    async function consolidateDisplay() {
        if (!relationInfo.value) return;
        
        const junctionField = relationInfo.value.junctionField.field;
        const junctionPkField = relationInfo.value.junctionPrimaryKeyField.field;

        try {
            let workingItems = displayItems.value.filter(item => item[junctionPkField]);

            stagedChanges.value.update.forEach(update => {
                const index = workingItems.findIndex(
                    item => item[junctionPkField] === update.id
                );
                if (index !== -1) {
                    workingItems[index] = {
                        ...workingItems[index],
                        [junctionField]: {
                            ...workingItems[index][junctionField],
                            ...update[junctionField]
                        }
                    };
                }
            });

            workingItems = [
                ...workingItems,
                ...stagedChanges.value.create
            ];

            displayItems.value = workingItems;
            
        } catch (error) {
            console.error('Error in consolidateDisplay:', error);
        }
    }

    return {
        loading,
        isItemDeleted,
        getItemIcon,
        stageItemObject,
        saveEdit,
        deleteItem,
        loadItems,
        consolidateDisplay,
        stageLocalInput
    };
} 