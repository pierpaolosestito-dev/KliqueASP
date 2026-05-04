<script lang="ts">
	import { asset } from '$app/paths';
</script>

<svelte:head>
	<link rel="icon" href={asset('/graph-icon.png')} type="image/png" />
</svelte:head>

<slot />