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
						<v-icon
							v-else-if="!disabled && selectAllowed"
							v-tooltip.bottom="selectAllowed ? t('add_existing') : t('not_allowed')"
							:name="iconRight"
							clickable
							@click="selectModalActive = true"
						/>
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
									<template v-for="field in getFieldsFromTemplate(templateWithDefaults)" :key="field">
										<HtmlContent 
											v-if="field.includes('html') && item[field.replace(relationInfo.junctionField.field + '.', '')]" 
											class="field" 
											:content="item[field.replace(relationInfo.junctionField.field + '.', '')]"
										/>
										<template v-else>
											<render-template
												v-if="relationInfo && item"
												:collection="relationInfo.junctionCollection.collection"
												:item="{ 
													[relationInfo.junctionField.field]: {
														...item
													}
												}"
												:template="`{{${field}}}`"
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

		<transition-group v-if="displayedItems.length" name="list" tag="div" class="tags">
			<Draggable
				v-if="isSortable"
				:model-value="displayedItems"
				:disabled="!isSortable"
				@change="handleDragChange"
				item-key="id"
				handle=".drag-handle"
			>
				<template #item="{ element, index }">
					<relation-item
						:item="element"
						:index="index"
						:disabled="disabled"
						:select-allowed="selectAllowed"
						:is-deleted="isItemDeleted(element)"
						:template="templateWithDefaults"
						:collection="relationInfo.junctionCollection.collection"
						:junction-field="relationInfo.junctionField.field"
						:is-sortable="isSortable"
						@edit="openEditDrawer"
						@delete="handleDelete"
						@navigate="openItem"
					/>
				</template>
			</Draggable>

			<template v-else>
				<relation-item
					v-for="(item, index) in displayedItems"
					:key="item[relationInfo.junctionField.field]?.[relationInfo.relatedPrimaryKeyField.field]"
					:item="item"
					:index="index"
					:disabled="disabled"
					:select-allowed="selectAllowed"
					:is-deleted="isItemDeleted(item)"
					:template="templateWithDefaults"
					:collection="relationInfo.junctionCollection.collection"
					:junction-field="relationInfo.junctionField.field"
					:is-sortable="false"
					@edit="openEditDrawer"
					@delete="handleDelete"
					@navigate="openItem"
				/>
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

<script setup lang="ts">
import { computed, ref, toRefs, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { debounce } from 'lodash';
import { Filter } from '@directus/types';
import { useApi, useStores } from '@directus/composables';
import { getEndpoint, getFieldsFromTemplate } from '@directus/utils';
import { useRelationM2M } from './composables/use-relations';
import { useStagedChanges } from './composables/use-staged-changes';
import { useFieldsStore } from '@directus/stores';
import HtmlContent from './components/html-content.vue';
import { useRouter } from 'vue-router';
import RelationItem from './components/relation-item.vue';
import Draggable from 'vuedraggable';

type RelationFK = string | number | BigInt;
type RelationItem = RelationFK | Record<string, any>;

console.log('Version 3')

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
		sortField: null,
	}
);

const emit = defineEmits(['input']);
const { t } = useI18n();
const { value, collection, field } = toRefs(props);
const { relationInfo } = useRelationM2M(collection, field, useStores());
const { useFieldsStore } = useStores();
const fieldsStore = useFieldsStore();

const displayItems = ref<any[]>([]);

const {
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
	handleSort,
	sanitizedForForm
} = useStagedChanges(relationInfo, displayItems, props.referencingField, props.sortField, emit);

const { usePermissionsStore, useUserStore } = useStores();
const { currentUser } = useUserStore();
const { hasPermission } = usePermissionsStore();
const api = useApi();

const router = useRouter();

// Refs
const menuRef = ref(null);
const inputRef = ref<HTMLInputElement | null>(null);
const inputWidth = ref(0);
const localInput = ref<string>('');
const menuActive = ref<boolean>(false);
const suggestedItems = ref<Record<string, any>[]>([]);
const suggestedItemsSelected = ref<number | null>(null);
const editFields = ref({});
const currentIds = ref<(string | number)[]>([]);
const isSearching = ref(false);
const selectModalActive = ref(false);
const wrapperRef = ref<HTMLElement | null>(null);
const menuStyle = ref({
	width: '0px'
});
const resizeObserver = ref<ResizeObserver | null>(null);
const loading = ref(false);

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

