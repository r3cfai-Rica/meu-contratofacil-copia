---
name: TanStack Start SSR useId hydration fix
description: Why Radix UI components cause React 19 hydration errors in TanStack Start v1.x and how to fix them.
---

# TanStack Start + React 19: Radix UI useId hydration mismatch

## The Rule
Any Radix UI component that uses `@radix-ui/react-id` (DropdownMenu, Dialog, Select, Popover, etc.) will cause hydration errors in TanStack Start v1.x + React 19 unless wrapped in a `mounted` guard.

**Why:** `@radix-ui/react-id` initializes `useState(React.useId())`. React's `useId()` generates values based on fiber tree depth. The server renders with `StartServer` as root (depth N), but the client renders with `StrictMode → StartClient → Await → RouterProvider` (depth N+3). Different depth → different `useId` → different `id` attribute → hydration mismatch → "Hydration failed" + "Invalid hook call" (React 19's diagnostic re-render).

**How to apply:** For every Radix UI component rendered in a persistent layout (Navbar, Sidebar, AppShell), wrap it in a `mounted` guard:
```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => { setMounted(true); }, []);
if (!mounted) return <div style={{ height: '2rem', width: '3.5rem' }} aria-hidden />;
// render Radix UI component
```
Server and client initial render both produce the placeholder div → hydration succeeds. After mount, the real component renders.

Also apply this pattern to Sonner's `<Toaster />` — it also has state hooks that can mismatch.

## Files fixed in this app
- `src/components/LanguageSwitcher.tsx` — DropdownMenu with mounted guard
- `src/components/ui/sonner.tsx` — Toaster with mounted guard
