type LoadingStateProps = {
  label?: string
  className?: string
}

export default function LoadingState({ label = 'Loading...', className }: LoadingStateProps) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-[#dcdcdc] bg-white p-4 text-sm text-[#4a4a4a] ${className || ''}`}>
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#b80f0a] border-t-transparent" aria-hidden />
      <span>{label}</span>
    </div>
  )
}