const isSortable = computed(() => {
	return !!props.sortField && !props.disabled;
});

// Add a ref to store fetched item data
const stagedItemsData = ref<Record<number | string, Record<string, any>>>({});

// Update the watch for stagedChanges.value.create
watch(
	() => stagedChanges.value.create,
	async (newStagedItems) => {
		if (!relationInfo.value) return;

		const junctionField = relationInfo.value.junctionField.field;
		const relatedCollection = relationInfo.value.relatedCollection.collection;
		const relatedPkField = relationInfo.value.relatedPrimaryKeyField.field;

		const idsToFetch = newStagedItems
			.map(item => item[junctionField]?.[relatedPkField])
			.filter(id => id && !stagedItemsData.value[id]);

		if (idsToFetch.length === 0) return;

		try {
			const templateFields = getFieldsFromTemplate(templateWithDefaults.value || '')
				.map(field => field.replace(`${relationInfo.value.junctionField.field}.`, ''));

			const fields = [
				relatedPkField,
				props.referencingField,
				...templateFields
			];
			

			const response = await api.get(getEndpoint(relatedCollection), {
				params: {
					filter: {
						[relatedPkField]: { _in: idsToFetch }
					},
					fields
				}
			});


			response.data.data.forEach((item: any) => {
				stagedItemsData.value[item[relatedPkField]] = item;
			});
		} catch (error) {
			console.error('Error fetching staged items data:', error);
		}
	},
	{ immediate: true }
);

// Create a new single source of truth for displayed items
const displayedItems = computed(() => {
	if (!relationInfo.value) return [];

	const junctionPkField = relationInfo.value.junctionPrimaryKeyField.field;
	const junctionField = relationInfo.value.junctionField.field;
	const relatedPkField = relationInfo.value.relatedPrimaryKeyField.field;

	// Process existing items with their updates
	const updatedItems = displayItems.value.map(item => {
		const stagedUpdate = stagedChanges.value.update.find(
			update => update[junctionPkField] === item[junctionPkField]
		);
		return {
			...item,
			...stagedUpdate,
			$type: isItemDeleted(item) ? 'deleted' : undefined
		};
	});

	// Process staged items
	const stagedItems = stagedChanges.value.create.map(item => {
		const itemId = item[junctionField]?.[relatedPkField];
		const fetchedData = itemId ? stagedItemsData.value[itemId] : null;

		return {
			...item,
			[junctionField]: {
				...fetchedData,
				...item[junctionField]
			},
			$type: 'created'
		};
	});

	const result = [...updatedItems, ...stagedItems];

	// Sort using the staged sort values
	if (props.sortField) {
		result.sort((a, b) => {
			// First check staged updates for sort values
			const aUpdate = stagedChanges.value.update.find(
				update => update[junctionPkField] === a[junctionPkField]
			);
			const bUpdate = stagedChanges.value.update.find(
				update => update[junctionPkField] === b[junctionPkField]
			);

			const aSort = Number(aUpdate?.[props.sortField!] ?? a[props.sortField!] ?? 0);
			const bSort = Number(bUpdate?.[props.sortField!] ?? b[props.sortField!] ?? 0);
			return aSort - bSort;
		});
	}

	return result;
});

