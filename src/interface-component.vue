<template>
	<v-notice
		v-if="!relationInfo || !relationInfo.junctionCollection.collection || !relationInfo.relatedCollection.collection"
		type="warning"
	>
		{{ t('relationship_not_setup') }}
	</v-notice>

	<template v-else>
		<v-menu v-if="selectAllowed" v-model="menuActive" attached>
			<template #activator="{ toggle }">
				<v-input
					ref="inputRef"
					v-model="localInput"
					:placeholder="placeholder || t('search_items')"
					:disabled="disabled"
					@keydown="onInputKeyDown"
					@focus="toggle"
				>
					<template v-if="iconLeft" #prepend>
						<v-icon v-if="iconLeft" :name="iconLeft" />
					</template>
					
					<template #append>
						<v-progress-circular v-if="isSearching" indeterminate small />
						<v-button
							v-else-if="!disabled && selectAllowed"
							v-tooltip.bottom="selectAllowed ? t('add_existing') : t('not_allowed')"
							rounded
							icon
							:secondary="true"
							@click="selectModalActive = true"
						>
							<v-icon :name="iconRight" />
						</v-button>
					</template>
				</v-input>
			</template>

			<div class="menu-list">
				<v-list v-if="!disabled && (showAddCustom || suggestedItems.length)">
					<v-list-item v-if="showAddCustom" clickable @click="stageLocalInput">
						<v-list-item-content v-tooltip="t('interfaces.tags.add_tags')" class="add-custom">
							{{
								t('field_in_collection', {
									field: localInput,
									collection: isMulti ? t('select_all') : t('create_item'),
								})
							}}
						</v-list-item-content>
					</v-list-item>

					<v-divider v-if="showAddCustom && suggestedItems.length" />
					<template v-if="suggestedItems.length">

						<v-list-item 
							v-for="(item, index) in suggestedItems"
							:key="item[relationInfo.relatedPrimaryKeyField.field]"
							:active="index === suggestedItemsSelected" 
							clickable 
							@click="() => handleItemSelection(item)"
						>
							<v-list-item-content>
								<div class="render-template-wrapper">
									<template v-for="field in getFieldsFromTemplate(props.template)" :key="field">
										<div v-if="field.includes('html') && item[field.replace(relationInfo.junctionField.field + '.', '')]" 
											class="field" 
											v-html="item[field.replace(relationInfo.junctionField.field + '.', '')]"
										/>
										<template v-else>
											<render-template
												v-if="relationInfo && item"
												:collection="relationInfo.relatedCollection.collection"
												:item="item"
												:template="`{{${field.replace(relationInfo.junctionField.field + '.', '')}}}`"
											/>
										</template>
									</template>
								</div>
							</v-list-item-content>
						</v-list-item>



					</template>
				</v-list>

				<v-list v-else-if="!disabled && localInput && !createAllowed">
					<v-list-item class="no-items">
						{{ t('no_items') }}
					</v-list-item>
				</v-list>
			</div>
		</v-menu>

		<v-skeleton-loader v-if="loading" type="block-list-item" />

		<transition-group v-else-if="consolidatedItems.length" 
			name="list" 
			tag="div" 
			class="tags"
		>
			<template v-if="relationInfo">
				<v-list-item 
					v-for="item in consolidatedItems" 
					:key="item[relationInfo.junctionField.field]?.[relationInfo.relatedPrimaryKeyField.field]"
					v-tooltip="t('Click to edit')" 
					:disabled="disabled || !selectAllowed" 
					class="link block clickable" 
					:style="{ 
						color: isItemDeleted(item) ? 'var(--danger)' : undefined,
						backgroundColor: isItemDeleted(item) ? 'var(--danger-alt)' : undefined
					}"
					@click="openEditDrawer(item)"
				>
					<template v-if="item[relationInfo.junctionField.field]?.$loading">
						<v-skeleton-loader
							type="list-item-icon"
						/>
					</template>
					<template v-else>
					<v-list-item-content>
						<div class="render-template-wrapper">
							<template v-for="field in getFieldsFromTemplate(templateWithDefaults)" :key="field">
									<div v-if="field.includes('html') && item[field]" 
									class="field" 
										v-html="item[field]"
								/>
								<template v-else>
									<render-template
											v-if="relationInfo && item"
										:collection="relationInfo.junctionCollection.collection"
										:item="item"
											:template="`{{${field.includes('.') ? field : relationInfo.junctionField.field + '.' + field}}}`"
										/>
								</template>
							</template>
						</div>
					</v-list-item-content>

					<v-list-item-action>
						<v-icon 
							class="deselect" 
							:name="getItemIcon(item)" 
							:style="{ color: isItemDeleted(item) ? 'var(--danger)' : undefined }"
								@click.stop="handleDelete(item)" 
							v-tooltip="isItemDeleted(item) ? t('Undo Removed Item') : t('Remove Item')" 
						/>
					</v-list-item-action>
					</template>
				</v-list-item>
			</template>
		</transition-group>

		<drawer-item
			v-if="editingItem"
			v-model:active="editDrawerActive"
			:collection="editingItem.collection"
			:primary-key="editingItem.primaryKey"
			:junction-field="editingItem.junctionField"
			:related-primary-key="editingItem.relatedPrimaryKey"
			:edits="editingItem.edits"
			@input="handleUpdate"
		/>

		<drawer-collection
			v-if="!disabled"
			v-model:active="selectModalActive"
			:collection="relationInfo.relatedCollection.collection"
			:filter="customFilter"
			multiple
			@input="select"
		/>
	</template>
