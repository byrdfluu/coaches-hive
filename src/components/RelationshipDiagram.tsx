type ActiveNode = 'org' | 'coach' | 'athlete'

const NODES: { id: ActiveNode; label: string }[] = [
  { id: 'org', label: 'Organization' },
  { id: 'coach', label: 'Coach' },
  { id: 'athlete', label: 'Athlete' },
]

const barlow = { fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif" }

export default function RelationshipDiagram({ activeNode }: { activeNode: ActiveNode }) {
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-0">
      {NODES.flatMap((node, i) => {
        const isActive = node.id === activeNode
        const elements = [
          <div
            key={node.id}
            className={`flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-full border-2 sm:h-32 sm:w-32 ${
              isActive
                ? 'border-[#BCFF1F] bg-[#BCFF1F]'
                : 'border-[#3a3a3a] bg-transparent'
            }`}
          >
            <span
              className={`text-center text-xs font-bold uppercase leading-snug tracking-[0.15em] ${
                isActive ? 'text-[#191919]' : 'text-[#4a4a4a]'
              }`}
              style={barlow}
            >
              {node.label}
            </span>
          </div>,
        ]

        if (i < NODES.length - 1) {
          elements.push(
            <div key={`arrow-${i}`} className="flex items-center justify-center">
              <svg
                className="hidden sm:block"
                width="56"
                height="16"
                viewBox="0 0 56 16"
                fill="none"
                aria-hidden="true"
              >
                <line x1="0" y1="8" x2="44" y2="8" stroke="#3a3a3a" strokeWidth="1.5" />
                <path d="M42 3 L54 8 L42 13" fill="none" stroke="#3a3a3a" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
              <svg
                className="block sm:hidden"
                width="16"
                height="36"
                viewBox="0 0 16 36"
                fill="none"
                aria-hidden="true"
              >
                <line x1="8" y1="0" x2="8" y2="26" stroke="#3a3a3a" strokeWidth="1.5" />
                <path d="M3 24 L8 34 L13 24" fill="none" stroke="#3a3a3a" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </div>,
          )
        }

        return elements
      })}
    </div>
  )
}
