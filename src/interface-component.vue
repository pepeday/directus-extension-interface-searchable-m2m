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
							<render-template
								:collection="relationInfo.value?.relatedCollection?.collection"
								:item="item"
								:template="`{{${props.referencingField}}}`"
							/>
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

		<div v-else-if="items.length" class="tags">
			<div v-if="false" style="background: #eee; padding: 10px; margin: 10px 0;">
				<pre>Template: {{ templateWithDefaults }}</pre>
				<pre>Display Fields: {{ displayFields }}</pre>
				<pre>Items: {{ items }}</pre>
			</div>
			
			<v-list-item 
				v-for="item in items" 
				:key="item[relationInfo.junctionField.field]?.[relationInfo.relatedPrimaryKeyField.field]"
				v-tooltip="t('Click to edit')" 
				:disabled="disabled || !selectAllowed" 
				class="link block clickable"
				@click="openEditDrawer(item, relationInfo.junctionField.field, props)"
			>
				<v-list-item-content>
					<render-template
						:collection="relationInfo.value?.junctionCollection?.collection"
						:item="item"
						:template="templateWithDefaults"
					/>
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
		</div>



		<v-drawer v-model="editDrawer" :title="t('select_item')" @cancel="editDrawer = false">
			<template #actions>
				<v-button v-tooltip.bottom="t('save')" icon rounded @click="saveEdit">
					<v-icon name="check" :large="true" />
				</v-button>
			</template>
			<div class="layout">
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
import { Filter } from '@directus/types';
import { useApi, useStores } from '@directus/composables';
import { parseFilter, getEndpoint, getFieldsFromTemplate } from '@directus/utils';
import { useRelationM2M } from './use-relations';

type RelationFK = string | number | BigInt;
type RelationItem = RelationFK | Record<string, any>;

const inputRef = ref<HTMLElement | null>(null);
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
		filter: () => null,
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

const localInput = ref<string>('');
const menuActive = ref<boolean>(false);
const suggestedItems = ref<Record<string, any>[]>([]);
const suggestedItemsSelected = ref<number | null>(null);
const api = useApi();
const templateWithDefaults = computed(() => {
	console.log('relationInfo:', relationInfo.value);
	console.log('props.template:', props.template);
	
	if (!relationInfo.value) return null;

	if (props.template) return props.template;

	// Default to showing the referencing field through the junction field
	const defaultTemplate = `{{${relationInfo.value.junctionField.field}.${props.referencingField}}}`;
	console.log('Using default template:', defaultTemplate);
	return defaultTemplate;
});

const displayFields = computed(() => {
	console.log('Computing displayFields');
	console.log('templateWithDefaults:', templateWithDefaults.value);
	
	if (!relationInfo.value || !templateWithDefaults.value) {
		console.log('No relationInfo or template, returning empty array');
		return [];
	}
	
	const fields = getFieldsFromTemplate(templateWithDefaults.value);
	console.log('Extracted fields:', fields);
	return fields;
});

const fetchFields = computed(() => {
	console.log('Computing fetchFields');
	if (!relationInfo.value) {
		console.log('No relationInfo, returning empty array');
		return [];
	}
	
	const fields = new Set<string>();
	
	// Always include primary keys
	fields.add(relationInfo.value.relatedPrimaryKeyField.field);
	fields.add(`${relationInfo.value.junctionField.field}.${relationInfo.value.relatedPrimaryKeyField.field}`);
	
	// Add template fields
	if (templateWithDefaults.value) {
		const templateFields = getFieldsFromTemplate(templateWithDefaults.value);
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
	
	// Add referencing field
	fields.add(`${relationInfo.value.junctionField.field}.${props.referencingField}`);
	
	const result = Array.from(fields);
	console.log('Final fields:', result);
	return result;
});

const { items, loading } = usePreviews(value);

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

const editDrawer = ref(false); // Drawer state
const editItem = ref(null); // Item to be edited
const editFields = ref({});
// Save the edited item
async function saveEdit() {
	try {
		if (!relationInfo.value) return;
		
		const id = editItem.value?.id;
		let savedItem;

		if (id) {
			// Update existing item
			const response = await api.patch(
				`/items/${relationInfo.value.relatedCollection.collection}/${id}`, 
				editItem.value
			);
			savedItem = response.data.data;
		} else {
			// Create new item
			const response = await api.post(
				`/items/${relationInfo.value.relatedCollection.collection}`, 
				editItem.value
			);
			savedItem = response.data.data;
		}

		// Update the item in the list
		items.value = items.value.map(item => {
			if (item[relationInfo.value.junctionField.field].id === id) {
				return {
					...item,
					[relationInfo.value.junctionField.field]: savedItem,
				};
			}
			return item;
		});

		editDrawer.value = false;
	} catch (error) {
		console.error('Error saving item:', error);
	}
}


async function openEditDrawer(item, field, props) {
	try {
		// Check if this is a newly created item (no ID yet)
		const itemId = item[field]?.id;
		
		if (!itemId) {
			// For new items, just use the existing data
			editItem.value = { ...item[field] };
			editDrawer.value = true;
			
			// Still fetch fields schema
			const schemaResponse = await api.get(`/fields/${relationInfo.value.relatedCollection.collection}`);
			editFields.value = schemaResponse.data.data;
			return;
		}

		// For existing items, fetch the full data
		const response = await api.get(`/items/${relationInfo.value.relatedCollection.collection}/${itemId}`, {
			params: {
				fields: '*'
			}
		});

		editItem.value = response.data.data || { ...item[field] };
		editDrawer.value = true;

		const schemaResponse = await api.get(`/fields/${relationInfo.value.relatedCollection.collection}`);
		editFields.value = schemaResponse.data.data;
	} catch (error) {
		console.error('Error fetching item data:', error);
	}
}


function deleteItem(item: any) {
	if (value.value && !Array.isArray(value.value)) return;

	if (relationInfo.value.junctionPrimaryKeyField.field in item) {
		emitter(value.value.filter((x: any) => x !== item[relationInfo.value.junctionPrimaryKeyField.field]));
	} else {
		emitter(value.value.filter((x: any) => x !== item));
	}
}

function stageItemObject(item: Record<string, RelationItem>) {
	console.log('Staging item:', item);
	console.log('Current value:', props.value);
	
	if (!relationInfo.value) return;
	
	// Create the junction structure
	const junctionItem = {
		[relationInfo.value.junctionField.field]: {
			...item,
			[relationInfo.value.relatedPrimaryKeyField.field]: item[relationInfo.value.relatedPrimaryKeyField.field],
		}
	};
	
	console.log('Junction item:', junctionItem);
	
	const newValue = [...(props.value || []), junctionItem];
	console.log('New value:', newValue);
	
	emitter(newValue);
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
			stageItemObject({ [props.referencingField]: value });
		}
	} catch (err: any) {
		console.error('Error staging value:', err);
	}
}

