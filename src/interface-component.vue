<template>
	<v-notice
		v-if="!relationInfo || !relationInfo.junctionCollection.collection || !relationInfo.relatedCollection.collection"
		type="warning">
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
							secondary
							@click="selectModalActive = true"
						>
							<v-icon :name="iconRight"/>
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
							@click="() => stageItemObject(item)"
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

		<transition-group v-else-if="displayItems.length" 
			name="list" 
			tag="div" 
			class="tags"
		>
			<template v-if="relationInfo">
				<v-list-item 
					v-for="item in displayItems" 
					:key="item[relationInfo.junctionField.field]?.[relationInfo.relatedPrimaryKeyField.field]"
					v-tooltip="t('Click to edit')" 
					:disabled="disabled || !selectAllowed" 
					class="link block clickable" 
					:style="{ 
						color: isItemDeleted(item) ? 'var(--danger)' : undefined,
						backgroundColor: isItemDeleted(item) ? 'var(--danger-alt)' : undefined
					}"
					@click="openEditDrawer(item, relationInfo.junctionField.field, props)"
				>
					<v-list-item-content>
						<div class="render-template-wrapper">
							<template v-for="field in getFieldsFromTemplate(templateWithDefaults)" :key="field">
								<div v-if="field.includes('html') && item[relationInfo.junctionField.field]?.[field.replace(relationInfo.junctionField.field + '.', '')]" 
									class="field" 
									v-html="item[relationInfo.junctionField.field][field.replace(relationInfo.junctionField.field + '.', '')]"
								/>
								<template v-else>
									<render-template
										v-if="relationInfo && item[relationInfo.junctionField.field]"
										:collection="relationInfo.junctionCollection.collection"
										:item="item"
										:template="`{{${field}}}`"
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
							@click.stop="handleDeleteItem(item)" 
							v-tooltip="isItemDeleted(item) ? t('Undo Removed Item') : t('Remove Item')" 
						/>
					</v-list-item-action>
				</v-list-item>
			</template>
		</transition-group>



		<drawer-item
			v-model:active="editDrawer"
			:collection="relationInfo.relatedCollection.collection"
			:primary-key="currentlyEditing"
			:related-primary-key="relatedPrimaryKey"
			:junction-field="relationInfo.junctionField.field"
			:edits="editsAtStart"
			:disabled="disabled"
			@input="saveEdit"
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
import { useItemManagement } from './use-item-management';

type RelationFK = string | number | BigInt;
type RelationItem = RelationFK | Record<string, any>;

interface StagedChanges {
	create: Record<string, any>[];
	update: Record<string, any>[];
	delete: string[];
}

const menuRef = ref(null);
const inputRef = ref<HTMLInputElement | null>(null);
const inputWidth = ref(0);
const localInput = ref<string>('');
const menuActive = ref<boolean>(false);
const suggestedItems = ref<Record<string, any>[]>([]);
const suggestedItemsSelected = ref<number | null>(null);
const displayItems = ref<any[]>([]);
const editDrawer = ref(false);
const editItem = ref(null);
const editFields = ref({});
const currentIds = ref<(string | number)[]>([]);
const stagedChanges = ref<StagedChanges>({
	create: [],
	update: [],
	delete: []
});
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
		iconRight: 'add',
		template: null,
	}
);

const emit = defineEmits(['input']);

const { t } = useI18n();
const { value, collection, field } = toRefs(props);
const { relationInfo } = useRelationM2M(collection, field, useStores());
const { usePermissionsStore, useUserStore } = useStores();
const { currentUser } = useUserStore();
const { hasPermission } = usePermissionsStore();

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

