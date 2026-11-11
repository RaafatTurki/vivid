<script lang="ts">
  import type { MediaController } from "./call/media.svelte"

  let { media, class: className = "" }: { media: MediaController; class?: string } = $props()
</script>

<div class={["grid grid-cols-1 gap-3 xs:grid-cols-2", className]}>
  <label class="label">
    Microphone
    <select
      class="field select"
      value={media.selectedAudioDeviceID}
      disabled={media.switchingAudioDevice || media.audioDevices.length < 2}
      onchange={(event) => media.changeAudioDevice(event.currentTarget.value)}
    >
      {#each media.audioDevices as device (device.deviceId)}
        <option value={device.deviceId}>{device.label}</option>
      {:else}
        <option value="">No microphone found</option>
      {/each}
    </select>
  </label>
  <label class="label">
    Camera
    <select
      class="field select"
      value={media.selectedVideoDeviceID}
      disabled={media.switchingVideoDevice || media.videoDevices.length < 2}
      onchange={(event) => media.changeVideoDevice(event.currentTarget.value)}
    >
      {#each media.videoDevices as device (device.deviceId)}
        <option value={device.deviceId}>{device.label}</option>
      {:else}
        <option value="">No camera found</option>
      {/each}
    </select>
  </label>
</div>
