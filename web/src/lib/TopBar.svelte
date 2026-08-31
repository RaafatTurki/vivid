<script lang="ts">
  import type { ConnectionStatus } from "./types"

  let { state, text }: { state: ConnectionStatus; text: string } = $props()
</script>

<header>
  <a class="brand" href="/" aria-label="Vivid home">
    <span class="brand-mark" aria-hidden="true"></span>
    Vivid
  </a>
  <div class="status" data-state={state} role="status" aria-live="polite">
    <span class="status-dot" aria-hidden="true"></span>
    <span>{text}</span>
  </div>
</header>

<style>
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: env(safe-area-inset-top);
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--line);
    text-transform: uppercase;
    letter-spacing: 0.16em;
  }

  .brand {
    display: inline-flex;
    gap: var(--space-2);
    align-items: center;
    color: inherit;
    font-size: 0.78rem;
    font-weight: 600;
    text-decoration: none;
  }

  .brand-mark {
    width: 1.125rem;
    height: 1.125rem;
    border: 1px solid var(--accent);
    border-radius: 0;
    background: rgb(var(--accent-rgb) / 12%);
  }

  .brand-mark::after {
    display: block;
    width: 0;
    height: 0;
    margin: 4px 0 0 6px;
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
    border-left: 6px solid var(--accent);
    content: "";
  }

  .status {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--accent-border);
    border-radius: 2px;
    color: var(--accent);
    background: var(--accent-soft);
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .status-dot {
    width: 0.4375rem;
    height: 0.4375rem;
    border-radius: 50%;
    background: var(--muted);
  }

  .status[data-state="connecting"] .status-dot { background: var(--warning); }
  .status[data-state="connected"] .status-dot { background: var(--accent); }
  .status[data-state="error"] .status-dot { background: var(--danger); }
</style>
