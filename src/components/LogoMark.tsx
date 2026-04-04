'use client'

import Image from 'next/image'

const TRANSPARENT_LOGO_SRC = '/CHLogoTransparent.PNG?v=20260329'

type LogoMarkProps = {
  className?: string
  label?: string
  size?: number
  blendMode?: 'normal' | 'darken' | 'multiply'
}

export default function LogoMark({
  className = '',
  label = 'Coaches Hive logo',
  size = 40,
  blendMode = 'normal',
}: LogoMarkProps) {
  const blendClass =
    blendMode === 'darken' ? 'mix-blend-darken' : blendMode === 'multiply' ? 'mix-blend-multiply' : ''

  return (
    <Image
      src={TRANSPARENT_LOGO_SRC}
      alt={label}
      width={size}
      height={size}
      unoptimized
      className={`object-contain ${blendClass} ${className}`.trim()}
      style={{ backgroundColor: 'transparent' }}
      priority
    />
  )
}
