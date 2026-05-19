import { redirect } from 'next/navigation'

export default function ActiveAthletesRedirect() {
  redirect('/coach/athletes')
}
