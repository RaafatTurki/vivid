<script lang="ts">
  import { Copy } from "@lucide/svelte"
  import Button from "./Button.svelte"

  let { roomID, copyLabel, onCopy }: { roomID: string; copyLabel: string; onCopy: () => void | Promise<void> } = $props()
</script>

<header>
  <div>
    <h1><span>room id:</span> {roomID}</h1>
  </div>
  <Button size="compact" onclick={onCopy}>
    <Copy size={17} aria-hidden="true" />
    {copyLabel}
  </Button>
</header>

<style>
  header {
    display: flex;
    gap: var(--space-6);
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-6);
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--line);
  }

  span {
    margin: 0 0 var(--space-3);
    color: var(--accent);
    text-transform: uppercase;
  }

  h1 {
    max-width: 24rem;
    margin: 0;
    overflow: hidden;
    font-size: clamp(1.25rem, 3vw, 2rem);
    line-height: 1;
    letter-spacing: -0.045em;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 47.5em) {
    header { align-items: stretch; flex-direction: column; }
    header :global(.ui-button) { width: 100%; }
  }
</style>
