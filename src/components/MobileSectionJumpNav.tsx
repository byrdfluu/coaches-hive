'use client'

type JumpSection = {
  href: string
  label: string
}

type MobileSectionJumpNavProps = {
  sections: JumpSection[]
  actionLabel?: string
  onAction?: () => void
}

export default function MobileSectionJumpNav({
  sections,
  actionLabel,
  onAction,
}: MobileSectionJumpNavProps) {
  if (!sections.length && !actionLabel) return null

  return (
    <div className="glass-card lg:hidden border border-[#191919] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.3em] text-[#4a4a4a]">Jump to</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="text-xs font-semibold text-[#b80f0a] underline"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
        {sections.map((section) => (
          <a
            key={section.href}
            href={section.href}
            className="whitespace-nowrap rounded-full border border-[#191919] px-3 py-1.5 text-xs font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-white"
          >
            {section.label}
          </a>
        ))}
      </div>
    </div>
  )
}
