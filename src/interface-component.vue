<template>
	<v-notice
		v-if="!relationInfo || !relationInfo.junctionCollection.collection || !relationInfo.relatedCollection.collection"
		type="warning">
		{{ t('relationship_not_setup') }}
	</v-notice>

	<template v-else>
		<div class="search-wrapper" ref="wrapperRef">
			<v-menu 
				v-if="selectAllowed" 
				v-model="menuActive" 
				attached
				full-height
				placement="bottom-start"
				ref="menuRef"
			>
				<template #activator="{ active }">
					<div class="input-wrapper">
						<v-input 
							ref="inputRef" 
							v-model="localInput" 
							:placeholder="placeholder || t('search_items')"
							:disabled="disabled" 
							@keydown="onInputKeyDown" 
							@focus="menuActive = true" 
							style="width: 100%;"
						>
							<template v-if="iconLeft" #prepend>
								<v-icon v-if="iconLeft" :name="iconLeft" />
							</template>
							
							<template #append>
								<v-icon v-if="iconRight" :name="iconRight" />
							</template>
						</v-input>
					</div>
				</template>

				<div class="menu-list" :style="menuStyle">
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
		</div>

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
							@click.stop="deleteItem(item)" 
							v-tooltip="isItemDeleted(item) ? t('Undo Removed Item') : t('Remove Item')" 
						/>
					</v-list-item-action>
				</v-list-item>
			</template>
		</transition-group>



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
import { computed, ref, toRefs, Ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
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
		
		const junctionId = editItem.value?.junction_id;
		const junctionField = relationInfo.value.junctionField.field;
		
		console.log('saveEdit - Starting edit with:', JSON.stringify({
			junctionId,
			editItem: editItem.value,
			stagedChanges: stagedChanges.value
		}, null, 2));

		const newStagedChanges = {
			create: [...stagedChanges.value.create],
			update: [...stagedChanges.value.update],
			delete: [...stagedChanges.value.delete]
		};

		if (!junctionId) {
			// For newly created items, find the matching item in displayItems
			const displayItemIndex = displayItems.value.findIndex(
				item => !item[relationInfo.value.junctionPrimaryKeyField.field] && 
					   item[junctionField].name === stagedChanges.value.create[stagedChanges.value.create.length - 1][junctionField].name
			);

			console.log('saveEdit - Created item match:', JSON.stringify({
				displayItemIndex,
				matchAttempt: {
					lookingFor: 'last created item',
					displayItems: displayItems.value,
					createItems: stagedChanges.value.create
				}
			}, null, 2));

			if (displayItemIndex !== -1) {
				// Update both the staged changes and display items
				newStagedChanges.create[newStagedChanges.create.length - 1] = {
					[junctionField]: {
						...editItem.value
					}
				};

				// Update display items immediately
				displayItems.value[displayItemIndex] = {
					[junctionField]: {
						...editItem.value
					}
				};
			}
		} else {
			// Handle existing items
			const updateIndex = newStagedChanges.update.findIndex(update => update.id === junctionId);
			if (updateIndex !== -1) {
				newStagedChanges.update.splice(updateIndex, 1);
			}
			
			const { junction_id, ...editData } = editItem.value;
			
			newStagedChanges.update.push({
				id: junctionId,
				[junctionField]: editData
			});
		}
		
		console.log('saveEdit - Emitting changes:', JSON.stringify(newStagedChanges, null, 2));
		emit('input', newStagedChanges);
		editDrawer.value = false;
	} catch (error) {
		console.error('Error saving item:', JSON.stringify(error));
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

		const junctionId = item[relationInfo.value.junctionPrimaryKeyField.field];
		const junctionField = relationInfo.value.junctionField.field;
		
		// First check staged updates
		const stagedUpdate = stagedChanges.value.update.find(update => update.id === junctionId);
		if (stagedUpdate) {
			editItem.value = {
				...item[junctionField],
				...stagedUpdate[junctionField],
				junction_id: junctionId
			};
			editDrawer.value = true;
			
			const schemaResponse = await api.get(`/fields/${relationInfo.value.relatedCollection.collection}`);
			editFields.value = schemaResponse.data.data;
			return;
		}
		
		// Check if this is a staged created item
		const isCreatedItem = !junctionId && item[junctionField];
		if (isCreatedItem) {
			editItem.value = {
				...item[junctionField],
				junction_id: null
			};
			editDrawer.value = true;
			
			const schemaResponse = await api.get(`/fields/${relationInfo.value.relatedCollection.collection}`);
			editFields.value = schemaResponse.data.data;
			return;
		}

		// If no staged changes, fetch from API
		const relatedItemId = item[field]?.id;
		if (relatedItemId) {
			const response = await api.get(
				`/items/${relationInfo.value.relatedCollection.collection}/${relatedItemId}`,
				{
					params: {
						fields: '*'
					}
				}
			);

			editItem.value = {
				...response.data.data,
				junction_id: junctionId
			};
		} else {
			editItem.value = {
				...item[field],
				junction_id: junctionId
			};
		}
		
		editDrawer.value = true;

		const schemaResponse = await api.get(`/fields/${relationInfo.value.relatedCollection.collection}`);
		editFields.value = schemaResponse.data.data;
	} catch (error) {
		console.error('Error fetching item data:', JSON.stringify(error));
	}
}

