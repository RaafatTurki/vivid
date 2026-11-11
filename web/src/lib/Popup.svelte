<script lang="ts">
  interface Option { value: string; label: string; primary?: boolean }
  interface Props { open: boolean; title: string; message?: string; options: Option[]; onSelect: (value: string) => void; onClose: () => void }
  let { open, title, message = "", options, onSelect, onClose }: Props = $props()
  let dialog = $state<HTMLDialogElement>()

  $effect(() => {
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  })
</script>

<dialog
  bind:this={dialog}
  class="m-auto w-[min(380px,calc(100vw-32px))] rounded-2xl border border-line bg-panel p-6 text-ink backdrop:bg-black/60"
  aria-labelledby="popup-title"
  oncancel={(event) => { event.preventDefault(); onClose() }}
  onclose={onClose}
  onclick={(event) => { if (event.target === dialog) onClose() }}
>
  <h2 id="popup-title" class="text-[17px] font-semibold">{title}</h2>
  {#if message}<p class="mt-2 text-sm leading-normal text-muted">{message}</p>{/if}
  <div class="mt-5 flex flex-col-reverse gap-2">
    {#each options as option (option.value)}
      <button type="button" class={["btn h-11 w-full text-sm", option.primary ? "btn-primary" : "btn-secondary"]} onclick={() => onSelect(option.value)}>{option.label}</button>
    {/each}
  </div>
</dialog>

