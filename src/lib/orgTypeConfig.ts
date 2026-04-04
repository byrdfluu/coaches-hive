export type OrgTypeKey = 'school' | 'club' | 'travel' | 'academy' | 'organization'

export type OrgTypeTemplate = {
  title: string
  body: string
}

export type OrgTypeFeeTemplate = {
  title: string
  amount: string
  audience: 'team' | 'coach' | 'athlete'
}

export type OrgTypeConfig = {
  label: string
  nav: {
    teams: string
    calendar: string
    reports: string
    payments: string
  }
  portal: {
    header: string
    title: string
    description: string
    teamsLabel: string
    teamsBody: string
    coachesLabel: string
    coachesBody: string
    calendarLabel: string
    reportsLabel: string
  }
  policies: {
    title: string
    seasonLabel: string
    seasonStartPlaceholder: string
    seasonEndPlaceholder: string
    guardianLabel: string
    eligibilityLabel: string
    medicalLabel: string
    communicationLabel: string
  }
  compliance: {
    title: string
    description: string
    checklist: string[]
  }
  teamForm: {
    namePlaceholder: string
    gradeLabel: string
    gradePlaceholder: string
    ageLabel: string
    agePlaceholder: string
    levelLabel: string
    levelPlaceholder: string
  }
  sessionTypes: string[]
  announcementTemplates: OrgTypeTemplate[]
  feeTemplates: OrgTypeFeeTemplate[]
  modules: Record<string, boolean>
}

export const ORG_TYPE_OPTIONS = [
  { value: 'school', label: 'School' },
  { value: 'club', label: 'Club' },
  { value: 'travel', label: 'Travel' },
  { value: 'academy', label: 'Academy' },
]

export const normalizeOrgType = (value?: string | null): OrgTypeKey => {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'school' || normalized === 'club' || normalized === 'travel' || normalized === 'academy') {
    return normalized
  }
  return 'organization'
}