function itemValueStaged(value: string): boolean {
	if (!value || !props.referencingField) return false;
	return !!items.value.find((item) => item[relationInfo.value.junctionField.field][props.referencingField] === value);
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

	// Get currently selected IDs
	const currentIds = items.value
		.map((item: RelationItem): RelationFK =>
			item[relationInfo.value.junctionField.field]?.[relationInfo.value.relatedPrimaryKeyField.field]
		)
		.filter((id: RelationFK) => id === 0 || !!id);

	// Build filters
	const filters = [
		props.filter && parseFilter(props.filter, null),
		currentIds.length > 0 && {
			[relationInfo.value.relatedPrimaryKeyField.field]: {
				_nin: currentIds,
			},
		},
		{
			[props.referencingField]: {
				_contains: keyword,
			},
		},
	].filter(Boolean);

	try {
		const response = await api.get(getEndpoint(relationInfo.value.relatedCollection.collection), {
			params: {
				limit: 10,
				fields: [
					relationInfo.value.relatedPrimaryKeyField.field,
					props.referencingField,
				],
				filter: {
					_and: filters,
				},
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

function usePreviews(value: Ref<RelationItem[]>) {
	const items = ref<any[]>([]);
	const loading = ref<boolean>(value.value && value.value.length > 0);

	if (!relationInfo.value) return { items, loading };

	// Get the fields we need to fetch
	const relationalFetchFields = computed(() => {
		if (!relationInfo.value) return [];
		
		const fields = new Set<string>();
		
		// Add junction primary key
		fields.add(relationInfo.value.junctionPrimaryKeyField.field);
		
		// Add all fetch fields
		fetchFields.value.forEach(field => fields.add(field));
		
		return Array.from(fields);
	});

	watch(
		value,
		debounce((newValue: RelationItem[]) => update(newValue), 300)
	);

	if (value.value && Array.isArray(value.value)) {
		update(value.value);
	}

	return { items, loading };

	async function update(value: RelationItem[]) {
		console.log('Updating with value:', value);
		
		const [ids, staged] = partition(value || [], (item: RelationItem) => typeof item !== 'object');
		console.log('Partitioned - ids:', ids, 'staged:', staged);

		if (!ids.length) {
			items.value = [...staged];
			return;
		}

		const cached = items.value.filter(
			(item: RelationItem) =>
				typeof item === 'object' &&
				item[relationInfo.value.junctionPrimaryKeyField.field] &&
				ids.includes(item[relationInfo.value.junctionPrimaryKeyField.field])
		);

		if (cached.length === ids.length) {
			items.value = [...cached, ...staged];
			return;
		}

		loading.value = true;
		try {
			const response = await api.get(getEndpoint(relationInfo.value.junctionCollection.collection), {
				params: {
					fields: relationalFetchFields.value,
					limit: ids.length,
					filter: {
						id: {
							_in: ids.join(','),
						},
					},
					...getSortingQuery(relationInfo.value.junctionField.field),
				},
			});

			if (response?.data?.data && Array.isArray(response.data.data)) {
				items.value = [...response.data.data, ...staged];
			} else {
				items.value = [...staged];
			}
		} catch (error) {
			console.error('Error fetching items:', error);
			items.value = [...staged];
		} finally {
			loading.value = false;
		}
	}
}

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
</script>

<style scoped>
.add-custom {
	font-style: oblique;
}

.no-items {
	color: var(--foreground-subdued);
}

.tags {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: flex-start;
	padding: 4px 0;
	width: 100%;
}

.tag {
	flex: 1 1 100%;
	margin-top: 8px;
	cursor: pointer;
	box-sizing: border-box;

	--v-chip-background-color: var(--theme--primary);
	--v-chip-color: var(--foreground-inverted);
	--v-chip-background-color-hover: var(--theme--primary);
	--v-chip-close-color: var(--theme--primary);
	--v-chip-close-color-hover: var(--white);
	transition: all var(--fast) var(--transition);
}

.tag:hover {
	--v-chip-close-color: var(--white);
}

::v-deep .v-chip .chip-content {
	width: 100% !important;
	justify-content: space-between !important;
	display: flex !important;
	align-items: center !important;
	padding: 7px;
	font-size: 16px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.v-chip.label {
	width: 100%;
	display: block;
	background-color: white;
	color: #4f5464;
	border: 2px solid #e4eaf1;
	height: auto;
	box-sizing: border-box;
}

.layout {
	padding: 10px 0 0 40px;
}

::v-deep(.limited-content img) {
	max-height: 40px;
	max-height: 40px;
	object-fit: cover;
	border-radius: 8px;

}
</style>