const api = useApi();
const templateWithDefaults = computed(() => {
	if (!relationInfo?.value?.junctionField?.field) return null;

	// If no template is provided, use the referencing field
	if (!props.template) {
		return `{{${relationInfo.value.junctionField.field}.${props.referencingField}}}`;
	}

	// If the template doesn't include the junction field prefix, add it
	if (!props.template.includes(relationInfo.value.junctionField.field + '.')) {
		return props.template
			.replace(/\{\{/g, '{{' + relationInfo.value.junctionField.field + '.')
			.replace(new RegExp(`${relationInfo.value.junctionField.field}\\.${relationInfo.value.junctionField.field}\\.`, 'g'), 
				`${relationInfo.value.junctionField.field}.`);
	}

	return props.template;
});

const displayFields = computed(() => {
	if (!relationInfo?.value?.junctionField?.field) return [];

	const fields = getFieldsFromTemplate(props.template || '');
	
	return fields.map(field => {
		if (!relationInfo.value?.junctionField?.field) return field;
		
		if (field.startsWith(relationInfo.value.junctionField.field)) {
			return field;
		}
		return `${relationInfo.value.junctionField.field}.${field}`;
	});
});

const fetchFields = computed(() => {
	if (!relationInfo?.value) return [];
	
	const fields = new Set<string>();
	
	// Always include primary keys
	fields.add(relationInfo.value.relatedPrimaryKeyField.field);
	fields.add(`${relationInfo.value.junctionField.field}.${relationInfo.value.relatedPrimaryKeyField.field}`);
	
	// Add template fields
	if (props.template) {
		const templateFields = getFieldsFromTemplate(props.template);
		templateFields.forEach(field => {
			// If the field is already a fully qualified path, add it as is
			if (field.includes('.')) {
				fields.add(field);
			} else {
				// Otherwise, prefix it with the junction field
				fields.add(`${relationInfo.value.junctionField.field}.${field}`);
			}
		});
	}
	
	return Array.from(fields);
});

const showAddCustom = computed(
	() =>
		createAllowed.value &&
		localInput.value?.trim() &&
		!itemValueAvailable(localInput.value) &&
		!itemValueStaged(localInput.value)
);

watch(
	localInput,
	debounce((newValue: string) => {
		menuActive.value = !!newValue;
		refreshSuggestions(newValue);
	}, 300)
);

function emitter(newValue: RelationItem[] | null) {
	emit('input', newValue);
}

const {
	loading,
	isItemDeleted,
	getItemIcon,
	stageItemObject,
	saveEdit,
	deleteItem,
	loadItems,
	consolidateDisplay,
	stageLocalInput
} = useItemManagement({
	relationInfo,
	displayItems,
	stagedChanges,
	referencingField: props.referencingField,
	fetchFields,
	allowMultiple: props.allowMultiple
});

async function handleSaveEdit() {
	const newChanges = await saveEdit(editItem.value);
	if (newChanges) {
		stagedChanges.value = newChanges;
		emit('input', newChanges);
		editDrawer.value = false;
	}
}

async function handleStageItemObject(item: Record<string, any>) {
	const newChanges = await stageItemObject(item);
	if (newChanges) {
		stagedChanges.value = newChanges;
		emit('input', newChanges);
		localInput.value = '';
	}
}

async function openEditDrawer(
	item: RelationItem,
	field: string,
	props: {
		referencingField: string;
		[key: string]: any;
	}
) {
	try {
		// Safety check: Ensure the related collection exists
		if (!relationInfo.value?.relatedCollection?.collection) return;

		// Extract important identifiers:
		// junctionId: The ID of the junction record (the M2M relationship record)
		// junctionField: The name of the field that connects to the related item
		const junctionId = item[relationInfo.value.junctionPrimaryKeyField.field];
		const junctionField = relationInfo.value.junctionField.field;
		
		// PART 1: HANDLING NEWLY CREATED ITEMS
		// These are items that don't have a junction ID yet (not saved to database)
		const isCreatedItem = !junctionId;
		if (isCreatedItem) {
			// Look for this item in our staged creates by matching the name
			const createdItemIndex = stagedChanges.value.create.findIndex(
				createItem => createItem[junctionField].name === item[junctionField].name
			);

			if (createdItemIndex !== -1) {
				const stagedItem = stagedChanges.value.create[createdItemIndex][junctionField];
				// For staged items, use the related item's ID as the primary key
				currentlyEditing.value = stagedItem.id;
				relatedPrimaryKey.value = null;  // No junction ID yet since it's a new item
				editDrawer.value = true;
				
				// Get the schema for the fields
				const schemaResponse = await api.get(`/fields/${relationInfo.value.relatedCollection.collection}`);
				editFields.value = schemaResponse.data.data;
				return;
			}
		}

		// PART 2: HANDLING ITEMS WITH PENDING UPDATES
		// Check if this item has any staged updates
		const stagedUpdate = stagedChanges.value.update.find(update => update.id === junctionId);
		if (stagedUpdate) {
			// If there are staged updates, merge them with the original item
			editItem.value = {
				...item[junctionField],
				...stagedUpdate[junctionField],
				junction_id: junctionId
			};
			editDrawer.value = true;
			
			// Get the schema for the fields
			const schemaResponse = await api.get(`/fields/${relationInfo.value.relatedCollection.collection}`);
			editFields.value = schemaResponse.data.data;
			return;
		}

		// PART 3: HANDLING EXISTING ITEMS WITHOUT CHANGES
		// Get the ID of the related item
		const relatedItemId = item[field]?.[relationInfo.value.relatedPrimaryKeyField.field];
		if (relatedItemId) {
			// Set the IDs using the same pattern as list-m2m.vue
			currentlyEditing.value = relatedItemId;     // primary-key: The ID of the related item (since we're editing in the related collection)
			relatedPrimaryKey.value = junctionId;       // related-primary-key: The junction record ID
			editDrawer.value = true;
		}

		// Get the schema for the fields
		const schemaResponse = await api.get(`/fields/${relationInfo.value.relatedCollection.collection}`);
		editFields.value = schemaResponse.data.data;
	} catch (error) {
		console.error('Error fetching item data:', JSON.stringify(error));
	}
}

async function stageValue(value: string) {
	if (!value || itemValueStaged(value)) return;

	try {
		const item = await findByKeyword(value);
		if (item) {
			handleStageItemObject(item);
		} else if (createAllowed.value && props.referencingField) {
			// Create new item
			handleStageItemObject({ [props.referencingField]: value });
		}
	} catch (err: any) {
		console.error('Error staging value:', JSON.stringify(err));
	}
}

function itemValueStaged(value: string): boolean {
	if (!value || !props.referencingField || !relationInfo.value) return false;
	
	const junctionField = relationInfo.value.junctionField.field;
	
	return stagedChanges.value.create.some(item => {
		const junctionItem = item[junctionField];
		return junctionItem && junctionItem[props.referencingField] === value;
	});
}

function itemValueAvailable(value: string): boolean {
	if (!value || !props.referencingField) return false;
	return !!suggestedItems.value.find((item) => item[props.referencingField] === value);
}

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

	isSearching.value = true;  // Set loading state to true

	const currentIds = displayItems.value
		.map((item: RelationItem): RelationFK =>
			item[relationInfo.value.junctionField.field]?.[relationInfo.value.relatedPrimaryKeyField.field]
		)
		.filter((id: RelationFK) => id === 0 || !!id);

	const filters: Filter[] = [];

	// Add the custom filter if it exists
	if (props.filter) {
		filters.push(props.filter);
	}

	// Add the current IDs filter
	if (currentIds.length > 0) {
		filters.push({
			[relationInfo.value.relatedPrimaryKeyField.field]: {
				_nin: currentIds,
			},
		});
	}

	// Combine and deduplicate search fields
	const allSearchFields = Array.from(new Set([props.referencingField, ...(props.searchFields || [])]));

	// Create _or filter for all fields
	const searchFilter = {
		_or: allSearchFields.map(field => ({
			[field]: {
				_icontains: keyword,
			}
		}))
	};
	
	filters.push(searchFilter);
	

	try {
		const response = await api.get(getEndpoint(relationInfo.value.relatedCollection.collection), {
			params: {
				limit: 10,
				fields: [
					relationInfo.value.relatedPrimaryKeyField.field,
					props.referencingField,
					...getFieldsFromTemplate(props.template || '')
						.map(field => field.replace(relationInfo.value.junctionField.field + '.', '')),
				],
				filter: filters.length > 1 ? { _and: filters } : filters[0],
				...getSortingQuery(),
			},
		});

		suggestedItems.value = response?.data?.data || [];
	} catch (error) {
		console.error('Error fetching suggestions:', error);
		suggestedItems.value = [];
	} finally {
		isSearching.value = false;  // Reset loading state
	}
}

async function findByKeyword(keyword: string): Promise<Record<string, any> | null> {
	if (!relationInfo.value || !props.referencingField) return null;

	const response = await api.get(getEndpoint(relationInfo.value.relatedCollection.collection), {
		params: {
			limit: 1,
			fields: [
				relationInfo.value.relatedPrimaryKeyField.field,
				props.referencingField,
				...(fetchFields.value || []),
			],
			filter: {
				[props.referencingField]: {
					_eq: keyword,
				},
			},
		},
	});

	return response?.data?.data?.[0] || null;
}

watch(displayItems, (newItems) => {
}, { deep: true });

function getSortingQuery(path?: string): Object {
	if (!relationInfo.value) return {};
	
	const fieldName = props.sortField 
		? props.sortField 
		: relationInfo.value.relatedPrimaryKeyField.field;
		
	const field = path ? `${path}.${fieldName}` : fieldName;
	
	return {
		sort: props.sortDirection === 'desc' ? `-${field}` : field,
	};
}

// Add a watch on value to handle loading items
watch(
	value,
	async (newValue) => {
		if (!newValue) {
			displayItems.value = [];
			currentIds.value = [];
			stagedChanges.value = {
				create: [],
				update: [],
				delete: []
			};
			return;
		}
		
		if (Array.isArray(newValue)) {
			currentIds.value = newValue;
			await loadItems(newValue);
		} else if ('create' in newValue) {
			stagedChanges.value = newValue;
			await consolidateDisplay();
		}
	},
	{ immediate: true }
);

/**
 * Keyboard shortcuts and keybindings
 * @param {KeyboardEvent} event
 */
async function onInputKeyDown(event: KeyboardEvent) {
	if (event.key === 'Escape' && !menuActive.value && localInput.value) {
		localInput.value = '';
		//inputRef.value?.focus(); // Return focus to the input
		return;
	}

	if (event.key === 'Escape') {
		event.preventDefault();
		menuActive.value = false;
		return;
	}

	if (event.key === 'Enter') {
		event.preventDefault();
		if (suggestedItemsSelected.value !== null && suggestedItems.value[suggestedItemsSelected.value]) {
			stageItemObject(suggestedItems.value[suggestedItemsSelected.value]);
		} else if (createAllowed.value) {
			const newChanges = await stageLocalInput(localInput.value);
			if (newChanges) {
				stagedChanges.value = newChanges;
				emit('input', newChanges);
				localInput.value = '';
			}
		}
		return;
	}

	if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)) {
		event.preventDefault();
		if (suggestedItems.value.length < 1) return;
		// Select previous from the list, if on top, then go last.
		suggestedItemsSelected.value =
			suggestedItemsSelected.value === null ||
				suggestedItemsSelected.value < 1 ||
				!suggestedItems.value[suggestedItemsSelected.value]
				? suggestedItems.value.length - 1
				: suggestedItemsSelected.value - 1;
		return;
	}

	if (event.key === 'Tab') {
		if (!menuActive.value) {
			localInput.value = '';
			return;
		}

		if (!localInput.value && suggestedItems.value.length < 1) return;
	}

	if (event.key === 'ArrowDown' || event.key === 'Tab') {
		event.preventDefault();
		if (suggestedItems.value.length < 1) return;
		// Select next from the list, if bottom, then go first.
		suggestedItemsSelected.value =
			suggestedItemsSelected.value === null ||
				suggestedItemsSelected.value >= suggestedItems.value.length - 1 ||
				!suggestedItems.value[suggestedItemsSelected.value]
				? 0
				: suggestedItemsSelected.value + 1;
		return;
	}
}

