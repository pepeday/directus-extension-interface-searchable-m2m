<template>
  <!-- No changes to template section -->
</template>

<script setup>
import { onMounted } from 'vue';

const props = defineProps({
  collection: {
    type: String,
    required: true
  },
  primaryKey: {
    type: String,
    required: true
  },
  junctionField: {
    type: String,
    required: true
  }
});

onMounted(() => {
  console.log('[DEBUG] Drawer component mounted with props:', {
    collection: props.collection,
    primaryKey: props.primaryKey,
    junctionField: props.junctionField
  });

  // Check if any API calls are being attempted
  console.log('[DEBUG] Drawer will attempt to load data:', 
    props.primaryKey && props.primaryKey !== '+'
  );
  
  // Track parent component references
  console.log('[DEBUG] Drawer parent component state:', {
    hasParent: !!window.$parent,
    parentType: window.$parent ? window.$parent.constructor.name : 'none'
  });
});

// Add to API loading function if possible
function loadItem() {
  console.log('[DEBUG] Drawer attempting to load item data');
  // existing loading code
}
</script>

<style>
  /* No changes to style section */
</style> 