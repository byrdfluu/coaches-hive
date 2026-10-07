import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Owner sign in | Coaches Hive',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
}

export default function OwnerLoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