function usePreviews(value: Ref<RelationItem[] | StagedChanges>) {
	const loading = ref<boolean>(false);

	if (!relationInfo.value) return { loading };

	watch(
		value,
		async (newValue) => {
			
			if (!newValue) return;
			
			if (Array.isArray(newValue)) {
				currentIds.value = newValue;
				await loadItems(newValue);
			} 
			else if ('create' in newValue) {
				stagedChanges.value = newValue;
				await consolidateDisplay();
			}
		},
		{ immediate: true }
	);

	return { loading };
}

watch(value, (newValue) => {
});

watch(displayItems, (newValue) => {
});

watch(relationInfo, (newValue) => {
});

// Add a watch on the primaryKey to detect when the parent item is saved
watch(
	() => props.primaryKey,
	async (newKey, oldKey) => {
		if (newKey && newKey !== oldKey) {
			// Reset staged changes since the parent item was saved
			stagedChanges.value = {
				create: [],
				update: [],
				delete: []
			};
			
			// Reload the actual items from the database
			if (Array.isArray(value.value)) {
				await loadItems(value.value);
			}
		}
	}
);

const updateWidth = () => {
	if (inputRef.value) {
		inputWidth.value = inputRef.value.offsetWidth;
	}
};

// Single onMounted handler
onMounted(() => {
	// Create resize observer
	resizeObserver.value = new ResizeObserver((entries) => {
		for (const entry of entries) {
			if (entry.target === wrapperRef.value) {
				const width = entry.contentRect.width;
				// Subtract scrollbar width if needed
				const scrollbarWidth = entry.target.offsetWidth - width;
				menuStyle.value = {
					width: `${width - scrollbarWidth}px`
				};
			}
		}
	});

	// Start observing
	if (wrapperRef.value) {
		resizeObserver.value.observe(wrapperRef.value);
	}

	updateWidth();
	window.addEventListener('resize', updateWidth);
});

