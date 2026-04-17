'use client'

import { useState } from 'react'

type PasswordInputProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  id?: string
  name?: string
  className?: string
  ariaInvalid?: boolean
}

export default function PasswordInput({
  value,
  onChange,
  placeholder,
  id,
  name,
  className = '',
  ariaInvalid,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-invalid={ariaInvalid}
        className={`${className} pr-20`}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#efefef] focus:outline-none focus:ring-2 focus:ring-[#191919]/20"
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}
