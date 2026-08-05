// Runs after every build, on every host.
//
// On 1 August the live site was a white page for hours while every deploy
// reported success. The built index.html was fine; what was being served was
// the repository's *source* index.html, which points at /src/main.tsx. The
// browser refuses that with "Expected a JavaScript-or-Wasm module script but
// the server responded with a MIME type of application/octet-stream" and
// renders nothing.
//
// Two guards came out of that, and both were steps in the GitHub Actions
// workflow — which is being retired. They belong to the build, not to a CI
// provider, so they live here now and run wherever the build runs.
//
// This one checks the artifact. The other half of the pair — "is the thing we
// just published actually what the domain serves?" — cannot be answered from
// inside the build, and is now Vercel's job: an atomic deployment either
// becomes the production alias or it does not.

import { readFileSync, existsSync } from 'node:fs'

const INDEX = 'dist/index.html'

const fail = (message) => {
  console.error('')
  console.error('  ✗ ' + message)
  console.error('')
  process.exit(1)
}

if (!existsSync(INDEX)) fail(`${INDEX} does not exist. The build produced nothing.`)

const html = readFileSync(INDEX, 'utf8')

if (html.includes('/src/main.tsx')) {
  fail(
    'dist/index.html still references /src/main.tsx — the dev entry point.\n' +
      '    This is the source file, not a build. Serving it is a white page.',
  )
}

if (!/assets\/index-[\w-]+\.js/.test(html)) {
  fail(
    'dist/index.html has no hashed bundle reference.\n' +
      '    Expected something matching assets/index-<hash>.js',
  )
}

// The static SEO surface. These are plain files in public/, so the only way
// they go missing is somebody deleting them — but they are also the only thing
// about YAM that a crawler which does not run JavaScript can read, so their
// absence should not be a silent one.
for (const file of ['dist/robots.txt', 'dist/sitemap.xml', 'dist/llms.txt']) {
  if (!existsSync(file)) fail(`${file} is missing from the build output.`)
}

if (!readFileSync(INDEX, 'utf8').includes('application/ld+json')) {
  fail('dist/index.html has no JSON-LD block. Structured data was dropped.')
}

console.log('  ✓ Build output verified: hashed bundle, robots, sitemap, llms.txt, JSON-LD.')
