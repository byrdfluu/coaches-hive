export const EXERCISE_MODALITIES = [
  'Strength',
  'Conditioning',
  'Mobility',
  'Speed & Power',
  'Endurance',
  'Recovery',
  'Sport-Specific',
  'Plyometrics',
  'Balance & Stability',
] as const

export const EXERCISE_MUSCLE_GROUPS = [
  'Full Body',
  'Upper Body',
  'Lower Body',
  'Core',
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Glutes',
  'Hamstrings',
  'Quads',
  'Calves',
  'Hip Flexors',
] as const

export const EXERCISE_MOVEMENT_PATTERNS = [
  'Push',
  'Pull',
  'Hinge',
  'Squat',
  'Lunge',
  'Carry',
  'Rotation',
  'Anti-Rotation',
  'Gait / Sprint',
  'Jump / Land',
  'Core Bracing',
] as const

export const EXERCISE_CATEGORIES = [
  'Barbell',
  'Dumbbell',
  'Kettlebell',
  'Bodyweight',
  'Machine',
  'Cable',
  'Band / Resistance',
  'Medicine Ball',
  'Sled / Prowler',
  'Cardio',
  'Agility / Drill',
  'Stretch / Mobility',
] as const

export const EXERCISE_TRACKING_FIELD_TYPES = [
  'Reps',
  'Weight',
  'Duration',
  'Distance',
  'RPE',
  'Rest',
  'Speed',
  'Calories',
  'Height',
  'Notes',
] as const

export type ExerciseModality = typeof EXERCISE_MODALITIES[number]
export type ExerciseMuscleGroup = typeof EXERCISE_MUSCLE_GROUPS[number]
export type ExerciseMovementPattern = typeof EXERCISE_MOVEMENT_PATTERNS[number]
export type ExerciseCategory = typeof EXERCISE_CATEGORIES[number]
export type ExerciseTrackingField = typeof EXERCISE_TRACKING_FIELD_TYPES[number]

export const getYouTubeEmbedUrl = (url: string): string | null => {
  if (!url) return null
  try {
    const parsed = new URL(url)
    let videoId: string | null = null
    if (parsed.hostname.includes('youtube.com')) {
      videoId = parsed.searchParams.get('v')
    } else if (parsed.hostname === 'youtu.be') {
      videoId = parsed.pathname.replace('/', '')
    }
    if (!videoId) return null
    return `https://www.youtube.com/embed/${videoId}`
  } catch {
    return null
  }
}
