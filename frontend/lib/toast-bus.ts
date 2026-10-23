/**
 * SEO-032: lazy toaster handshake. The first toast asks the provider to mount
 * the toaster, waits until it has mounted (sonner drops toasts published
 * before its <Toaster> subscribes), then loads goey-toast to show it.
 */
let requestMount: (() => void) | null = null
let wanted = false
let resolveMounted: () => void = () => {}
const mounted = new Promise<void>((r) => { resolveMounted = r })

export function registerToasterHost(mount: () => void): () => void {
  requestMount = mount
  if (wanted) mount()
  return () => { if (requestMount === mount) requestMount = null }
}

export function markToasterMounted(): void {
  resolveMounted()
}

let gooey: Promise<typeof import('goey-toast')> | null = null

/** Mounts the toaster if needed and resolves with goey-toast once toasts can show. */
export async function readyToaster(): Promise<typeof import('goey-toast')> {
  wanted = true
  requestMount?.()
  gooey ??= import('goey-toast')
  const [m] = await Promise.all([gooey, mounted])
  return m
}
