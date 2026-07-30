import { defineConfig } from "vite";
import { execSync } from "node:child_process";

// Auto-incrementing build number for ui/MainMenu.ts's title header -- the
// total git commit count, not a manually-maintained counter, so it's always
// correct after any new commit with zero action needed. Falls back to "?"
// (never a hard build failure) if git itself isn't available at build time
// -- e.g. a build running from a source archive with no .git directory.
function getBuildNumber(): string {
  try {
    return execSync("git rev-list --count HEAD").toString().trim();
  } catch {
    return "?";
  }
}

export default defineConfig({
  define: {
    __BUILD_NUMBER__: JSON.stringify(getBuildNumber()),
  },
});
