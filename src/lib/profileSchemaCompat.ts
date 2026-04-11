const getMissingProfilesColumn = (message?: string | null) => {
  const value = String(message || '')
  const schemaCacheMatch = value.match(/could not find the '([^']+)' column of 'profiles' in the schema cache/i)
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1]

  const postgresMatch =
    value.match(/column\s+["']?profiles["']?\.["']?([a-z_]+)["']?\s+does not exist/i)
    || value.match(/column\s+["']?([a-z_]+)["']?\s+of relation\s+["']?profiles["']?\s+does not exist/i)
  return postgresMatch?.[1] || null
}

const uniqueColumns = (columns: string[]) => Array.from(new Set(columns.map((column) => column.trim()).filter(Boolean)))

export const selectProfileCompat = async ({
  supabase,
  userId,
  columns,
}: {
  supabase: any
  userId: string
  columns: string[]
}) => {
  let remainingColumns = uniqueColumns(columns)
  let lastResult: any = { data: null, error: null }
  const removedColumns: string[] = []

  for (let attempt = 0; attempt < Math.max(1, columns.length + 1); attempt += 1) {
    const selectClause = (remainingColumns.length ? remainingColumns : ['id']).join(', ')
    const result = await supabase.from('profiles').select(selectClause).eq('id', userId).maybeSingle()
    lastResult = { ...result, removedColumns: [...removedColumns] }

    const missingColumn = getMissingProfilesColumn(result.error?.message)
    if (!result.error || !missingColumn) {
      return { ...result, removedColumns: [...removedColumns] }
    }

    removedColumns.push(missingColumn)
    remainingColumns = remainingColumns.filter((column) => column !== missingColumn)
  }

  return { ...lastResult, removedColumns: [...removedColumns] }
}

export const upsertProfileCompat = async ({
  supabase,
  payload,
}: {
  supabase: any
  payload: Record<string, unknown>
}) => {
  const fallbackPayload: Record<string, unknown> = { ...payload }
  let lastResult: any = { data: null, error: null }
  const removedColumns: string[] = []

  for (let attempt = 0; attempt < Math.max(1, Object.keys(payload).length + 1); attempt += 1) {
    const result = await supabase.from('profiles').upsert(fallbackPayload)
    lastResult = { ...result, removedColumns: [...removedColumns] }

    const missingColumn = getMissingProfilesColumn(result.error?.message)
    if (!result.error || !missingColumn) {
      return { ...result, removedColumns: [...removedColumns] }
    }

    removedColumns.push(missingColumn)
    delete fallbackPayload[missingColumn]
  }

  return { ...lastResult, removedColumns: [...removedColumns] }
}

export const updateProfileCompat = async ({
  supabase,
  userId,
  payload,
}: {
  supabase: any
  userId: string
  payload: Record<string, unknown>
}) => {
  const fallbackPayload: Record<string, unknown> = { ...payload }
  let lastResult: any = { data: null, error: null }
  const removedColumns: string[] = []

  for (let attempt = 0; attempt < Math.max(1, Object.keys(payload).length + 1); attempt += 1) {
    const result = await supabase.from('profiles').update(fallbackPayload).eq('id', userId)
    lastResult = { ...result, removedColumns: [...removedColumns] }

    const missingColumn = getMissingProfilesColumn(result.error?.message)
    if (!result.error || !missingColumn) {
      return { ...result, removedColumns: [...removedColumns] }
    }

    removedColumns.push(missingColumn)
    delete fallbackPayload[missingColumn]
  }

  return { ...lastResult, removedColumns: [...removedColumns] }
}