// Single onUnmounted handler
onUnmounted(() => {
	if (resizeObserver.value) {
		resizeObserver.value.disconnect();
	}
	window.removeEventListener('resize', updateWidth);
});

// Watch for menu activation to ensure width is correct when menu opens
watch(menuActive, async (newValue) => {
	if (newValue) {
		await nextTick();
		
		// Get input width from wrapper
		const wrapperWidth = wrapperRef.value?.offsetWidth;
		
		if (wrapperWidth) {
			menuStyle.value = {
				width: `${wrapperWidth}px`
			};
		}
	}
});

const wrapperRef = ref<HTMLElement | null>(null);
const menuStyle = ref({
	width: '0px'
});

// Add ResizeObserver setup
const resizeObserver = ref<ResizeObserver | null>(null);

// Add this with other refs near the top of the file
const isSearching = ref(false);

// Add with other refs
const selectModalActive = ref(false);

// Add this computed property
const customFilter = computed(() => {
	if (!relationInfo.value) return {};

	const filter: Filter = {
		_and: []
	};

	// Add the user's filter if it exists
	if (props.filter) {
		filter._and.push(props.filter);
	}

	// Get IDs of currently selected items
	const selectedIds = displayItems.value
		.map(item => item[relationInfo.value.junctionField.field]?.[relationInfo.value.relatedPrimaryKeyField.field])
		.filter(id => id !== undefined);

	// Add filter to exclude selected items
	if (selectedIds.length > 0) {
		filter._and.push({
			[relationInfo.value.relatedPrimaryKeyField.field]: {
				_nin: selectedIds
			}
		});
	}

	return filter;
});

