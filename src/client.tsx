import { startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { hydrateStart } from '@tanstack/react-start/client'

hydrateStart().then((router) => {
  startTransition(() => {
    hydrateRoot(document, <RouterProvider router={router} />)
  })
})
