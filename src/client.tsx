import { startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { hydrateStart } from '@tanstack/react-start/client'

// Capture the full stack trace for "Invalid hook call" so we can identify the source
const _origConsoleError = console.error.bind(console)
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith('Invalid hook call')) {
    const trace = new Error('[HOOK-TRACE]').stack ?? 'no-stack'
    console.debug('HOOK_CALL_STACK:', trace)
  }
  _origConsoleError(...args)
}

hydrateStart().then((router) => {
  startTransition(() => {
    hydrateRoot(document, <RouterProvider router={router} />)
  })
})
