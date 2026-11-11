<script lang="ts">
  let { size = 28, label = true }: { size?: number; label?: boolean } = $props()
</script>

<span class="inline-flex items-center gap-2.5">
  <span
    class="grid place-items-center bg-ink text-canvas"
    style:width="{size}px"
    style:height="{size}px"
    style:border-radius="{Math.round(size * 0.28)}px"
    aria-hidden="true"
  >
    <svg width={size * 0.57} height={size * 0.57} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l8 12 8-12" /></svg>
  </span>
  {#if label}<span class="text-base font-semibold tracking-[-0.01em] text-ink">Vivid</span>{/if}
</span>
