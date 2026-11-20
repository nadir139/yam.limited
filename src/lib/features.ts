// Which asset kinds the app offers right now.
//
// Buildings (migrations 043-044) and aircraft (045) are built and stay in the
// database, but for now the product is shown as boats only. Hiding is done in
// the client: projects on other assets are left out of the project list, and
// their project types are not offered when starting a project. Nothing is
// deleted, so turning the flag back on restores them as they were.
//
// To show them again, set VITE_SHOW_ALL_ASSET_KINDS=true in the Vercel project
// (or .env.local) and redeploy.

import { assetKindOf, kindForProjectType, type AssetKind } from './asset'
import type { ProjectType } from './types'

export const SHOW_ALL_ASSET_KINDS = import.meta.env.VITE_SHOW_ALL_ASSET_KINDS === 'true'

/** Asset kinds a user can see and start projects on. */
export const ENABLED_ASSET_KINDS: ReadonlySet<AssetKind> = new Set(
  SHOW_ALL_ASSET_KINDS ? ['VESSEL', 'BUILDING', 'AIRCRAFT'] : ['VESSEL'],
)

/** Whether a project is on an asset kind that is currently shown. */
export const projectIsShown = (p: Parameters<typeof assetKindOf>[0]) => ENABLED_ASSET_KINDS.has(assetKindOf(p))

/** Whether a project type may be offered when starting a project. */
export const projectTypeIsShown = (t: ProjectType) => ENABLED_ASSET_KINDS.has(kindForProjectType(t))

// The Revolut Business API connection (migration 041) is frozen with the
// other non-core work (ROADMAP, Nov 2026): CSV statement import stays, the
// "Connect Revolut" card is hidden. An account that is already connected
// keeps its card so it can still be synced or disconnected.
// To offer it again: VITE_SHOW_REVOLUT_API=true in Vercel, redeploy.
export const SHOW_REVOLUT_API = import.meta.env.VITE_SHOW_REVOLUT_API === 'true'
