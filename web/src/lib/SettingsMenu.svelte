<script lang="ts">
  import { Settings } from "@lucide/svelte"
  import DeviceSelects from "./DeviceSelects.svelte"
  import type { MediaController } from "./call/media.svelte"

  let { media }: { media: MediaController } = $props()
  let open = $state(false)
  let root = $state<HTMLDivElement>()

  $effect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => { if (!root?.contains(event.target as Node)) open = false }
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") open = false }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  })
</script>

<div class="relative" bind:this={root}>
  <button type="button" class="ghost-btn" aria-label="Settings" aria-expanded={open} aria-controls="settings-menu" onclick={() => open = !open}>
    <Settings size={18} />
  </button>
  {#if open}
    <div
      id="settings-menu"
      class="absolute right-0 bottom-[calc(100%+12px)] z-20 flex w-[min(420px,calc(100vw-32px))] flex-col gap-4 rounded-2xl border border-line bg-panel p-4 shadow-menu"
      role="dialog"
      aria-label="Settings"
    >
      <DeviceSelects {media} />
      <label class="flex cursor-pointer items-center justify-between gap-4 border-t border-line pt-4">
        <span class="flex flex-col gap-0.5">
          <strong class="text-caption font-medium">Noise suppression</strong>
          <small class="text-xs text-muted">Filters background noise from your mic</small>
        </span>
        <input type="checkbox" role="switch" class="switch" checked={media.noiseCancellationEnabled} onchange={() => media.toggleNoiseCancellation()} />
      </label>
    </div>
  {/if}
</div>
