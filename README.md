# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Deployment

**https://yam.limited is served by GitHub Pages**, built and published by
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) on every push to
`main` (or a manual `workflow_dispatch`). Nothing else deploys this site — the
Lovable "Share → Publish" flow is not in use.

- Custom domain: the `CNAME` file (`yam.limited`) is copied into `dist/` by the
  workflow. `.nojekyll` stops Pages from running Jekyll over the build output.
- `vercel.json` is **not** part of the live deployment. It only supplies SPA
  rewrites should the project ever be previewed on Vercel; the production
  domain is Pages.

### Required repository secrets

Vite inlines `VITE_*` variables **at build time**, so they must exist in CI —
a local `.env` has no effect on the deployed bundle. Set both under
*Settings → Secrets and variables → Actions*:

| Secret | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the project's anon/publishable key |

The `anon` key is safe to expose in a client bundle — it is protected by
row-level security, not secrecy.

If they are absent the build still succeeds and the public marketing pages
render normally, but every `/app/*` route will fail to load data and the
workflow emits a warning. See `src/lib/supabase.ts` (`isSupabaseConfigured`).

### Client-side routing on Pages

GitHub Pages has no server-side SPA rewrite: it returns `public/404.html` for
any path that isn't a real file. That page stashes the requested path in
`?redirect=` and bounces to `/`, where an inline script in `index.html`
restores it via `history.replaceState` before the router boots. Both halves are
required — dropping either one silently sends every deep link (including the
magic-link `/auth/callback`) to the homepage.

## Local development

```sh
npm ci
cp .env.example .env   # fill in your Supabase URL + anon key
npm run dev            # http://localhost:8080
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | production build into `dist/` |
| `npm run typecheck` | `tsc -p tsconfig.app.json --noEmit` |
| `npm run lint` | ESLint |

> Use `npm run typecheck`, not a bare `tsc --noEmit`. The root `tsconfig.json`
> is a solution file (`"files": []` + project references), so `tsc --noEmit`
> checks nothing and always exits 0.
