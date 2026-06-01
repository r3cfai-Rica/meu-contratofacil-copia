import { startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { hydrateStart } from '@tanstack/react-start/client'
import { getRouter } from './router'

hydrateStart(getRouter()).then((router) => {
  startTransition(() => {
    hydrateRoot(document, <RouterProvider router={router} />)
  })
})
