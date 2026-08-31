export function mediaQuery(query: string) {
  const list = typeof window !== "undefined" ? window.matchMedia(query) : null
  let matches = $state(list?.matches ?? false)

  $effect(() => {
    if (!list) return
    const update = () => matches = list.matches
    update()
    list.addEventListener("change", update)
    return () => list.removeEventListener("change", update)
  })

  return {
    get matches() {
      return matches
    },
  }
}

export const MOBILE_BREAKPOINT = "(max-width: 47.5em)"
