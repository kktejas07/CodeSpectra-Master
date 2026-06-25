export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-background via-background to-primary/5 px-4">
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  )
}
