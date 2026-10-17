import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive cursor-pointer",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-sm shadow-primary/25 hover:brightness-110 hover:shadow-md hover:shadow-primary/30 active:scale-[0.98] font-semibold',
        destructive:
          'bg-destructive text-white shadow-sm hover:bg-destructive/90 active:scale-[0.98] focus-visible:ring-destructive/30',
        outline:
          'border border-border bg-background shadow-xs hover:border-primary/40 hover:bg-accent hover:text-accent-foreground active:scale-[0.98]',
        secondary:
          'bg-secondary text-secondary-foreground border border-primary/15 hover:bg-secondary/80 hover:border-primary/30 active:scale-[0.98]',
        ghost:
          'hover:bg-accent hover:text-accent-foreground active:scale-[0.98]',
        link: 'text-primary underline-offset-4 hover:underline',
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
