import fs from 'node:fs'
import path from 'node:path'

const ignored = new Set(['node_modules', '.git', '.next', 'DerivedData', 'Pods', 'build'])
const walk = (root, extensions) => fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
  if (ignored.has(entry.name)) return []
  const item = path.join(root, entry.name)
  if (entry.isDirectory()) return walk(item, extensions)
  return extensions.some((extension) => item.endsWith(extension)) ? [item] : []
})

const collect = (files, patterns) => {
  const results = new Map()
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    for (const [kind, pattern] of patterns) {
      for (const match of source.matchAll(pattern)) {
        const name = match[1]
        if (!name || (kind !== 'api' && !/^[a-zA-Z0-9_.-]+$/.test(name))) continue
        const key = `${kind}:${name}`
        if (!results.has(key)) results.set(key, new Set())
        results.get(key).add(file)
      }
    }
  }
  return results
}

const names = (results, kind) => [...results.keys()]
  .filter((key) => key.startsWith(`${kind}:`))
  .map((key) => key.slice(kind.length + 1))
  .sort()
const only = (left, right) => left.filter((name) => !right.includes(name))

const webFiles = walk(path.resolve('src'), ['.ts', '.tsx'])
const iosRoot = process.env.IOS_REPOSITORY || '/Users/juwan/Desktop/CH App/CH App'
const iosFiles = walk(iosRoot, ['.swift'])
const web = collect(webFiles, [
  ['table', /\.from\(\s*['"`]([^'"`]+)['"`]\s*\)/g],
  ['rpc', /\.rpc\(\s*['"`]([^'"`]+)['"`]/g],
])
const ios = collect(iosFiles, [
  ['table', /\.from\(\s*"([^"]+)"\s*\)/g],
  ['rpc', /\.rpc\(\s*"([^"]+)"/g],
  ['api', /(?:path|endpoint):\s*"([^"]*api\/[^"?]+)/g],
])

const webRouteRoot = path.resolve('src/app')
const webApiRoutes = walk(webRouteRoot, ['route.ts'])
  .filter((file) => file.includes(`${path.sep}api${path.sep}`))
  .map((file) => `/${path.relative(webRouteRoot, path.dirname(file)).split(path.sep).join('/')}`)
  .sort()
const routePattern = (route) => new RegExp(`^${route
  .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  .replace(/\\\[\\\.\\\.\\\.[^\]]+\\\]/g, '.+')
  .replace(/\\\[[^\]]+\\\]/g, '[^/]+')}$`)
const normalizeIosApiPath = (apiPath) => `/${apiPath.replace(/^\/+/, '').replace(/\\\([^)]*\)/g, 'value')}`

const webTables = names(web, 'table')
const iosTables = names(ios, 'table')
const webRpcs = names(web, 'rpc')
const iosRpcs = names(ios, 'rpc')
const iosApiPaths = names(ios, 'api')
const missingIosApiRoutes = iosApiPaths
  .map(normalizeIosApiPath)
  .filter((apiPath) => !webApiRoutes.some((route) => routePattern(route).test(apiPath)))
const report = {
  generatedAt: new Date().toISOString(),
  counts: {
    webFiles: webFiles.length,
    iosFiles: iosFiles.length,
    webTables: webTables.length,
    iosTables: iosTables.length,
    sharedTables: webTables.filter((name) => iosTables.includes(name)).length,
    webRpcs: webRpcs.length,
    iosRpcs: iosRpcs.length,
    sharedRpcs: webRpcs.filter((name) => iosRpcs.includes(name)).length,
    webApiRoutes: webApiRoutes.length,
    iosApiPaths: iosApiPaths.length,
    missingIosApiRoutes: missingIosApiRoutes.length,
  },
  sharedTables: webTables.filter((name) => iosTables.includes(name)),
  webOnlyTables: only(webTables, iosTables),
  iosOnlyTables: only(iosTables, webTables),
  sharedRpcs: webRpcs.filter((name) => iosRpcs.includes(name)),
  webOnlyRpcs: only(webRpcs, iosRpcs),
  iosOnlyRpcs: only(iosRpcs, webRpcs),
  webApiRoutes,
  iosApiPaths,
  missingIosApiRoutes,
}

const output = process.argv[2]
if (output) fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
else console.log(JSON.stringify(report, null, 2))
if (missingIosApiRoutes.length > 0) {
  console.error(`Missing web routes for ${missingIosApiRoutes.length} iOS API path(s).`)
  process.exitCode = 1
}
