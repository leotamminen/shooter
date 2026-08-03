// The one place the game's display name lives. Everywhere the name shows
// up -- the browser tab title (main.ts), the main menu heading and its
// decorative shell-prompt line (ui/MainMenu.ts), the credits screen
// (ui/CreditsScreen.ts) -- imports this constant instead of hardcoding the
// string a second time, so a future rename only ever requires editing this
// one line. package.json's own "name" field is a separate, lowercase/
// hyphenated npm-convention string and is NOT derived from this constant
// (TS content can't be imported into JSON) -- keep it in sync by hand if
// this ever changes again.
export const GAME_NAME = "NIGHTFALL";