function deleteItem(item: any) {
	if (!relationInfo.value) return;
	
	const junctionPkField = relationInfo.value.junctionPrimaryKeyField.field;
	const itemId = item[junctionPkField];

	if (!itemId) {
		// For newly created items, remove from create array
		const createIndex = stagedChanges.value.create.findIndex(
			createItem => createItem[relationInfo.value.junctionField.field].name === item[relationInfo.value.junctionField.field].name
		);
		if (createIndex !== -1) {
			stagedChanges.value.create.splice(createIndex, 1);
			displayItems.value = displayItems.value.filter(
				displayItem => displayItem[relationInfo.value.junctionField.field].name !== item[relationInfo.value.junctionField.field].name
			);
		}
	} else {
		// For existing items, toggle deletion
		const deleteIndex = stagedChanges.value.delete.indexOf(itemId);
		if (deleteIndex === -1) {
			stagedChanges.value.delete.push(itemId);
		} else {
			stagedChanges.value.delete.splice(deleteIndex, 1);
		}
	}

	emit('input', stagedChanges.value);
}

function stageItemObject(item: Record<string, RelationItem>) {
	if (!relationInfo.value) return;
	
	const junctionField = relationInfo.value.junctionField.field;
	
	const newStagedChanges = {
		create: [...stagedChanges.value.create],
		update: [...stagedChanges.value.update],
		delete: [...stagedChanges.value.delete]
	};
	
	const newItem = {
		[junctionField]: {
			...item,
			html: item.html || '',
			status: item.status || 'draft',
			severity: item.severity || 'low'
		}
	};
	
	newStagedChanges.create.push(newItem);
	
	// Add item to displayItems immediately
	displayItems.value = [...displayItems.value, newItem];
	
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
		console.error('Error fetching suggestions:', JSON.stringify(error));
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
	console.log('DisplayItems changed:', JSON.stringify(newItems));
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
			console.log('Value changed:', JSON.stringify(newValue));
			
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
	console.log('Value changed:', JSON.stringify(newValue));
});

watch(displayItems, (newValue) => {
	console.log('DisplayItems changed:', JSON.stringify(newValue));
});

watch(relationInfo, (newValue) => {
	console.log('RelationInfo changed:', JSON.stringify(newValue));
});

// Function to load items by IDs
async function loadItems(ids: (string | number)[]) {
	if (!relationInfo.value || !ids.length) {
		console.log('loadItems - No items to load, clearing displayItems');
		displayItems.value = [];
		return;
	}
	
	loading.value = true;
	try {
		console.log('loadItems - Loading items for IDs:', JSON.stringify(ids));
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
			console.log('loadItems - Received data:', response.data.data);
			displayItems.value = response.data.data;
		}
	} catch (error) {
		console.error('Error loading items:', JSON.stringify(error));
	} finally {
		loading.value = false;
	}
}

