<template>
	<v-notice
		v-if="!relationInfo || !relationInfo.junctionCollection.collection || !relationInfo.relatedCollection.collection"
		type="warning">
		{{ t('relationship_not_setup') }}
	</v-notice>

	<template v-else>
		<v-menu v-if="selectAllowed" v-model="menuActive" attached full-height>
			<template #activator>
				<v-input ref="inputRef" v-model="localInput" :placeholder="placeholder || t('search_items')"
					:disabled="disabled" @keydown="onInputKeyDown" @focus="menuActive = true">
					<template v-if="iconLeft" #prepend>
						<v-icon v-if="iconLeft" :name="iconLeft" />
					</template>

					<template #append>
						<v-icon v-if="iconRight" :name="iconRight" />
					</template>
				</v-input>
			</template>

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
		</v-menu>

		<v-skeleton-loader v-if="loading" type="block-list-item" />

		<div v-else-if="displayItems.length" class="tags">
			<template v-if="relationInfo">
				{{ console.log('Rendering items:', displayItems) }}
				<v-list-item 
					v-for="item in displayItems" 
					:key="item[relationInfo.junctionField.field]?.[relationInfo.relatedPrimaryKeyField.field]"
					v-tooltip="t('Click to edit')" 
					:disabled="disabled || !selectAllowed" 
					class="link block clickable"
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
							name="close" 
							@click.stop="deleteItem(item)" 
							v-tooltip="t('Remove Item')" 
						/>
					</v-list-item-action>
				</v-list-item>
			</template>
		</div>



		<v-drawer v-model="editDrawer" :title="t('select_item')" @cancel="editDrawer = false">
			<template #actions>
				<v-button v-tooltip.bottom="t('save')" icon rounded @click="saveEdit">
					<v-icon name="check" :large="true" />
				</v-button>
			</template>
			<div class="content">
				<v-form v-model="editItem" :collection="relationInfo.relatedCollection.collection" :fields="editFields"
					:initial-values="editItem" />
			</div>
		</v-drawer>
	</template>
</template>

