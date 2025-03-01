import type { Field, Relation, Collection } from '@directus/types';

// Define the RelationM2MTypes directly in this file
export type RelationM2MTypes = {
  relation: Relation;
  relatedCollection: Collection;
  relatedPrimaryKeyField: Field;
  junctionCollection: Collection;
  junctionPrimaryKeyField: Field;
  junctionField: Field;
  reverseJunctionField: Field;
  junction: Relation;
  sortField?: string;
  type: 'm2m';
};

// Clear separation between internal state and external data
export interface StagedChangesPayload {
  create: Record<string, any>[];
  update: Record<string, any>[];
  delete: string[];
}

// Define strict types for item states
export type ItemState = 'created' | 'updated' | 'deleted' | undefined;

// Update DisplayItem interface with strict types
export interface DisplayItem extends Record<string, any> {
  $type?: ItemState;
  $edits?: Record<string, any>;
  $index?: number;
  $local?: boolean;
}

// Define JunctionItem type for staged items
export interface JunctionItem extends Record<string, any> {
  _stageId: string;
  _status?: ItemState;
} 