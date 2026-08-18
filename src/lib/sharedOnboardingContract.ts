export type OnboardingRole = 'solo_coach' | 'org_coach' | 'org_director' | 'athlete'
export type OnboardingAnswer = string | string[]
export type OnboardingAnswers = Record<string, OnboardingAnswer>
export type OnboardingStep = {
  id: string
  message: string
  type: 'text' | 'textarea' | 'single' | 'multi' | 'tags' | 'date'
  options?: string[]
  placeholder?: string
  skippable?: boolean
}

export const SPORTS = ['Basketball','Baseball','Soccer','Football','Tennis','Track & Field','Swimming','Volleyball','Softball','Lacrosse','Wrestling','Cross Country']
export const AGE_GROUPS = ['Youth (6–10)','Middle School','High School','College','Adult','Professional']
export const LEVELS = ['Recreational','JV','Varsity','Club','College','Elite / Pro']
export const REFERRALS = ['Instagram','TikTok','Twitter / X','Facebook','Google Search','Word of Mouth','Coach / Trainer','School or Organization','App Store','Email / Newsletter','Podcast or YouTube','Other']
export const GRADES = ['Pre-K','Kindergarten','1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th','11th','12th','College','Adult']

const step = (id: string, message: string, type: OnboardingStep['type'], options?: string[], skippable = false, placeholder?: string): OnboardingStep =>
  ({ id, message, type, options, skippable, placeholder })

export const ONBOARDING_STEPS: Record<OnboardingRole, OnboardingStep[]> = {
  solo_coach: [
    step('sport','Welcome! What sport do you coach?','single',SPORTS),
    step('location','Where are you based?','text',undefined,true,'City, State'),
    step('experience','How many years have you been coaching?','single',['1–2 years','3–5 years','6–10 years','10+ years']),
    step('ageGroups','What age groups do you work with?','multi',AGE_GROUPS),
    step('levels','What competition levels do you train?','multi',LEVELS),
    step('specialties','What are your coaching specialties?','tags',undefined,true,'Shooting, Footwork, Defense'),
    step('certifications','Do you have any certifications?','tags',undefined,true,'USA Basketball, NSCA CSCS'),
    step('bio','Write a short bio about yourself.','textarea',undefined,true,'Background, playing experience, coaching story…'),
    step('philosophy','Describe your coaching philosophy.','textarea',undefined,true,'What drives your approach to coaching?'),
    step('modality','Do you train in-person, remote, or both?','single',['In-Person','Remote','Both']),
    step('locations','Where do you train? List your locations.','tags',undefined,true,'Downtown gym, North field'),
    step('services','What services do you offer?','tags',undefined,true,'1-on-1, Small Group, Film Study'),
    step('accepting','Are you currently accepting new athletes?','single',['Yes','No']),
    step('policy',"What's your cancellation and rescheduling policy?",'textarea',undefined,true),
    step('trial','Do you offer a free trial or intro session? If so, describe it.','textarea',undefined,true),
    step('referralSource','Last one: how did you hear about Coaches Hive?','single',REFERRALS,true),
  ],
  org_coach: [
    step('sport','Welcome! What sport do you coach?','single',SPORTS),
    step('experience','How many years have you been coaching?','single',['1–2 years','3–5 years','6–10 years','10+ years']),
    step('ageGroups','What age groups do you work with?','multi',AGE_GROUPS),
    step('levels','What competition levels do you train?','multi',LEVELS),
    step('specialties','What are your coaching specialties?','tags',undefined,true),
    step('certifications','Do you have any certifications?','tags',undefined,true),
    step('bio','Write a short bio about yourself.','textarea',undefined,true),
    step('philosophy','Describe your coaching philosophy.','textarea',undefined,true),
    step('referralSource','Last one: how did you hear about Coaches Hive?','single',REFERRALS,true),
  ],
  org_director: [
    step('orgName',"What's your organization's name?",'text'),
    step('sports','What sport(s) does your organization cover?','multi',SPORTS),
    step('ageGroups','What age groups do you serve?','multi',AGE_GROUPS.slice(0,5)),
    step('levels','What competition levels?','multi',LEVELS),
    step('programs','What programs do you offer?','tags',undefined,true),
    step('location','Where is your organization located?','text'),
    step('alsoCoach','Will you also coach within this organization?','single',['Yes','No']),
    step('serviceArea',"What's your service or travel area?",'text',undefined,true),
    step('about','Tell athletes and coaches about your organization.','textarea',undefined,true),
    step('facilities','List your facilities or practice locations.','tags',undefined,true),
    step('seasonStart','When does your season start?','date',undefined,true),
    step('seasonEnd','When does it end?','date',undefined,true),
    step('registration',"What's your current registration status?",'single',['Open','Waitlist','Closed']),
    step('pricing','Describe your pricing.','textarea',undefined,true),
    step('email',"What's your public contact email?",'text',undefined,true),
    step('phone','Public phone number?','text',undefined,true),
    step('website','Do you have a website?','text',undefined,true),
    step('achievements','Any notable achievements or affiliations?','tags',undefined,true),
    step('referralSource','Last one: how did you hear about Coaches Hive?','single',REFERRALS,true),
  ],
  athlete: [
    step('name',"Welcome! What's your full name?",'text'),
    step('sport','What sport do you play?','single',SPORTS),
    step('grade','What grade are you in?','single',GRADES),
    step('contactName','Who should we contact in an emergency?','text',undefined,true),
    step('contactRel',"What's their relationship to you?",'single',['Parent','Sibling','Spouse','Friend','Other'],true),
    step('contactPhone','Best phone number to reach them?','text',undefined,true),
    step('referralSource','Last one: how did you hear about Coaches Hive?','single',REFERRALS,true),
  ],
}

export const PRE_PAYWALL_STEP_IDS: Record<OnboardingRole, string[]> = {
  athlete: [],
  solo_coach: ['sport','experience','ageGroups','modality'],
  org_director: ['orgName','sports','ageGroups','location','alsoCoach'],
  org_coach: [],
}

export const onboardingPathForRole = (role: OnboardingRole) =>
  role === 'org_director' ? '/org/onboarding' : role === 'athlete' ? '/athlete/onboarding' : '/coach/onboarding'

