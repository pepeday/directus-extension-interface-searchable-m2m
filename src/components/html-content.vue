<template>
    <div 
        class="html-content" 
        v-html="content"
    />
</template>

<script lang="ts" setup>
defineProps<{
    content: string;
}>();
</script>

<style>
.html-content p {
    margin: 0;
    line-height: 1.5;
    display: flex;
    align-items: center;
    gap: 8px;
}

.html-content img {
    max-width: 40px !important;
    max-height: 40px !important;
    width: 40px !important;
    height: 40px !important;
    border-radius: 4px !important;
    object-fit: cover !important;
    vertical-align: middle !important;
    display: inline-block !important;
    margin-left: 4px !important;
    margin-right: 4px !important;
}

.html-content a {
    color: var(--primary);
    text-decoration: none;
}

.html-content a:hover {
    text-decoration: underline;
}
</style> 