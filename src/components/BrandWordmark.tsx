type BrandWordmarkProps = {
  className?: string
  sport?: boolean
}

export default function BrandWordmark({ className = '', sport = false }: BrandWordmarkProps) {
  const styleClass = sport ? 'brand-wordmark-sport' : 'brand-wordmark-standard'

  return (
    <span className={`brand-wordmark ${styleClass} ${className}`.trim()}>
      <span className="brand-wordmark-segment brand-wordmark-coaches">COACHES</span>
      <span className="brand-wordmark-segment brand-wordmark-hive">HIVE</span>
    </span>
  )
}
