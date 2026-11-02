try {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") {
        document.documentElement.dataset.theme = stored;
    }
} catch {
    // localStorage unavailable, fall back to system theme
}