// Function to consolidate current items with staged changes
async function consolidateDisplay() {
	if (!relationInfo.value) return;
	
	console.log('consolidateDisplay - Starting with:', JSON.stringify({
		displayItems: displayItems.value,
		stagedChanges: stagedChanges.value
	}, null, 2));

	const junctionField = relationInfo.value.junctionField.field;
	const junctionPkField = relationInfo.value.junctionPrimaryKeyField.field;

	// Create a working copy of the current display items
	let workingItems = [...displayItems.value];

	// Apply updates
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

	// Handle created items - keep only saved items and add new ones
	workingItems = workingItems.filter(item => item[junctionPkField]);
	stagedChanges.value.create.forEach(item => {
		workingItems.push(item);
	});

	console.log('consolidateDisplay - Final workingItems:', JSON.stringify(workingItems, null, 2));
	displayItems.value = workingItems;
}

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

// Modify the existing watch on value to handle the reset case
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
			// Only reload if the IDs have actually changed
			const newIds = new Set(newValue);
			const currentIdsSet = new Set(currentIds.value);
			const hasChanges = newValue.length !== currentIds.value.length || 
				newValue.some(id => !currentIdsSet.has(id));
			
			if (hasChanges) {
				currentIds.value = newValue;
				await loadItems(newValue);
			}
		} 
		else if ('create' in newValue) {
			stagedChanges.value = newValue;
			await consolidateDisplay();
		}
	},
	{ deep: true }
);

// First, add a computed property to check if an item is staged for deletion
const isItemDeleted = (item: any) => {
	if (!relationInfo.value) return false;
	return stagedChanges.value.delete.includes(item[relationInfo.value.junctionPrimaryKeyField.field]);
};

function getItemIcon(item: any): string {
	if (!relationInfo.value) return 'close';
	
	const junctionPkField = relationInfo.value.junctionPrimaryKeyField.field;
	
	// For newly created items (no junction ID), show delete icon
	if (!item[junctionPkField]) {
		return 'delete';
	}
	
	// For existing items, show restore if marked for deletion, otherwise close
	return isItemDeleted(item) ? 'settings_backup_restore' : 'close';
}

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
		console.log('Menu opening...');
		await nextTick();
		
		// Get input width from wrapper
		const wrapperWidth = wrapperRef.value?.offsetWidth;
		console.log('Wrapper width:', wrapperWidth);
		
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
</script>

<style lang="scss" scoped>
.search-wrapper {
	position: relative;
	width: 100%;
}

.input-wrapper {
	width: 100%;
}

:deep(.v-menu-popper.attached) {
	position: fixed !important;
	left: 0;
	margin-top: 4px;
	z-index: 500;

	.v-menu-content {
		width: 100% !important;
		background-color: var(--theme--background);
		border-radius: var(--theme--border-radius);
		box-shadow: var(--theme--card--shadow);
		padding: 0;
		box-sizing: border-box;
		overflow: hidden;
	}
}

.menu-list {
	background-color: var(--theme--background);
	border-radius: var(--theme--border-radius);
	box-sizing: border-box;
	width: 100%;
	overflow: visible;

	.v-list {
		width: 100%;
		padding: var(--v-list-padding);
		box-sizing: border-box;
		max-height: 300px;
		overflow-y: auto;
	}
}

/* Scrollbar styles */
.v-list {
	&::-webkit-scrollbar {
		width: 8px;
		height: 8px;
	}

	&::-webkit-scrollbar-track {
		background-color: var(--theme--background);
	}

	&::-webkit-scrollbar-thumb {
		background-color: var(--theme--primary);
		border-radius: 4px;
	}

	.v-list-item {
		margin-bottom: var(--v-list-item-padding);
		
		&:last-child {
			margin-bottom: 0;
		}
	}
}

/* Transitions */
:deep(.v-menu-enter-active),
:deep(.v-menu-leave-active) {
	transition: opacity 0.15s ease, transform 0.15s ease;
}

:deep(.v-menu-enter-from),
:deep(.v-menu-leave-to) {
	opacity: 0;
	transform: translateY(-4px);
}

/* Other existing styles */
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
</style>