const templateWithDefaults = computed(() => {
	if (!relationInfo.value) return '';

	if (props.template) {
		return props.template.replace(
			/\{\{([^}]+)\}\}/g,
			(match, field) => {
				if (field.includes('.')) return match;
				return `{{${relationInfo.value!.junctionField.field}.${field}}}`;
			}
		);
	}

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

async function handleItemSelection(item: Record<string, any>) {
	if (!relationInfo.value) return;
	const newChanges = await stageExistingItem(item, props.primaryKey);
	if (newChanges) {
		emit('input', sanitizedForForm.value);
		localInput.value = '';
		menuActive.value = false;
	}
}

function select(items: Record<string, any>[]) {
	if (!items || items.length === 0) return;

	items.forEach(async item => {
		const newChanges = await stageDrawerSelection(item, props.primaryKey);
		if (newChanges) {
			emit('input', sanitizedForForm.value);
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
				emit('input', sanitizedForForm.value);
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

	// Get all fields from template without the junction prefix
	const templateFields = getFieldsFromTemplate(relationInfo.value.template || '')
		.map(field => field.replace(`${relationInfo.value.junctionField.field}.`, ''));

	// Get current selected IDs to exclude from search
	const currentIds = displayItems.value
		.map((item: RelationItem) => 
			item[relationInfo.value.junctionField.field]?.[relationInfo.value.relatedPrimaryKeyField.field]
		)
		.filter((id) => id === 0 || !!id);

	const filters: Filter[] = [];

	if (props.filter) {
		filters.push(props.filter);
	}

	if (currentIds.length > 0) {
		filters.push({
			[relationInfo.value.relatedPrimaryKeyField.field]: {
				_nin: currentIds,
			},
		});
	}

	const searchFilter = {
		_or: [
			{
				[props.referencingField]: {
					_icontains: keyword,
				},
			},
			...(props.searchFields?.map(field => ({
				[field]: {
					_icontains: keyword,
				},
			})) || []),
		],
	};

	console.log(searchFilter);
	
	filters.push(searchFilter);

	try {
		const response = await api.get(getEndpoint(relationInfo.value.relatedCollection.collection), {
			params: {
				limit: 10,
				fields: [
					relationInfo.value.relatedPrimaryKeyField.field,
					props.referencingField,
					...templateFields, // Use the cleaned template fields
					...(props.searchFields || []),
				],
				filter: filters.length > 1 ? { _and: filters } : filters[0],
			},
		});

		suggestedItems.value = response?.data?.data || [];
		
		
	} catch (error) {
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
		const fields = [
			...requiredFields.value,
			...getFieldsFromTemplate(relationInfo.value.template || '')
		];

		// Add sortField to fields if it exists
		if (props.sortField) {
			fields.push(props.sortField);
		}

		const response = await api.get(getEndpoint(relationInfo.value.junctionCollection.collection), {
			params: {
				fields,
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
		emit('input', sanitizedForForm.value);
	}
}

// Update the customFilter computed property to exclude selected and staged items
const customFilter = computed(() => {
	if (!relationInfo.value) return {};

	const filter: Filter = {
		_and: []
	};

	// Add the existing filter if provided
	if (props.filter) {
		filter._and.push(props.filter);
	}

	// Get all selected IDs (both existing and staged)
	const selectedIds = displayItems.value
		.map(item => item[relationInfo.value.junctionField.field]?.[relationInfo.value.relatedPrimaryKeyField.field])
		.filter(id => id !== undefined && id !== null);

	// Add staged items IDs
	const stagedIds = stagedChanges.value.create
		.map(item => item[relationInfo.value.junctionField.field]?.id)
		.filter(id => id !== undefined && id !== null);

	// Combine all IDs to exclude
	const idsToExclude = [...selectedIds, ...stagedIds];

	// Only add the exclusion filter if there are IDs to exclude
	if (idsToExclude.length > 0) {
		filter._and.push({
			[relationInfo.value.relatedPrimaryKeyField.field]: {
				_nin: idsToExclude
			}
		});
	}

	return filter;
});

// Add this function to handle drag events
function handleDragChange(event: any) {
	if (event.moved) {
		console.log('Drag event - moving item from index', event.moved.oldIndex, 'to', event.moved.newIndex);
		
		const junctionPkField = relationInfo.value!.junctionPrimaryKeyField.field;
		const junctionField = relationInfo.value!.junctionField.field;
		
		const items = [...displayedItems.value];
		const [movedItem] = items.splice(event.moved.oldIndex, 1);
		items.splice(event.moved.newIndex, 0, movedItem);
		
		const newOrder = items.map((item, index) => {
			const isStaged = item.$type === 'created';
			
			if (isStaged) {
				const order = {
					sort: index + 1,
					...(item[junctionField]?.$tempId ? { $tempId: item[junctionField].$tempId } : {}),
					...(item[junctionField]?.id ? { relatedId: item[junctionField].id, $staged: true } : {})
				};
				console.log('Staged item order:', order);
				return order;
			} else {
				const order = {
					junctionId: item[junctionPkField],
					sort: index + 1
				};
				console.log('Existing item order:', order);
				return order;
			}
		});

		console.log('Final sort order:', newOrder);
		const result = handleSort(newOrder);
		console.log('Sort result:', result);
		
		emit('input', sanitizedForForm.value);
	}
}

function handleDrawerUpdateWithSort(edits: Record<string, any>) {
	if (!relationInfo.value || !editingItem.value) return;
	
	const junctionId = editingItem.value.primaryKey;
	const junctionField = relationInfo.value.junctionField.field;
	const relatedPkField = relationInfo.value.relatedPrimaryKeyField.field;
	const junctionPkField = relationInfo.value.junctionPrimaryKeyField.field;
	
	if (junctionId === '+') {
		return handleDrawerUpdate(edits);
	}

	// Get existing update to preserve sort
	const existingUpdate = stagedChanges.value.update.find(
		update => update[junctionPkField] === junctionId
	);

	const currentItem = displayedItems.value.find(
		item => item[junctionPkField] === junctionId
	);

	// Create merged edits preserving all necessary data
	const mergedEdits = {
		[junctionPkField]: junctionId,
		...existingUpdate, // Preserve existing updates (including sort)
		...edits // Add new edits
	};

	// Properly structure junction field data
	if (edits[junctionField]) {
		mergedEdits[junctionField] = {
			...existingUpdate?.[junctionField], // Preserve existing junction data
			...edits[junctionField], // Add new junction data
			[relatedPkField]: currentItem?.[junctionField]?.[relatedPkField] // Ensure related ID is preserved
		};
	}

	return stageUpdate(mergedEdits, junctionId);
}

function handleUpdate(edits: Record<string, any>) {
	const newStagedChanges = handleDrawerUpdateWithSort(edits);
	if (newStagedChanges) {
		emit('input', sanitizedForForm.value);
		editDrawerActive.value = false;
	}
}

function openItem(item: Record<string, any>) {
	if (!relationInfo.value || !item[relationInfo.value.junctionField.field]) return;
	
	const relatedCollection = relationInfo.value.relatedCollection.collection;
	const relatedId = item[relationInfo.value.junctionField.field][relationInfo.value.relatedPrimaryKeyField.field];
	
	router.push(`/content/${relatedCollection}/${relatedId}`);
}
</script>

<style>
.v-menu-popper {
	max-width: min-content !important;
}
</style>

<style lang="scss" scoped>
.render-template-wrapper {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;

	.field {
		display: inline-flex;
		align-items: center;
	}

	:deep(.render-template) {
		display: inline-flex;
		align-items: center;
	}
}

.menu-list {
	:deep(.render-template-wrapper) {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
}

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

.tags {
	margin-top: 8px;
}

.item-link {
	--v-icon-color: var(--theme--form--field--input--foreground-subdued);
	transition: color var(--fast) var(--transition);
	margin: 0 4px;

	&:hover {
		--v-icon-color: var(--theme--primary);
	}

	&.disabled {
		opacity: 0;
		pointer-events: none;
	}
}

.deselect {
	--v-icon-color: var(--theme--form--field--input--foreground-subdued);
	transition: color var(--fast) var(--transition);
	margin: 0 4px;
	cursor: pointer;

	&:hover {
		--v-icon-color: var(--theme--danger);
	}

	&.deleted {
		--v-icon-color: var(--danger-75);
	}
}

.v-list-item {
	&.deleted {
		--v-list-item-border-color: var(--danger-25);
		--v-list-item-border-color-hover: var(--danger-50);
		--v-list-item-background-color: var(--danger-10);
		--v-list-item-background-color-hover: var(--danger-25);
	}
}
</style>
