/** Order status labels + badge tones (theme tokens; green only for success). */
export const STATUS_TEXT: Record<string, string> = {
  pending_payment: 'Awaiting payment', paid: 'Paid', partially_fulfilled: 'Partly delivered', fulfilled: 'Delivered',
  cancelled: 'Cancelled', refunded: 'Refunded', partially_refunded: 'Partly refunded',
}
export const STATUS_TONE: Record<string, string> = {
  pending_payment: 'bg-amber-500/10 text-amber-700 dark:text-amber-400', paid: 'bg-primary/10 text-primary', partially_fulfilled: 'bg-primary/10 text-primary',
  fulfilled: 'bg-green-500/10 text-green-700 dark:text-green-400', cancelled: 'bg-muted text-muted-foreground', refunded: 'bg-muted text-muted-foreground', partially_refunded: 'bg-muted text-muted-foreground',
}
