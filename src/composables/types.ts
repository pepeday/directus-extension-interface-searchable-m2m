import { Field } from '@directus/types';

export interface RelationM2MTypes {
  junctionCollection: {
    collection: string;
  };
  relatedCollection: {
    collection: string;
  };
  junctionPrimaryKeyField: Field;
  relatedPrimaryKeyField: Field;
  junctionField: Field;
  reverseJunctionField: Field;
  referencingField: {
    field: string;
  };
}

export type StagedChanges = {
  create: Record<string, any>[];
  update: Record<string, any>[];
  delete: string[];
};

export type StagedItemData = {
  [key: string | number]: Record<string, any>;
};

export type JunctionItem = {
  [key: string]: any;
  id?: string | number;
}; 