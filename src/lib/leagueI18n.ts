export type LeagueLocale = 'en' | 'es'

const messages = {
  en: {
    title: 'League workspace', registration: 'Registration', schedule: 'Schedule', payments: 'Payments',
    eligibility: 'Eligibility', documents: 'Waivers & documents', standings: 'Standings & brackets',
    messages: 'Announcements', selectCompetition: 'Select a competition', selectTeam: 'Select a team',
    register: 'Submit registration', freeAgent: 'Free agent', individual: 'Individual', team: 'Team',
    discount: 'Discount or scholarship code', apply: 'Apply', retry: 'Retry', loading: 'Loading league activity…',
    empty: 'No league activity is available for this profile or workspace yet.', balance: 'Outstanding balance',
  },
  es: {
    title: 'Espacio de liga', registration: 'Inscripción', schedule: 'Calendario', payments: 'Pagos',
    eligibility: 'Elegibilidad', documents: 'Exenciones y documentos', standings: 'Clasificación y cuadros',
    messages: 'Anuncios', selectCompetition: 'Selecciona una competencia', selectTeam: 'Selecciona un equipo',
    register: 'Enviar inscripción', freeAgent: 'Agente libre', individual: 'Individual', team: 'Equipo',
    discount: 'Código de descuento o beca', apply: 'Aplicar', retry: 'Reintentar', loading: 'Cargando actividad de liga…',
    empty: 'Todavía no hay actividad de liga disponible para este perfil o espacio.', balance: 'Saldo pendiente',
  },
} as const

export const leagueMessages = (locale: LeagueLocale) => messages[locale]
