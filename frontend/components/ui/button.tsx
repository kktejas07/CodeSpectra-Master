import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive cursor-pointer",
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-r from-[#00c573] via-[#10b981] to-[#3ecf8e] text-slate-950 hover:brightness-110 shadow-md shadow-[#00c573]/20 hover:shadow-lg hover:shadow-[#00c573]/35 active:scale-[0.98] border border-[#00c573]/40 font-bold',
        destructive:
          'bg-gradient-to-r from-red-600 to-rose-600 text-white hover:brightness-110 shadow-md shadow-red-950/30 active:scale-[0.98]',
        outline:
          'border border-slate-700/80 dark:border-slate-800 bg-background/60 backdrop-blur-xs hover:bg-emerald-950/30 hover:border-emerald-500/40 text-foreground hover:text-white shadow-xs active:scale-[0.98]',
        secondary:
          'bg-slate-900/80 text-emerald-300 hover:bg-slate-800 border border-emerald-500/30 hover:border-emerald-400/50 shadow-xs active:scale-[0.98]',
        ghost:
          'hover:bg-emerald-950/30 text-foreground hover:text-emerald-300 active:scale-[0.98]',
        link: 'text-[#00c573] dark:text-[#3ecf8e] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 text-xs has-[>svg]:px-2.5',
        lg: 'h-10 rounded-lg px-6 text-base has-[>svg]:px-4',
        icon: 'size-9 rounded-lg',
        'icon-sm': 'size-8 rounded-md',
        'icon-lg': 'size-10 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