<script lang="ts" setup>
import { computed, ref, toRefs, Ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { debounce, partition } from 'lodash';
import { Filter, LogicalFilterAND, LogicalFilterOR, FieldFilter } from '@directus/types';
import { useApi, useStores } from '@directus/composables';
import { parseFilter, getEndpoint, getFieldsFromTemplate } from '@directus/utils';
import { useRelationM2M } from './use-relations';

type RelationFK = string | number | BigInt;
type RelationItem = RelationFK | Record<string, any>;

interface StagedChanges {
	create: Record<string, any>[];
	update: Record<string, any>[];
	delete: string[];
}

const inputRef = ref<HTMLElement | null>(null);
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

const isMulti = computed(() => props.allowMultiple && fromSeparatedTag(localInput.value));

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

// Save the edited item
async function saveEdit() {
	try {
		if (!relationInfo.value) return;
		
		const id = editItem.value?.id;
		const junctionField = relationInfo.value.junctionField.field;
		
		// Create new staged changes object
		const newStagedChanges = {
			create: [...stagedChanges.value.create],
			update: [...stagedChanges.value.update],
			delete: [...stagedChanges.value.delete]
		};

		// Check if this is a staged (created) item
		const createdItemIndex = newStagedChanges.create.findIndex(
			item => item[junctionField][relationInfo.value.relatedPrimaryKeyField.field] === id
		);

		if (createdItemIndex !== -1) {
			// Update the item in the create array
			newStagedChanges.create[createdItemIndex] = {
				[junctionField]: {
					...newStagedChanges.create[createdItemIndex][junctionField],
					...editItem.value
				}
			};
		} else if (id) {
			// Handle existing item updates as before
			const updateIndex = newStagedChanges.update.findIndex(update => update.id === id);
			if (updateIndex !== -1) {
				newStagedChanges.update.splice(updateIndex, 1);
			}
			
			newStagedChanges.update.push({
				id,
				[junctionField]: editItem.value
			});
		}
		
		// Emit the new staged changes
		console.log('New staged changes after edit:', newStagedChanges);
		emit('input', newStagedChanges);
		
		// Update display items locally
		displayItems.value = displayItems.value.map(item => {
			if (item[relationInfo.value.junctionPrimaryKeyField.field] === id) {
				return {
					...item,
					[junctionField]: {
						...item[junctionField],
						...editItem.value
					}
				};
			}
			return item;
		});
		
		editDrawer.value = false;
	} catch (error) {
		console.error('Error saving item:', error);
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
		if (!relationInfo.value?.relatedCollection?.collection) return;

		const itemId = item[field]?.id;
		
		if (!itemId) {
			editItem.value = { ...item[field] };
			editDrawer.value = true;
			
			const schemaResponse = await api.get(`/fields/${relationInfo.value.relatedCollection.collection}`);
			editFields.value = schemaResponse.data.data;
			return;
		}

		// Check if there are staged updates for this item
		const stagedUpdate = stagedChanges.value.update.find(update => update.id === itemId);
		if (stagedUpdate) {
			// Use the staged values
			editItem.value = stagedUpdate[field];
			editDrawer.value = true;
			
			const schemaResponse = await api.get(`/fields/${relationInfo.value.relatedCollection.collection}`);
			editFields.value = schemaResponse.data.data;
			return;
		}

		// If no staged changes, fetch from API
		const response = await api.get(
			`/items/${relationInfo.value.relatedCollection.collection}/${itemId}`,
			{
				params: {
					fields: '*'
				}
			}
		);

		editItem.value = response.data.data || { ...item[field] };
		editDrawer.value = true;

		const schemaResponse = await api.get(`/fields/${relationInfo.value.relatedCollection.collection}`);
		editFields.value = schemaResponse.data.data;
	} catch (error) {
		console.error('Error fetching item data:', error);
	}
}


function deleteItem(item: RelationItem) {
	if (!relationInfo.value) return;
	
	console.log('Deleting item:', item);
	
	const junctionPkField = relationInfo.value.junctionPrimaryKeyField.field;
	const junctionField = relationInfo.value.junctionField.field;
	const relatedPkField = relationInfo.value.relatedPrimaryKeyField.field;
	
	// Create new staged changes object
	const newStagedChanges = {
		create: [...stagedChanges.value.create],
		update: [...stagedChanges.value.update],
		delete: [...stagedChanges.value.delete]
	};
	
	// If it's an existing item, add to delete array
	if (item[junctionPkField]) {
		newStagedChanges.delete.push(item[junctionPkField]);
	}
	
	console.log('New staged changes:', newStagedChanges);
	emit('input', newStagedChanges);
}

function stageItemObject(item: Record<string, RelationItem>) {
	if (!relationInfo.value) return;
	
	console.log('Staging item:', item);
	
	const junctionField = relationInfo.value.junctionField.field;
	
	// Create new staged changes object
	const newStagedChanges = {
		create: [...stagedChanges.value.create],
		update: [...stagedChanges.value.update],
		delete: [...stagedChanges.value.delete]
	};
	
	// Add new item to create array
	newStagedChanges.create.push({
		[junctionField]: {
			...item,
			html: item.html || '',
			status: item.status || 'draft',
			severity: item.severity || 'low'
		}
	});
	
	console.log('New staged changes:', newStagedChanges);
	emit('input', newStagedChanges);
	localInput.value = '';
}

async function stageLocalInput() {
	if (!props.referencingField) return;

	const value = localInput.value?.trim();
	for (const valueTag of fromSeparatedTag(value)) {
		await stageValue(valueTag.trim());
	}

	localInput.value = '';
}

function fromSeparatedTag(input: string): string[] {
	if (!props.allowMultiple) return [input];

	return input
		.split(/[;,]/)
		.map((x) => x.trim())
		.filter((x) => !!x);
}

async function stageValue(value: string) {
	if (!value || itemValueStaged(value)) return;

	try {
		const item = await findByKeyword(value);
		if (item) {
			stageItemObject(item);
		} else if (createAllowed.value && props.referencingField) {
			// Create new item
			stageItemObject({ [props.referencingField]: value });
		}
	} catch (err: any) {
		console.error('Error staging value:', err);
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

	// Add the keyword search filter
	filters.push({
		[props.referencingField]: {
			_contains: keyword,
		},
	});

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

const { loading } = usePreviews(value);

watch(displayItems, (newItems) => {
	console.log('DisplayItems changed:', newItems);
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
			stageLocalInput();
		}
		localInput.value = ''; // Clear input when Enter is clicked
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
			console.log('Value changed:', newValue);
			
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
	console.log('Value changed:', newValue);
});

watch(displayItems, (newValue) => {
	console.log('DisplayItems changed:', newValue);
});

watch(relationInfo, (newValue) => {
	console.log('RelationInfo changed:', newValue);
});

// Function to load items by IDs
async function loadItems(ids: (string | number)[]) {
	if (!relationInfo.value || !ids.length) return;
	
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
		console.error('Error loading items:', error);
	} finally {
		loading.value = false;
	}
}

// Function to consolidate current items with staged changes
async function consolidateDisplay() {
	// Start with current items
	await loadItems(currentIds.value);
	
	// Add created items
	stagedChanges.value.create.forEach(item => {
		displayItems.value.push(item);
	});
	
	// Apply updates
	stagedChanges.value.update.forEach(update => {
		const index = displayItems.value.findIndex(
			item => item[relationInfo.value.junctionPrimaryKeyField.field] === update.id
		);
		if (index !== -1) {
			displayItems.value[index] = {
				...displayItems.value[index],
				...update
			};
		}
	});
	
	// Remove deleted items
	displayItems.value = displayItems.value.filter(
		item => !stagedChanges.value.delete.includes(item[relationInfo.value.junctionPrimaryKeyField.field])
	);
}
</script>

<style lang="scss" scoped>
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
}

.render-template-wrapper {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	width: 100%;
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

.v-list-item {
	:deep(.v-list-item-content) {
		flex-direction: row;
		gap: 12px;
	}
}
</style>
