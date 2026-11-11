<script lang="ts">
  import { MicOff, ScreenShare, VideoOff, X } from "@lucide/svelte"
  import { initials, tileColor } from "./utils"

  export interface Person { key: string; name: string; microphoneMuted: boolean; cameraStopped: boolean; screenSharing: boolean }

  let { people, onClose }: { people: Person[]; onClose: () => void } = $props()
</script>

<aside class="panel" aria-label="Participants">
  <header class="panel-header">
    <h2 class="font-semibold">People <span class="ml-1 font-normal text-muted">{people.length}</span></h2>
    <button type="button" class="icon-btn" aria-label="Close participants" onclick={onClose}><X size={16} /></button>
  </header>
  <ul class="flex-1 overflow-y-auto p-2">
    {#each people as person (person.key)}
      <li class="flex items-center gap-3 rounded-field p-2">
        <span class="grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold" style:background={tileColor(person.key)} aria-hidden="true">{initials(person.name)}</span>
        <span class="min-w-0 flex-1 truncate">{person.name}</span>
        <span class="flex gap-2">
          {#if person.screenSharing}<ScreenShare size={15} class="text-accent" aria-label="Presenting" />{/if}
          {#if person.cameraStopped}<VideoOff size={15} class="text-faint" aria-label="Camera off" />{/if}
          {#if person.microphoneMuted}<MicOff size={15} class="text-danger-ink" aria-label="Muted" />{/if}
        </span>
      </li>
    {/each}
  </ul>
</aside>
