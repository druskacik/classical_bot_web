<template>
    <UBadge :color="color" :variant="variant">
        {{ label }}
    </UBadge>
</template>

<script setup>
const props = defineProps({
    label: {
        type: String,
        required: true
    },
    variant: {
        type: String,
        default: 'solid'
    }
})

const color = computed(() => {
    // Generate a completely unique color based on the string
    const stringToColor = (str) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      
      // Convert to a wild hex color
      let color = '#';
      for (let i = 0; i < 3; i++) {
        // Shift the hash and take 2 hex digits for each RGB component
        const value = (hash >> (i * 8)) & 0xFF;
        color += ('00' + value.toString(16)).substr(-2);
      }

      if (color.startsWith('#f')) return 'red';
      if (color.startsWith('#e')) return 'orange';
      if (color.startsWith('#d')) return 'amber';
      if (color.startsWith('#c')) return 'yellow';
      if (color.startsWith('#b')) return 'lime';
      if (color.startsWith('#a')) return 'green';
      if (color.startsWith('#9')) return 'emerald';
      if (color.startsWith('#8')) return 'teal';
      if (color.startsWith('#7')) return 'cyan';
      if (color.startsWith('#6')) return 'sky';
      if (color.startsWith('#5')) return 'blue';
      if (color.startsWith('#4')) return 'indigo';
      if (color.startsWith('#3')) return 'violet';
      if (color.startsWith('#2')) return 'purple';
      if (color.startsWith('#1')) return 'fuchsia';
      if (color.startsWith('#0')) return 'pink';
      
      return 'rose'; // Fallback
    }
    
    // Special case for VIP
    if (props.label === 'Bratislava') return 'blue';
    if (props.label === 'Košice') return 'red';
    if (props.label === 'Prešov') return 'green';
    if (props.label === 'Nitra') return 'yellow';
    if (props.label === 'Trenčín') return 'purple';
    if (props.label === 'Žilina') return 'pink';
    if (props.label === 'Banská Bystrica') return 'indigo';
    
    // Generate wild but consistent color for other labels
    return stringToColor(props.label);
})
</script>