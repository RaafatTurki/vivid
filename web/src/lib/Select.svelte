<script lang="ts">
  import { Check, ChevronDown } from "@lucide/svelte"

  interface Option { value: string; label: string }
  interface Props {
    value: string
    options: Option[]
    /** Shown when there are no options or nothing matches the value. */
    placeholder?: string
    disabled?: boolean
    /** id of the element that labels this control. */
    labelledby?: string
    onchange: (value: string) => void
  }

  let { value, options, placeholder = "", disabled = false, labelledby, onchange }: Props = $props()

  const id = $props.id()
  const ITEM_HEIGHT = 36
  const MAX_LIST_HEIGHT = 264

  let open = $state(false)
  let active = $state(0)
  let above = $state(false)
  let root = $state<HTMLDivElement>()
  let trigger = $state<HTMLButtonElement>()
  let list = $state<HTMLUListElement>()
  let typed = ""
  let typedTimer: ReturnType<typeof setTimeout> | undefined

  const selectedIndex = $derived(options.findIndex(option => option.value === value))
  const current = $derived(options[selectedIndex]?.label ?? placeholder)

  function show() {
    if (disabled || !options.length || !trigger) return
    // Open upward when the list would run off the bottom of the screen.
    const rect = trigger.getBoundingClientRect()
    const height = Math.min(options.length * ITEM_HEIGHT + 10, MAX_LIST_HEIGHT)
    above = rect.bottom + height + 8 > window.innerHeight && rect.top > window.innerHeight - rect.bottom
    active = Math.max(selectedIndex, 0)
    open = true
  }

  function choose(index: number) {
    const option = options[index]
    open = false
    trigger?.focus()
    if (option && option.value !== value) onchange(option.value)
  }

  function onKeydown(event: KeyboardEvent) {
    if (disabled) return
    const last = options.length - 1
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault()
        if (!open) return show()
        active = event.key === "ArrowDown" ? Math.min(active + 1, last) : Math.max(active - 1, 0)
        return
      case "Home":
      case "End":
        if (!open) return
        event.preventDefault()
        active = event.key === "Home" ? 0 : last
        return
      case "Enter":
      case " ":
        event.preventDefault()
        if (open) choose(active)
        else show()
        return
      case "Escape":
        if (!open) return
        // Keep a surrounding menu from closing too.
        event.preventDefault()
        event.stopPropagation()
        open = false
        return
      case "Tab":
        open = false
        return
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) typeahead(event.key)
  }

  // Jump to the first option whose label starts with what was typed in the last half second.
  function typeahead(key: string) {
    clearTimeout(typedTimer)
    typed += key.toLowerCase()
    typedTimer = setTimeout(() => typed = "", 500)
    const start = open ? active : Math.max(selectedIndex, 0)
    const ordered = [...options.keys()].map(offset => (start + (typed.length === 1 ? 1 : 0) + offset) % options.length)
    const match = ordered.find(index => options[index].label.toLowerCase().startsWith(typed))
    if (match === undefined) return
    if (open) active = match
    else if (options[match].value !== value) onchange(options[match].value)
  }

  $effect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => { if (!root?.contains(event.target as Node)) open = false }
    const onResize = () => open = false
    document.addEventListener("pointerdown", onPointer)
    window.addEventListener("resize", onResize)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      window.removeEventListener("resize", onResize)
    }
  })

  $effect(() => {
    if (open) list?.children[active]?.scrollIntoView({ block: "nearest" })
  })

  $effect(() => {
    if (disabled) open = false
  })
</script>

<div class="relative min-w-0" bind:this={root}>
  <button
    bind:this={trigger}
    type="button"
    role="combobox"
    class="field select"
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls="{id}-list"
    aria-labelledby={labelledby}
    aria-activedescendant={open ? `${id}-option-${active}` : undefined}
    {disabled}
    onclick={() => open ? open = false : show()}
    onkeydown={onKeydown}
  >
    <span class="min-w-0 flex-1 truncate">{current}</span>
    <ChevronDown size={14} class={["text-muted transition-transform duration-150", open && "rotate-180"]} />
  </button>

  {#if open}
    <ul
      bind:this={list}
      id="{id}-list"
      role="listbox"
      tabindex="-1"
      aria-labelledby={labelledby}
      class={[
        "absolute inset-x-0 z-30 flex max-h-66 animate-pop flex-col gap-0.5 overflow-y-auto rounded-xl border border-line-strong bg-panel p-1 shadow-menu",
        above ? "bottom-[calc(100%+6px)] origin-bottom" : "top-[calc(100%+6px)] origin-top",
      ]}
    >
      {#each options as option, index (option.value)}
        <!-- Keyboard input is handled by the combobox, which keeps focus while the list is open. -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li
          id="{id}-option-{index}"
          role="option"
          aria-selected={index === selectedIndex}
          class={[
            "flex h-8.5 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-caption transition-colors",
            index === active ? "bg-surface-2 text-ink" : "text-ink-2",
          ]}
          onpointerdown={(event) => event.preventDefault()}
          onpointermove={() => active = index}
          onclick={() => choose(index)}
        >
          <span class="min-w-0 flex-1 truncate">{option.label}</span>
          {#if index === selectedIndex}<Check size={14} strokeWidth={2.4} class="text-accent" />{/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