function select(selectedIds: (string | number)[]) {
	if (!relationInfo.value || !Array.isArray(selectedIds)) return;
	console.log(JSON.stringify(selectedIds));

	// Create all new items at once
	const newStagedChanges = {
		create: [...stagedChanges.value.create],
		update: [...stagedChanges.value.update],
		delete: [...stagedChanges.value.delete]
	};

	// Add all selected items in one go
	selectedIds.forEach(id => {
		const newItem = {
			[relationInfo.value.junctionField.field]: {
				[relationInfo.value.relatedPrimaryKeyField.field]: id
			}
		};
		newStagedChanges.create.push(newItem);
		displayItems.value = [...displayItems.value, newItem];
	});

	// Update staged changes once with all new items
	stagedChanges.value = newStagedChanges;
	emit('input', newStagedChanges);
	
	selectModalActive.value = false;
}

const editModalActive = ref(false);
const currentlyEditing = ref<string | number | null>(null);
const relatedPrimaryKey = ref<string | number | null>(null);
const editsAtStart = ref<Record<string, any>>({});
let newItem = false;
</script>

<style>
.v-menu-popper {
	max-width: min-content !important;
}
</style>

<style lang="scss" scoped>
/* Field and template styles */
.content {
	padding: var(--content-padding);
	padding-top: 0;
}

.tags {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: flex-start;
	padding: var(--v-list-padding);
	gap: var(--v-list-item-padding);
	width: 100%;
	margin-top: 8px;
}

.render-template-wrapper {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	width: 100%;
}

:deep(.render-template-wrapper) {
	.field p img {
		max-height: 40px !important;
		border-radius: 4px;
		vertical-align: middle;
		width: auto !important;
		object-fit: contain;
		margin: 0px 4px;
	}
}

.field {
	display: inline-flex;
	max-width: 100%;

	:deep(img) {
		max-height: 40px;
		width: auto;
		vertical-align: middle;
		border-radius: 4px;
		margin: 4px;
	}

	:deep(p) {
		margin: 0;
		display: inline;
	}
}

.v-list-item {
	transition: background-color 0.2s ease, color 0.2s ease;
}

.many-to-many {
	width: 100%;
}

.actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	width: 100%;
}

</style>
