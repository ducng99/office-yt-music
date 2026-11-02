const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function extractVideoId(input: string): string | null {
    const trimmed = input.trim();
    if (VIDEO_ID_PATTERN.test(trimmed)) {
        return trimmed;
    }

    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    let url: URL;
    try {
        url = new URL(withProtocol);
    } catch {
        return null;
    }

    const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
    let candidate: string | null = null;

    if (host === "youtu.be") {
        candidate = url.pathname.slice(1).split("/")[0] ?? null;
    } else if (host === "youtube.com" || host === "music.youtube.com") {
        candidate = url.searchParams.get("v");
        if (!candidate) {
            const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/);
            candidate = match ? match[1] : null;
        }
    }

    if (candidate && VIDEO_ID_PATTERN.test(candidate)) {
        return candidate;
    }
    return null;
}

export function isUrlLike(input: string): boolean {
    return /^https?:\/\//i.test(input.trim()) || /^(www\.|m\.)?(music\.)?youtu(\.be|be\.com)\//i.test(input.trim());
}
