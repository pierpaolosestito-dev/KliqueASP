<script lang="ts">
	import { asset } from '$app/paths';
</script>

<svelte:head>
	<link rel="icon" href={asset('/graph-icon.png')} type="image/png" />
</svelte:head>

<slot />

<style>
	:global(button:focus-visible),
	:global(a:focus-visible),
	:global(input:focus-visible),
	:global(select:focus-visible),
	:global(textarea:focus-visible),
	:global(summary:focus-visible),
	:global([tabindex]:focus-visible) {
		outline: 3px solid #0c4a6e !important;
		outline-offset: 2px !important;
		box-shadow: 0 0 0 1px #fff !important;
	}

	:global(dialog[open]:focus) {
		outline: 3px solid #0c4a6e !important;
		outline-offset: 3px !important;
		box-shadow: 0 0 0 1px #fff, 0 28px 90px rgba(15, 23, 42, 0.32) !important;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(*),
		:global(*::before),
		:global(*::after) {
			scroll-behavior: auto !important;
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
			transition-duration: 0.01ms !important;
		}
	}
</style>
