# Repo Area Classification

This file records the duplicate and stale folders that were reviewed during remediation so there is one obvious source of truth.

## Source Of Truth

- `chmain/CHMain/`: active maintained Next.js application. This is the repo that owns the current app, middleware, API routes, Supabase integration, and Playwright suite.
- `chmain/package.json`: wrapper manifest that proxies `dev`, `build`, `start`, and `lint` into `CHMain`.
- `/Users/juwan/Desktop/Main CH Code/package.json`: outer workspace wrapper that proxies into `chmain`.

## Removed Duplicate Areas

- `coachhive/`: removed. This was an archival static prototype containing only `index.html`, `styles.css`, and `app.js`.
- `CoachesHive/Figma/`: removed. This was an archival design-export and prototype tree containing multiple duplicate app exports and zip archives.
- `/Users/juwan/Desktop/Main CH Code/src`: removed. This was a partial duplicate API tree outside the maintained app.

## Remaining Handling

- Keep `chmain/CHMain/` as the only active engineering surface.
- Do not reintroduce product or security changes outside the maintained app tree.
- The parent `CoachesHive/` folder still contains non-app business documents. It is not an application source tree.