</template>

<script lang="ts" setup>
import { computed, ref, toRefs, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { debounce } from 'lodash';
import { Filter } from '@directus/types';
import { useApi, useStores } from '@directus/composables';
import { getEndpoint, getFieldsFromTemplate } from '@directus/utils';
import { useRelationM2M } from './use-relations';
import { useStagedChanges } from './use-staged-changes';
import { useFieldsStore } from '@directus/stores';

type RelationFK = string | number | BigInt;
type RelationItem = RelationFK | Record<string, any>;

const props = withDefaults(
	defineProps<{
		value?: RelationItem[];
		primaryKey: string | number;
		collection: string;
		field: string;
		placeholder?: string | null;
		disabled?: boolean;
		allowCustom?: boolean;
		allowMultiple?: boolean;
		filter?: Filter | null;
		referencingField: string;
		template?: string | null;
		sortField?: string | null;
		sortDirection?: string | null;
		iconLeft?: string | null;
		iconRight?: string | null;
		searchFields: string[];
	}>(),
	{
		value: () => [],
		disabled: false,
		filter: null,
		allowCustom: true,
		sortDirection: 'desc',
		iconRight: 'local_offer',
		template: null,
	}
);

const emit = defineEmits(['input']);
const { t } = useI18n();
const { value, collection, field } = toRefs(props);
const { relationInfo } = useRelationM2M(collection, field, useStores());
const { useFieldsStore } = useStores();
const fieldsStore = useFieldsStore();

const {
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
} = useStagedChanges(relationInfo);

const { usePermissionsStore, useUserStore } = useStores();
const { currentUser } = useUserStore();
const { hasPermission } = usePermissionsStore();
const api = useApi();

// Refs
const menuRef = ref(null);
const inputRef = ref<HTMLInputElement | null>(null);
const inputWidth = ref(0);
const localInput = ref<string>('');
const menuActive = ref<boolean>(false);
const suggestedItems = ref<Record<string, any>[]>([]);
const suggestedItemsSelected = ref<number | null>(null);
const displayItems = ref<any[]>([]);
const editFields = ref({});
const currentIds = ref<(string | number)[]>([]);
const isSearching = ref(false);
const selectModalActive = ref(false);
const wrapperRef = ref<HTMLElement | null>(null);
const menuStyle = ref({
	width: '0px'
});
const resizeObserver = ref<ResizeObserver | null>(null);
const editDrawerActive = ref(false);
const editingItem = ref<{
	collection: string;
	primaryKey: string | number;
	junctionField?: string;
	relatedPrimaryKey?: string | number;
	edits?: Record<string, any>;
} | null>(null);

// Computed
const createAllowed = computed(() => {
	if (currentUser?.role.admin_access === true) return true;
	if (!relationInfo.value || !props.allowCustom) return false;
	return (
		hasPermission(relationInfo.value.relatedCollection.collection, 'create') &&
		hasPermission(relationInfo.value.junctionCollection.collection, 'create')
	);
});

const selectAllowed = computed(() => {
	if (currentUser?.role.admin_access === true) return true;
	if (!relationInfo.value) return false;
	return hasPermission(relationInfo.value.junctionCollection.collection, 'create');
});

const showAddCustom = computed(
	() =>
		createAllowed.value &&
		localInput.value?.trim() &&
		!itemValueAvailable(localInput.value) &&
		!itemValueStaged(localInput.value)
);

const isMulti = computed(() => props.allowMultiple && fromSeparatedTag(localInput.value));

// Add this function to fetch multiple items at once
async function fetchStagedItems(ids: (string | number)[]) {
	if (!relationInfo.value) return null;

	try {
		const response = await api.get(
			getEndpoint(relationInfo.value.relatedCollection.collection),
			{
				params: {
					fields: [
						relationInfo.value.relatedPrimaryKeyField.field,
						props.referencingField,
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
			itemsMap[item[relationInfo.value.relatedPrimaryKeyField.field]] = item;
		});
		return itemsMap;
	} catch (error) {
		console.error('Error fetching item data:', error);
		return null;
	}
}

// Add a ref to store fetched item data
interface StagedItemData {
	data: Record<string, any> | null;
	loading: boolean;
}

const stagedItemsData = ref<Record<string | number, StagedItemData>>({});

// Add a watch to fetch data for newly staged items
watch(
	() => stagedChanges.value.create,
	async (newStagedItems) => {
		const idsToFetch: (string | number)[] = [];
		const junctionField = relationInfo.value?.junctionField.field;
		if (!junctionField) return;

		// Collect all IDs that need fetching
		for (const item of newStagedItems) {
			const itemId = item[junctionField]?.id;
			if (itemId && !stagedItemsData.value[itemId]?.data) {
				idsToFetch.push(itemId);
				stagedItemsData.value[itemId] = {
					data: null,
					loading: true
				};
			}
		}

		if (idsToFetch.length > 0) {
			const itemsData = await fetchStagedItems(idsToFetch);
			if (itemsData) {
				// Update all fetched items at once
				idsToFetch.forEach(id => {
					stagedItemsData.value[id] = {
						data: itemsData[id],
						loading: false
					};
				});
			}
		}
	},
	{ deep: true }
);

const consolidatedItems = computed(() => {
	if (!relationInfo.value) return [];

	const junctionField = relationInfo.value.junctionField.field;
	const items: Record<string, any>[] = [];

	// Add existing items (including deleted ones)
	items.push(
		...displayItems.value.map(item => ({
			...item,
			$type: isItemDeleted(item) ? 'deleted' : undefined
		}))
	);

	// Add staged items
	stagedChanges.value.create.forEach(item => {
		const junctionData = item[junctionField];
		if (!junctionData) return;

		const stagedData = junctionData.id ? stagedItemsData.value[junctionData.id] : null;

		const structuredItem = {
			[relationInfo.value.junctionPrimaryKeyField.field]: null,
			[junctionField]: {
				...(junctionData.id ? stagedData?.data || junctionData : junctionData),
				$staged: true,
				$loading: stagedData?.loading || false
			},
			$type: 'created'
		};

		items.push(structuredItem);
	});

	return items;
});

const templateWithDefaults = computed(() => {
	if (!relationInfo.value) return null;

	if (props.template) {
		// If template fields don't include junction field prefix, add it
		return props.template.replace(
			/\{\{([^}]+)\}\}/g,
			(match, field) => {
				if (field.includes('.')) return match;
				return `{{${relationInfo.value.junctionField.field}.${field}}}`;
			}
		);
	}

	// Default template using the referencing field
	return `{{${relationInfo.value.junctionField.field}.${props.referencingField}}}`;
});

const requiredFields = computed(() => {
	if (!relationInfo.value) return [];

		const junctionField = relationInfo.value.junctionField.field;
	const fields = new Set<string>();

	// Always include primary keys for proper item handling
	fields.add(relationInfo.value.junctionPrimaryKeyField.field);
	fields.add(`${junctionField}.${relationInfo.value.relatedPrimaryKeyField.field}`);

	// Add template fields
	if (props.template) {
		const templateFields = getFieldsFromTemplate(props.template);
		templateFields.forEach(field => {
			// If field already includes junction prefix, add as is
			if (field.startsWith(junctionField)) {
				fields.add(field);
			} else {
				// Otherwise, prefix with junction field
				fields.add(`${junctionField}.${field}`);
			}
		});
	} else {
		// If no template, at least get the referencing field
		fields.add(`${junctionField}.${props.referencingField}`);
	}

	return Array.from(fields);
});

// Helper functions
function itemValueAvailable(value: string): boolean {
	if (!value || !props.referencingField) return false;
	return !!suggestedItems.value.find((item) => item[props.referencingField] === value);
}

function itemValueStaged(value: string): boolean {
	if (!value || !props.referencingField || !relationInfo.value) return false;
	
	const junctionField = relationInfo.value.junctionField.field;
	
	return stagedChanges.value.create.some(item => {
		const junctionItem = item[junctionField];
		return junctionItem && junctionItem[props.referencingField] === value;
	});
}

function fromSeparatedTag(input: string): string[] {
	if (!props.allowMultiple) return [input];

	return input
		.split(/[;,]/)
		.map((x) => x.trim())
		.filter((x) => !!x);
}

// Functions
function saveEdit() {
	if (!relationInfo.value || !editItem.value) return;

	const newChanges = editItem.value.junction_id 
		? stageUpdate(editItem.value)
		: stageCreate(editItem.value);

	if (newChanges) {
		emit('input', newChanges);
		editDrawer.value = false;
	}
}

async function openEditDrawer(item: Record<string, any>) {
	if (!relationInfo.value) return;
	
	const junctionPkField = relationInfo.value.junctionPrimaryKeyField.field;
	const junctionField = relationInfo.value.junctionField.field;
	const junctionId = item[junctionPkField];
	
	// For new items (no junction ID)
	if (!junctionId) {
		// Find any existing staged changes for this item
		const stagedItem = stagedChanges.value.create.find(
			staged => staged[junctionField]?.id === item[junctionField]?.id
		);

		editingItem.value = {
			collection: relationInfo.value.junctionCollection.collection,
			primaryKey: '+',
			junctionField: junctionField,
			edits: {
				// Use staged changes if they exist, otherwise use the original item
				...stagedItem || item
			}
		};
	} else {
		// Existing items with junction ID
		// Find any existing staged updates for this item
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

async function handleItemSelection(item: Record<string, any>) {
	if (!relationInfo.value) return;
	const newChanges = await stageExistingItem(item, props.primaryKey);
	if (newChanges) {
		emit('input', newChanges);
		localInput.value = '';
		menuActive.value = false;
	}
}

function select(items: Record<string, any>[]) {
	if (!items || items.length === 0) return;

	items.forEach(async item => {
		const newChanges = await stageDrawerSelection(item, props.primaryKey);
		if (newChanges) {
			emit('input', newChanges);
		}
	});

	selectModalActive.value = false;
}

async function stageLocalInput() {
	if (!relationInfo.value || !props.referencingField) return;

	const value = localInput.value?.trim();
	if (!value) return;

	// Handle multiple values if allowed
	for (const valueTag of fromSeparatedTag(value)) {
		await stageValue(valueTag.trim());
	}

	localInput.value = '';
	menuActive.value = false;
}

async function stageValue(value: string) {
	if (!value || itemValueStaged(value)) return;

	try {
		const existingItem = await findExistingItem(value, props.referencingField, props.template);
		if (existingItem) {
			handleItemSelection(existingItem);
		} else if (createAllowed.value && props.referencingField) {
			const newChanges = await stageNewItem(value, props.primaryKey, props.referencingField);
			if (newChanges) {
				emit('input', newChanges);
			}
		}
	} catch (err) {
		console.error('Error staging value:', err);
	}
}

// Update onInputKeyDown to handle Enter key
function onInputKeyDown(event: KeyboardEvent) {
	if (event.key === 'Enter') {
		event.preventDefault();
		if (suggestedItemsSelected.value !== null && suggestedItems.value[suggestedItemsSelected.value]) {
			handleItemSelection(suggestedItems.value[suggestedItemsSelected.value]);
		} else if (createAllowed.value) {
			stageLocalInput();
		}
		return;
	}
	
	// ... rest of keyboard handling
}

// Lifecycle hooks
onMounted(() => {
	if (wrapperRef.value) {
		resizeObserver.value = new ResizeObserver((entries) => {
			for (const entry of entries) {
				if (entry.target === wrapperRef.value) {
					const width = entry.contentRect.width;
					const scrollbarWidth = entry.target.offsetWidth - width;
					menuStyle.value = {
						width: `${width - scrollbarWidth}px`
					};
				}
			}
		});
		resizeObserver.value.observe(wrapperRef.value);
	}
});

onUnmounted(() => {
	if (resizeObserver.value) {
		resizeObserver.value.disconnect();
	}
});

// Add this watch effect after other watch statements
watch(
	localInput,
	debounce((newValue: string) => {
		menuActive.value = !!newValue;
		refreshSuggestions(newValue);
	}, 300)
);

async function refreshSuggestions(keyword: string) {
	if (!relationInfo.value || !props.referencingField) {
		suggestedItems.value = [];
		return;
	}

	suggestedItemsSelected.value = null;
	if (!keyword || keyword.length < 1) {
		suggestedItems.value = [];
		return;
	}

	isSearching.value = true;

	// Get current selected IDs to exclude from search
	const currentIds = displayItems.value
		.map((item: RelationItem) => 
			item[relationInfo.value.junctionField.field]?.[relationInfo.value.relatedPrimaryKeyField.field]
		)
		.filter((id) => id === 0 || !!id);

	const filters: Filter[] = [];

	// Add the custom filter if it exists
	if (props.filter) {
		filters.push(props.filter);
	}

	// Add the current IDs filter to exclude already selected items
	if (currentIds.length > 0) {
		filters.push({
			[relationInfo.value.relatedPrimaryKeyField.field]: {
				_nin: currentIds,
			},
		});
	}

	// Create search filter for all searchable fields
	const searchFilter = {
		_or: [
			// Always include the referencing field
			{
				[props.referencingField]: {
					_icontains: keyword,
				},
			},
			// Add additional search fields if provided
			...(props.searchFields?.map(field => ({
			[field]: {
				_icontains: keyword,
				},
			})) || []),
		],
	};
	
	filters.push(searchFilter);

	try {
		const response = await api.get(getEndpoint(relationInfo.value.relatedCollection.collection), {
			params: {
				limit: 10,
				fields: [
					relationInfo.value.relatedPrimaryKeyField.field,
					props.referencingField,
					...getFieldsFromTemplate(props.template || ''),
					...(props.searchFields || []),
				],
				filter: filters.length > 1 ? { _and: filters } : filters[0],
			},
		});

		suggestedItems.value = response?.data?.data || [];
	} catch (error) {
		console.error('Error fetching suggestions:', error);
		suggestedItems.value = [];
	} finally {
		isSearching.value = false;
	}
}

async function loadExistingItems() {
	if (!relationInfo.value) return;
	// Make sure primaryKey is a valid number or string, not NaN, undefined, or null
	if (!props.primaryKey || props.primaryKey === '+' || (typeof props.primaryKey === 'number' && isNaN(props.primaryKey))) {
		displayItems.value = [];
		return;
	}
	
	try {
		const response = await api.get(getEndpoint(relationInfo.value.junctionCollection.collection), {
			params: {
				fields: [
					...requiredFields.value
				],
				filter: {
					[relationInfo.value.reverseJunctionField.field]: props.primaryKey
				}
			}
		});

		displayItems.value = response.data.data || [];
	} catch (error) {
		console.error('Error loading items:', error);
		displayItems.value = [];
	}
}

// Update the watch to also handle '+' primaryKey
watch(
	() => props.primaryKey,
	(newKey) => {
		if (newKey && newKey !== '+' && !(typeof newKey === 'number' && isNaN(newKey))) {
			loadExistingItems();
		} else {
			displayItems.value = [];
		}
	},
	{ immediate: true }
);

// Watch for when the value prop is reset (indicating a save)
watch(
	() => displayItems.value,
	(newItems) => {
		// When displayItems changes, it means the items were reloaded after a save
		if (newItems && newItems.length > 0) {
			const newStagedChanges = {
				create: [],
				update: [],
				delete: []
			};
			stagedChanges.value = newStagedChanges;
		}
	}
);

function getItemIcon(item: Record<string, any>): string {
	if (!relationInfo.value) return 'close';
	
	const junctionPkField = relationInfo.value.junctionPrimaryKeyField.field;
	
	// For newly created items (no junction ID)
	if (!item[junctionPkField]) {
		return 'delete';
	}
	
	// For existing items, show restore if marked for deletion, otherwise close
	return isItemDeleted(item) ? 'settings_backup_restore' : 'close';
}

function handleDelete(item: Record<string, any>) {
	const newStagedChanges = deleteItem(item);
	if (newStagedChanges) {
		emit('input', newStagedChanges);
	}
}

// Add computed property for selected primary keys
const selectedPrimaryKeys = computed(() => {
	if (!relationInfo.value) return [];

	const junctionField = relationInfo.value.junctionField.field;
	const relatedPkField = relationInfo.value.relatedPrimaryKeyField.field;

	// Get IDs from existing items
	const existingIds = displayItems.value
		.filter(item => !isItemDeleted(item))
		.map(item => item[junctionField]?.[relatedPkField])
		.filter(id => id !== undefined);

	// Get IDs from staged items
	const stagedIds = stagedChanges.value.create
		.map(item => item[junctionField]?.id)
		.filter(id => id !== undefined);

	return [...existingIds, ...stagedIds];
});

// Add computed property for custom filter
const customFilter = computed(() => {
	const filter: Filter = {
		_and: [],
	};

	// Add the custom filter if it exists
	if (props.filter) {
		filter._and.push(props.filter);
	}

	// Add filter to exclude already selected items
	if (selectedPrimaryKeys.value.length > 0) {
		filter._and.push({
			[relationInfo.value.relatedPrimaryKeyField.field]: {
				_nin: selectedPrimaryKeys.value,
			},
		});
	}

	return filter;
});

function handleUpdate(edits: Record<string, any>) {
	if (!relationInfo.value) return;
	
	const junctionId = editingItem.value?.primaryKey;
	const junctionField = relationInfo.value.junctionField.field;
	
	console.log('Handling update:', {
		edits,
		junctionId,
		editingItem: editingItem.value,
		stagedChanges: stagedChanges.value
	});
	
	// Check if this is a newly created item
	const isNewItem = junctionId === '+';
	
	if (isNewItem) {
		// Find the created item in the staged changes
		const createdItem = stagedChanges.value.create.find(
			item => item[junctionField]?.id === editingItem.value?.edits?.[junctionField]?.id
		);

		const relatedId = createdItem?.[junctionField]?.id;

		// Handle updates for newly created items
		const newStagedChanges = stageUpdate(
			edits, 
			junctionId, 
			relatedId,
			true
		);
		console.log('Staged changes for new item:', newStagedChanges);
		if (newStagedChanges) {
			emit('input', newStagedChanges);
			editDrawerActive.value = false;
		}
	} else {
		// Handle updates for existing items
		const originalItem = displayItems.value.find(
			item => item[relationInfo.value.junctionPrimaryKeyField.field] === junctionId
		);
		const relatedItemId = originalItem?.[junctionField]?.id;
	
		const newStagedChanges = stageUpdate(edits, junctionId, relatedItemId);
		if (newStagedChanges) {
			emit('input', newStagedChanges);
			editDrawerActive.value = false;
		}
	}
}
</script>

<style lang="scss" scoped>
.v-list-item {
  &.loading {
    opacity: 0.7;
    pointer-events: none;
  }

  .loading-indicator {
    margin: 0 auto;
  }

  &.deleted {
    --v-list-item-border-color: var(--danger-25);
    --v-list-item-border-color-hover: var(--danger-50);
    --v-list-item-background-color: var(--danger-10);
    --v-list-item-background-color-hover: var(--danger-25);
    
    :deep(.v-icon) {
      color: var(--danger-75);
    }
  }
}
</style>
