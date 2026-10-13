'use client'
import LeagueParticipationWorkspace from '@/components/LeagueParticipationWorkspace'
import { useAthleteProfile } from '@/components/AthleteProfileContext'
export default function AthleteLeaguePage(){const{activeSubProfileId}=useAthleteProfile();return <LeagueParticipationWorkspace portal="family" athleteProfileId={activeSubProfileId}/>}
