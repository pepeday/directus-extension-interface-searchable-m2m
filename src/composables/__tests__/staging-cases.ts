/**
 * This file documents the expected behavior for different staging scenarios
 * in the many-to-many relationship interface.
 * 
 * Structure explanation:
 * - parentCollection: The collection that owns the relationship
 * - junctionCollection: The intermediate table that connects both collections
 * - relatedCollection: The collection being referenced
 * - junctionField: The field in junction table pointing to relatedCollection
 * - name: The field in relatedCollection that is being used to created a new item  (example)
 */

export const stagingTestCases = {
  // Case 1: Adding an existing item by selecting from dropdown
  selectExistingItem: {
    input: {
      item: { id: 1, name: "Existing Item" },
      junctionField: "related_item_id"
    },
    expectedStaging: {
      create: [{
        related_item_id: {
          id: 1,
          $tempId: 'temp_123'
        }
      }],
      update: [],
      delete: []
    }
  },

  // Case 2: Creating a new item by typing
  createNewItem: {
    input: {
      item: { name: "New Item" },
      junctionField: "related_item_id"
    },
    expectedStaging: {
      create: [{
        related_item_id: {
          name: "New Item",
          $tempId: 'temp_456'
        }
      }],
      update: [],
      delete: []
    }
  },

  // Case 3: Editing an existing junction item
  editExistingItem: {
    input: {
      item: { 
        junction_id: "j123",
        related_item_id: { 
          id: 1,
          name: "Updated Name"
        }
      },
      junctionField: "related_item_id"
    },
    expectedStaging: {
      create: [],
      update: [{
        junction_id: "j123",
        related_item_id: {
          id: 1,
          name: "Updated Name"
        }
      }],
      delete: []
    }
  },

  // Case 4: Editing a newly created (unsaved) item
  editNewItem: {
    input: {
      item: { 
        related_item_id: {
          name: "Draft Item",
          description: "New description"
        }
      },
      junctionField: "related_item_id"
    },
    expectedStaging: {
      create: [{
        related_item_id: {
          name: "Draft Item",
          description: "New description",
          $tempId: 'temp_789'
        }
      }],
      update: [],
      delete: []
    }
  },

  // Case 5: Deleting an existing junction item
  deleteExistingItem: {
    input: {
      item: { 
        junction_id: "j123",
        related_item_id: { id: 1 }
      }
    },
    expectedStaging: {
      create: [],
      update: [],
      delete: ["j123"]
    }
  },

  // Case 6: Deleting an unsaved item
  deleteUnsavedItem: {
    input: {
      item: {
        related_item_id: {
          name: "Draft Item",
          $tempId: 'temp_101'
        }
      },
      junctionField: "related_item_id"
    },
    expectedStaging: {
      create: [], // Item should be removed from create array
      update: [],
      delete: []
    }
  },

  // Case 7: Multiple operations combined
  combinedOperations: {
    input: {
      operations: [
        { type: 'create', item: { related_item_id: { name: "New Item" } } },
        { type: 'update', item: { junction_id: "j123", related_item_id: { id: 1, name: "Updated" } } },
        { type: 'delete', item: { junction_id: "j456" } }
      ]
    },
    expectedStaging: {
      create: [{
        related_item_id: {
          name: "New Item",
          $tempId: 'temp_111'
        }
      }],
      update: [{
        junction_id: "j123",
        related_item_id: {
          id: 1,
          name: "Updated"
        }
      }],
      delete: ["j456"]
    }
  }
};

/**
 * Key principles:
 * 1. Never include parent collection's ID in staged changes
 * 2. Always include $tempId for new items
 * 3. Keep only necessary junction field data
 * 4. Maintain item identity through consistent matching
 * 5. Handle both primitive (id) and object inputs
 * 
 * Field naming convention:
 * - junction_id: Primary key of the junction table
 * - related_item_id: Foreign key pointing to the related collection
 * - id: Primary key of items in the related collection
 */ 