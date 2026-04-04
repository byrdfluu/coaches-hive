const sports = [
  'TENNIS',
  'BASKETBALL',
  'FOOTBALL',
  'SOCCER',
  'BASEBALL',
  'HOCKEY',
  'BOARD GAMES',
  'VOLLEYBALL',
  'SWIMMING',
  'BOXING',
  'GOLF',
  'COMBAT',
]

export default function SportsTicker() {
  const items = [...sports, ...sports]

  return (
    <div className="mt-6 border-t border-[#ebd7d6] bg-[#fef4f4] py-3">
      <div className="overflow-hidden">
        <div className="sports-ticker-track">
          {items.map((sport, index) => (
            <span key={`${sport}-${index}`} className="sports-ticker-item">
              {sport}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
