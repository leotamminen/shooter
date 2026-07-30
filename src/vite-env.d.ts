/// <reference types="vite/client" />

// Injected at build time by vite.config.ts's `define` -- the total git
// commit count (`git rev-list --count HEAD`), used as the auto-incrementing
// build-number suffix in ui/MainMenu.ts's title header. Falls back to "?"
// if git itself isn't available at build time.
declare const __BUILD_NUMBER__: string;
