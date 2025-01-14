import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './searchable-m2m.vue';

export default defineInterface({
	id: 'searchable-m2m',
	name: 'Searchable M2M interface',
	description: 'Searchable M2M interface',
	icon: 'note',
	component: InterfaceComponent,
	relational: true,
	types: ['alias'],
	localTypes: ['m2m'],
	group: 'relational',
	options: ({ relations }) => {
		return [
			{
				field: 'placeholder',
				name: 'Enter a placeholder',
				type: 'string',
				meta: {
					width: 'full',
					interface: 'system-input-translated-string',
					options: {
						placeholder: 'Type placeholder text',
					},
				},
			},
			{
				field: 'referencingField',
				name: 'Reference Field',
				type: 'string',
				meta: {
					width: 'full',
					required: true,
					interface: 'system-field',
					options: {
							collectionName: relations.m2o?.related_collection,
							typeAllowList: ['string', 'text', 'integer', 'bigInteger'],
							allowPrimaryKey: true,
					},
				},
			},
			{
				field: 'searchFields',
				name: 'Search Fields',
				type: 'json',
				meta: {
					width: 'full',
					interface: 'system-fields',
					note: 'The Reference Field is always included in the search fields.',
					options: {
						collectionName: relations.m2o?.related_collection,
						typeAllowList: ['string', 'text'],
					},
				},
			},
			{
				field: 'template',
				name: 'Display Template',
				type: 'string',
				meta: {
					width: 'full',
					interface: 'system-display-template',
					options: {
						collectionName: relations.m2o?.collection,
					},
				},
			},
			{
				field: 'iconLeft',
				name: 'Icon Left',
				type: 'string',
				meta: {
					width: 'half',
					interface: 'select-icon',
				},
			},
			{
				field: 'iconRight',
				name: 'Icon Right',
				type: 'string',
				meta: {
					width: 'half',
					interface: 'select-icon',
				},
				schema: {
					default_value: 'search',
				},
			},
			{
				field: 'allowCustom',
				name: 'Allow Custom Values',
				type: 'boolean',
				meta: {
					width: 'half',
					interface: 'boolean',
					options: {
						label: 'Allow Custom Values',
					},
				},
				schema: {
					default_value: true,
				},
			},
			{
				field: 'allowMultiple',
				name: 'Allow Multiple Values',
				type: 'boolean',
				meta: {
					width: 'half',
					interface: 'boolean',
					options: {
						label: 'Separated by ; and ,',
					},
				},
				schema: {
					default_value: false,
				},
			},
			{
				field: 'filter',
				name: 'Filter',
				type: 'json',
				meta: {
					interface: 'system-filter',
					options: {
						collectionName: relations.m2o?.related_collection ?? null,
					},
					conditions: [
						{
							rule: {
								enableSelect: {
									_eq: false,
								},
							},
							hidden: true,
						},
					],
				},
			},
			{
				field: 'sortField',
				type: 'string',
				name: 'Sort Field',
				collection: relations.m2o?.related_collection,
				meta: {
					width: 'half',
					interface: 'system-field',
					options: {
						allowPrimaryKey: true,
						allowNone: true,
					},
				},
			},
			{
				field: 'sortDirection',
				type: 'string',
				name: 'Sort Direction',
				schema: {
					default_value: 'desc',
				},
				meta: {
					width: 'half',
					interface: 'select-dropdown',
					options: {
						choices: [
							{
								text: 'Sort Ascending',
								value: 'asc',
							},
							{
								text: 'Sort Descending',
								value: 'desc',
							},
						],
					},
				},
			},
		];
	},
	recommendedDisplays: ['related-values'],
	preview: `<svg width="156" height="96" fill="none" xmlns="http://www.w3.org/2000/svg">
		<rect x="18" y="23" width="120" height="26" rx="6" fill="var(--background-page)" class="glow"/>
		<rect x="19" y="24" width="118" height="24" rx="5" stroke="var(--primary)" stroke-width="2"/>
		<rect x="28" y="33" width="30" height="6" rx="2" fill="var(--primary)" fill-opacity=".25"/>
		<rect x="18" y="57" width="30" height="6" rx="2" fill="var(--primary)"/>
		<rect x="66" y="57" width="40" height="6" rx="2" fill="var(--primary)"/>
		<rect x="42" y="67" width="30" height="6" rx="2" fill="var(--primary)"/>
		<rect x="52" y="57" width="10" height="6" rx="2" fill="var(--primary)"/>
		<rect x="110" y="57" width="20" height="6" rx="2" fill="var(--primary)"/>
		<rect x="76" y="67" width="10" height="6" rx="2" fill="var(--primary)"/>
		<rect x="90" y="67" width="20" height="6" rx="2" fill="var(--primary)"/>
		<rect x="18" y="67" width="20" height="6" rx="2" fill="var(--primary)"/>
	</svg>`,
});
