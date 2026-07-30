// Shared color/style constants for the terminal-styled menu system
// (MainMenu.ts, ControlsSettingsMenu.ts, CreditsScreen.ts, PauseMenu.ts,
// NavigableMenu.ts) -- reuses ui/Terminal.ts's own established green-on-black
// palette (panel background, border, text color) so these screens read as
// visually consistent with the in-game terminal overlays, per this task's
// own explicit "consistency with the in-game terminals is the point" goal.
// Defined once here rather than duplicated as local constants in every one
// of those files, since all five need the identical palette.
export const TERMINAL_PANEL_BACKGROUND = "rgba(10, 14, 10, 0.97)";
export const TERMINAL_BORDER = "#2a5c2a";
export const TERMINAL_TEXT = "#7CFC7C";
export const TERMINAL_DIM_TEXT = "#4a8c4a";
export const TERMINAL_BACKDROP = "rgba(0, 0, 0, 0.6)";

// Solid (non-transparent) near-black background for full-page screens
// (MainMenu, PauseMenu) that sit behind/over the 3D scene rather than
// floating as a small panel above it -- TERMINAL_PANEL_BACKGROUND's alpha
// is meaningful for Terminal.ts's own in-world overlay, not appropriate
// here where nothing should show through.
export const TERMINAL_MENU_BACKGROUND = "#080c08";
