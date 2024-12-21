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
									<div v-if="field.includes('html')" 
										class="field" 
										v-html="item[field.replace(relationInfo.junctionField.field + '.', '')]"
									/>
									<template v-else>
										<render-template
											v-if="relationInfo"
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

		<div v-else-if="items.length" class="tags">
			<template v-if="relationInfo">
				<v-list-item 
					v-for="item in items" 
					:key="item[relationInfo.junctionField.field]?.[relationInfo.relatedPrimaryKeyField.field]"
					v-tooltip="t('Click to edit')" 
					:disabled="disabled || !selectAllowed" 
					class="link block clickable"
					@click="openEditDrawer(item, relationInfo.junctionField.field, props)"
				>
					<v-list-item-content>
						<div class="render-template-wrapper">
							<template v-for="field in getFieldsFromTemplate(templateWithDefaults)" :key="field">
								<div v-if="field.includes('html')" 
									class="field" 
									v-html="item[relationInfo.junctionField.field][field.replace(relationInfo.junctionField.field + '.', '')]"
								/>
								<template v-else>
									<render-template
										v-if="relationInfo"
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

const localInput = ref<string>('');
const menuActive = ref<boolean>(false);
const suggestedItems = ref<Record<string, any>[]>([]);
const suggestedItemsSelected = ref<number | null>(null);
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
		let savedItem: RelationItem | null = null;

		if (id) {
			const response = await api.patch(
				`/items/${relationInfo.value.relatedCollection.collection}/${id}`, 
				editItem.value
			);
			savedItem = response.data.data;
		} else {
			const response = await api.post(
				`/items/${relationInfo.value.relatedCollection.collection}`, 
					editItem.value
			);
			savedItem = response.data.data;
		}

		if (!savedItem) return;

		items.value = items.value.map(item => {
			if (item[relationInfo.value!.junctionField.field].id === id) {
				return {
					...item,
					[relationInfo.value!.junctionField.field]: savedItem,
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
	if (!value.value || !Array.isArray(value.value) || !relationInfo.value) return;

	if (relationInfo.value.junctionPrimaryKeyField.field in item) {
		emitter(value.value.filter((x) => x !== item[relationInfo.value!.junctionPrimaryKeyField.field]));
	} else {
		emitter(value.value.filter((x) => x !== item));
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

	const currentIds = items.value
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
		fetchFields.value.forEach(field => {
			// Check if the field contains a function (starts with $)
			if (field.includes('.$')) {
				// For thumbnail fields, we need to keep the full path
				fields.add(field);
			} else if (field.includes('.')) {
				// For regular nested fields
				fields.add(field);
			} else {
				// For top-level fields
				fields.add(field);
			}
		});
		
		// Convert to array and format for API request
		const formattedFields = Array.from(fields).map(field => {
			// If it's a nested field with a function (like $thumbnail)
			if (field.includes('.$')) {
				const [path, func] = field.split('.$');
				return `${path}.$${func}`;
			}
			return field;
		});
		
		return formattedFields;
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
		const [ids, staged] = partition(value || [], (item: RelationItem) => typeof item !== 'object');

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
					deep: {
						[relationInfo.value.junctionField.field]: {
							_filter: {}
						}
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
