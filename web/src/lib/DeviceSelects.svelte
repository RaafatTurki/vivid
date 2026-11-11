<script lang="ts">
  import Select from "./Select.svelte"
  import type { MediaController } from "./call/media.svelte"
  import type { MediaDeviceOption } from "./types"

  let { media, class: className = "" }: { media: MediaController; class?: string } = $props()

  const id = $props.id()
  const toOptions = (devices: MediaDeviceOption[]) => devices.map(device => ({ value: device.deviceId, label: device.label }))
</script>

<div class={["grid grid-cols-1 gap-3 xs:grid-cols-2", className]}>
  <div class="label">
    <span id="{id}-mic">Microphone</span>
    <Select
      labelledby="{id}-mic"
      value={media.selectedAudioDeviceID}
      options={toOptions(media.audioDevices)}
      placeholder="No microphone found"
      disabled={media.switchingAudioDevice || media.audioDevices.length < 2}
      onchange={(value) => media.changeAudioDevice(value)}
    />
  </div>
  <div class="label">
    <span id="{id}-cam">Camera</span>
    <Select
      labelledby="{id}-cam"
      value={media.selectedVideoDeviceID}
      options={toOptions(media.videoDevices)}
      placeholder="No camera found"
      disabled={media.switchingVideoDevice || media.videoDevices.length < 2}
      onchange={(value) => media.changeVideoDevice(value)}
    />
  </div>
</div>