const ORG_TYPE_CONFIG: Record<OrgTypeKey, OrgTypeConfig> = {
  school: {
    label: 'School',
    nav: {
      teams: 'Teams',
      calendar: 'Calendar',
      reports: 'Reports',
      payments: 'Payments',
    },
    portal: {
      header: 'School portal',
      title: 'Athletics command center',
      description: 'Oversee teams, compliance, coaches, and reporting across the school.',
      teamsLabel: 'Teams',
      teamsBody: 'Manage rosters, schedules, and eligibility.',
      coachesLabel: 'Coach directory',
      coachesBody: 'Track assignments, certifications, and performance.',
      calendarLabel: 'Calendar & compliance',
      reportsLabel: 'Compliance reports',
    },
    policies: {
      title: 'School policies',
      seasonLabel: 'Season dates',
      seasonStartPlaceholder: 'Fall season start',
      seasonEndPlaceholder: 'Fall season end',
      guardianLabel: 'Guardian consent required',
      eligibilityLabel: 'Eligibility tracking',
      medicalLabel: 'Medical clearance required',
      communicationLabel: 'Communication limits',
    },
    compliance: {
      title: 'Compliance',
      description: 'Track eligibility and required documentation.',
      checklist: [
        'Eligibility forms collected',
        'Guardian consent on file',
        'Physicals verified',
        'Insurance certificates uploaded',
      ],
    },
    teamForm: {
      namePlaceholder: 'Varsity Basketball',
      gradeLabel: 'Grade level',
      gradePlaceholder: '9-12',
      ageLabel: 'Age range',
      agePlaceholder: '14-18',
      levelLabel: 'Team level',
      levelPlaceholder: 'Varsity',
    },
    sessionTypes: ['Practice', 'Game', 'Tryout', 'Meeting', 'Study hall'],
    announcementTemplates: [
      { title: 'Eligibility reminder', body: 'Eligibility forms are due by Friday. Please submit all required documentation.' },
      { title: 'Game-day schedule', body: 'Game-day details: arrive 90 minutes early. Bus departs at 3:30 PM.' },
      { title: 'Weather update', body: 'Weather update: today’s session has moved indoors. Check the calendar for details.' },
    ],
    feeTemplates: [
      { title: 'Athletic participation fee', amount: '250', audience: 'athlete' },
      { title: 'Uniform package', amount: '85', audience: 'athlete' },
      { title: 'Travel deposit', amount: '150', audience: 'team' },
    ],
    modules: {
      compliance: true,
      eligibility: true,
      travel: false,
      waivers: true,
      academics: true,
    },
  },
  club: {
    label: 'Club',
    nav: {
      teams: 'Programs',
      calendar: 'Calendar',
      reports: 'Club reports',
      payments: 'Dues',
    },
    portal: {
      header: 'Club portal',
      title: 'Club operations hub',
      description: 'Manage programs, coaches, and athlete progress in one place.',
      teamsLabel: 'Programs',
      teamsBody: 'Set up squads, rosters, and schedules.',
      coachesLabel: 'Coach directory',
      coachesBody: 'Track coach assignments and availability.',
      calendarLabel: 'Calendar & bookings',
      reportsLabel: 'Club reports',
    },
    policies: {
      title: 'Club policies',
      seasonLabel: 'Season dates',
      seasonStartPlaceholder: 'Program start date',
      seasonEndPlaceholder: 'Program end date',
      guardianLabel: 'Guardian consent required',
      eligibilityLabel: 'Eligibility tracking',
      medicalLabel: 'Medical clearance required',
      communicationLabel: 'Communication limits',
    },
    compliance: {
      title: 'Membership compliance',
      description: 'Track waivers, consents, and membership agreements.',
      checklist: [
        'Club membership agreement signed',
        'Guardian consent on file',
        'Medical clearance verified',
        'Code of conduct acknowledged',
      ],
    },
    teamForm: {
      namePlaceholder: 'U14 Girls',
      gradeLabel: 'Grade level',
      gradePlaceholder: 'Optional',
      ageLabel: 'Age group',
      agePlaceholder: '10-12',
      levelLabel: 'Skill level',
      levelPlaceholder: 'Gold',
    },
    sessionTypes: ['Practice', 'Training', 'Scrimmage', 'Meeting', 'Camp'],
    announcementTemplates: [
      { title: 'Membership renewal', body: 'Membership renewals are open. Submit dues by the end of the month.' },
      { title: 'Clinic schedule', body: 'Clinic schedule is live. Please check the calendar for updated sessions.' },
      { title: 'Roster update', body: 'Updated roster lists are available in the teams section.' },
    ],
    feeTemplates: [
      { title: 'Membership dues', amount: '200', audience: 'athlete' },
      { title: 'Clinic registration', amount: '75', audience: 'athlete' },
      { title: 'Uniform package', amount: '95', audience: 'athlete' },
    ],
    modules: {
      compliance: true,
      eligibility: false,
      travel: false,
      waivers: true,
      academics: false,
    },
  },
  travel: {
    label: 'Travel',
    nav: {
      teams: 'Travel squads',
      calendar: 'Travel calendar',
      reports: 'Travel reports',
      payments: 'Trip fees',
    },
    portal: {
      header: 'Travel portal',
      title: 'Travel team HQ',
      description: 'Coordinate rosters, travel calendars, and coach coverage.',
      teamsLabel: 'Travel squads',
      teamsBody: 'Manage rosters, schedules, and travel details.',
      coachesLabel: 'Coach directory',
      coachesBody: 'Track coach coverage and rotations.',
      calendarLabel: 'Calendar & travel',
      reportsLabel: 'Travel reports',
    },
    policies: {
      title: 'Travel policies',
      seasonLabel: 'Travel season dates',
      seasonStartPlaceholder: 'Travel season start',
      seasonEndPlaceholder: 'Travel season end',
      guardianLabel: 'Guardian consent required',
      eligibilityLabel: 'Eligibility tracking',
      medicalLabel: 'Medical clearance required',
      communicationLabel: 'Travel communication limits',
    },
    compliance: {
      title: 'Travel compliance',
      description: 'Track waivers, medical clearance, and travel documentation.',
      checklist: [
        'Travel waivers signed',
        'Guardian consent on file',
        'Medical clearance verified',
        'Travel insurance uploaded',
      ],
    },
    teamForm: {
      namePlaceholder: '16U Travel',
      gradeLabel: 'Grade level',
      gradePlaceholder: 'Optional',
      ageLabel: 'Age group',
      agePlaceholder: '15-16',
      levelLabel: 'Travel tier',
      levelPlaceholder: 'Elite',
    },
    sessionTypes: ['Practice', 'Tournament', 'Travel day', 'Meeting', 'Game'],
    announcementTemplates: [
      { title: 'Travel itinerary', body: 'Travel itinerary is live. Please review hotel and bus details.' },
      { title: 'Packing checklist', body: 'Reminder: pack uniforms, ID, and travel documents.' },
      { title: 'Tournament update', body: 'Tournament schedule updated. Check your team page.' },
    ],
    feeTemplates: [
      { title: 'Tournament fee', amount: '225', audience: 'athlete' },
      { title: 'Travel deposit', amount: '300', audience: 'team' },
      { title: 'Uniform package', amount: '95', audience: 'athlete' },
    ],
    modules: {
      compliance: true,
      eligibility: false,
      travel: true,
      waivers: true,
      academics: false,
    },
  },
  academy: {
    label: 'Academy',
    nav: {
      teams: 'Training groups',
      calendar: 'Training calendar',
      reports: 'Performance reports',
      payments: 'Memberships',
    },
    portal: {
      header: 'Academy portal',
      title: 'Training academy HQ',
      description: 'Manage training groups, coaches, and athlete progress.',
      teamsLabel: 'Training groups',
      teamsBody: 'Organize cohorts, sessions, and progress tracking.',
      coachesLabel: 'Coach directory',
      coachesBody: 'Track instructor assignments and availability.',
      calendarLabel: 'Training calendar',
      reportsLabel: 'Performance reports',
    },
    policies: {
      title: 'Academy policies',
      seasonLabel: 'Training cycle dates',
      seasonStartPlaceholder: 'Cycle start date',
      seasonEndPlaceholder: 'Cycle end date',
      guardianLabel: 'Guardian consent required',
      eligibilityLabel: 'Eligibility tracking',
      medicalLabel: 'Medical clearance required',
      communicationLabel: 'Communication limits',
    },
    compliance: {
      title: 'Academy compliance',
      description: 'Track waivers and training readiness documentation.',
      checklist: [
        'Training waiver signed',
        'Guardian consent on file',
        'Medical clearance verified',
        'Code of conduct acknowledged',
      ],
    },
    teamForm: {
      namePlaceholder: 'Elite Performance Group',
      gradeLabel: 'Grade level',
      gradePlaceholder: 'Optional',
      ageLabel: 'Age group',
      agePlaceholder: '15-18',
      levelLabel: 'Training level',
      levelPlaceholder: 'Advanced',
    },
    sessionTypes: ['Session', 'Assessment', 'Strength', 'Skills lab', 'Meeting'],
    announcementTemplates: [
      { title: 'Training block update', body: 'New training block starts next week. Review the updated focus areas.' },
      { title: 'Assessment schedule', body: 'Assessments are scheduled for next Monday. Arrive 15 minutes early.' },
      { title: 'Progress check-in', body: 'Mid-cycle progress check-ins are open in the reports tab.' },
    ],
    feeTemplates: [
      { title: 'Monthly training membership', amount: '180', audience: 'athlete' },
      { title: 'Assessment fee', amount: '50', audience: 'athlete' },
      { title: 'Performance package', amount: '120', audience: 'athlete' },
    ],
    modules: {
      compliance: true,
      eligibility: false,
      travel: false,
      waivers: true,
      academics: false,
    },
  },
  organization: {
    label: 'Organization',
    nav: {
      teams: 'Teams',
      calendar: 'Calendar',
      reports: 'Reports',
      payments: 'Payments',
    },
    portal: {
      header: 'Organization portal',
      title: 'Central hub for multi-team programs',
      description: 'Manage teams, coaches, payouts, and reporting under one brand.',
      teamsLabel: 'Teams',
      teamsBody: 'Set up teams, rosters, and schedules.',
      coachesLabel: 'Coach directory',
      coachesBody: 'Track coach performance and assignments.',
      calendarLabel: 'Calendar & bookings',
      reportsLabel: 'Reports',
    },
    policies: {
      title: 'Org policies',
      seasonLabel: 'Season dates',
      seasonStartPlaceholder: 'Season start',
      seasonEndPlaceholder: 'Season end',
      guardianLabel: 'Guardian consent required',
      eligibilityLabel: 'Eligibility tracking',
      medicalLabel: 'Medical clearance required',
      communicationLabel: 'Communication limits',
    },
    compliance: {
      title: 'Compliance',
      description: 'Track eligibility and required documentation.',
      checklist: [
        'Guardian consent on file',
        'Medical clearance verified',
        'Code of conduct acknowledged',
        'Insurance documents uploaded',
      ],
    },
    teamForm: {
      namePlaceholder: 'Team name',
      gradeLabel: 'Grade level',
      gradePlaceholder: 'Optional',
      ageLabel: 'Age range',
      agePlaceholder: 'Optional',
      levelLabel: 'Level',
      levelPlaceholder: 'Optional',
    },
    sessionTypes: ['Practice', 'Training', 'Meeting', 'Game', 'Session'],
    announcementTemplates: [
      { title: 'Schedule update', body: 'Updated schedule has been posted. Review in the calendar.' },
      { title: 'Roster update', body: 'Roster updates are live. Check your team page.' },
      { title: 'Policy reminder', body: 'Reminder to review the updated program policies.' },
    ],
    feeTemplates: [
      { title: 'Annual dues', amount: '150', audience: 'athlete' },
      { title: 'Uniform fee', amount: '90', audience: 'athlete' },
      { title: 'Program fee', amount: '200', audience: 'team' },
    ],
    modules: {
      compliance: true,
      eligibility: false,
      travel: false,
      waivers: true,
      academics: false,
    },
  },
}

export const getOrgTypeConfig = (value?: string | null) => ORG_TYPE_CONFIG[normalizeOrgType(value)]

