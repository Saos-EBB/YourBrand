export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="w-full max-w-md mx-auto">
        <div className="mb-6 text-center">
          <span className="text-2xl font-bold text-on-surface tracking-tight">YourDemo</span>
        </div>
        {children}
      </div>
    </div>
  )
}
