<template>
  <v-list-item 
    v-tooltip="t('Click to edit')" 
    :disabled="disabled || !selectAllowed" 
    class="link block clickable" 
    :style="{ 
      color: isDeleted ? 'var(--danger)' : undefined,
      backgroundColor: isDeleted ? 'var(--danger-alt)' : undefined
    }"
    @click="$emit('edit', item, index)"
  >
    <v-icon 
      v-if="isSortable" 
      name="drag_handle" 
      class="drag-handle" 
      left 
      @click.stop
    />
    <template v-if="item[junctionField]?.$loading">
      <v-skeleton-loader type="list-item-icon" />
    </template>
    <template v-else>
      <v-list-item-content>
        <div class="render-template-wrapper">
          <template v-for="field in templateFields" :key="field">
            <HtmlContent 
              v-if="field.includes('html') && item[junctionField]?.[field.replace(junctionField + '.', '')]" 
              class="field" 
              :content="item[junctionField][field.replace(junctionField + '.', '')]"
            />
            <template v-else>
              <render-template
                :collection="collection"
                :item="item"
                :template="`{{${field.includes('.') ? field : junctionField + '.' + field}}}`"
              />
            </template>
          </template>
        </div>
      </v-list-item-content>

      <v-list-item-action>
        <v-icon
          v-tooltip="t('navigate_to_item')"
          name="launch"
          clickable
          class="item-link"
          :class="{ disabled: item.$type === 'created' }"
          @click.stop="$emit('navigate', item)"
        />
        <v-icon 
          class="deselect" 
          :class="{ deleted: item.$type === 'deleted' }"
          :name="isDeleted ? 'settings_backup_restore' : 'close'" 
          v-tooltip="isDeleted ? t('Undo Removed Item') : t('Remove Item')" 
          @click.stop="$emit('delete', item)"
        />
      </v-list-item-action>
    </template>
  </v-list-item>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { getFieldsFromTemplate } from '@directus/utils';
import HtmlContent from './html-content.vue';
import Draggable from 'vuedraggable';

const { t } = useI18n();

const props = defineProps<{
  item: Record<string, any>;
  index: number;
  disabled: boolean;
  selectAllowed: boolean;
  isDeleted: boolean;
  template: string;
  collection: string;
  junctionField: string;
  isSortable: boolean;
}>();

const emit = defineEmits<{
  (e: 'edit', item: Record<string, any>, index: number): void;
  (e: 'delete', item: Record<string, any>): void;
  (e: 'navigate', item: Record<string, any>): void;
}>();

const templateFields = computed(() => {
  return getFieldsFromTemplate(props.template || '');
});
</script>

<style lang="scss" scoped>
.render-template-wrapper {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;

  .field {
    display: inline-flex;
    align-items: center;
  }

  :deep(.render-template) {
    display: inline-flex;
    align-items: center;
  }
}

.item-link {
  --v-icon-color: var(--theme--form--field--input--foreground-subdued);
  transition: color var(--fast) var(--transition);
  margin: 0 4px;

  &:hover {
    --v-icon-color: var(--theme--primary);
  }

  &.disabled {
    opacity: 0;
    pointer-events: none;
  }
}

.deselect {
  --v-icon-color: var(--theme--form--field--input--foreground-subdued);
  transition: color var(--fast) var(--transition);
  margin: 0 4px;
  cursor: pointer;

  &:hover {
    --v-icon-color: var(--theme--danger);
  }

  &.deleted {
    --v-icon-color: var(--danger-75);
  }
}

.drag-handle {
  cursor: grab;
  transition: color var(--fast) var(--transition);
  
  &:hover {
    color: var(--theme--primary);
  }
}
</style> 