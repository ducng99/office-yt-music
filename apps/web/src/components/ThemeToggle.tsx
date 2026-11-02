import { Match, Switch } from "solid-js";
import { cycleTheme, theme } from "~/lib/theme";
import { MonitorIcon, MoonIcon, SunIcon } from "./Icons";

const LABELS = { system: "Theme: system", light: "Theme: light", dark: "Theme: dark" };

export default function ThemeToggle() {
    return (
        <button class="icon-button" type="button" onClick={cycleTheme} title={LABELS[theme()]} aria-label={LABELS[theme()]}>
            <Switch>
                <Match when={theme() === "system"}><MonitorIcon /></Match>
                <Match when={theme() === "light"}><SunIcon /></Match>
                <Match when={theme() === "dark"}><MoonIcon /></Match>
            </Switch>
        </button>
    );
}
