import { createSignal } from "solid-js";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "theme";
const ORDER: ThemePreference[] = ["system", "light", "dark"];

function readPreference(): ThemePreference {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
}

const [theme, setThemeSignal] = createSignal<ThemePreference>(readPreference());

export { theme };

export function cycleTheme(): void {
    const next = ORDER[(ORDER.indexOf(theme()) + 1) % ORDER.length];
    if (next === "system") {
        localStorage.removeItem(STORAGE_KEY);
        delete document.documentElement.dataset.theme;
    } else {
        localStorage.setItem(STORAGE_KEY, next);
        document.documentElement.dataset.theme = next;
    }
    setThemeSignal(next);
}
