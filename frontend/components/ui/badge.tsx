import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-gradient-to-r from-[#00c573] to-[#3ecf8e] text-slate-950 font-bold shadow-xs',
        secondary:
          'border-emerald-800/40 bg-emerald-950/50 text-emerald-300 [a&]:hover:bg-emerald-900/60',
        destructive:
          'border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border-emerald-800/40 text-foreground [a&]:hover:bg-emerald-950/40 [a&]:hover:text-emerald-300',
        success:
          'border-transparent bg-emerald-500/15 text-emerald-400 [a&]:hover:bg-emerald-500/25',
        warning:
          'border-transparent bg-amber-500/15 text-amber-400 [a&]:hover:bg-amber-500/25',
        info:
          'border-transparent bg-blue-500/15 text-blue-400 [a&]:hover:bg-blue-500/25',
        danger:
          'border-transparent bg-red-500/15 text-red-400 [a&]:hover:bg-red-500/25',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
