import { createEffect, createSignal } from "solid-js";
import type { Branding } from "@office-music/shared";
import { api } from "./api";

const [branding, setBranding] = createSignal<Branding>({ siteName: "Office Music", logo: null, logoOnly: false });

export { branding, setBranding };

export async function loadBranding(): Promise<void> {
    try {
        setBranding(await api<Branding>("/api/branding"));
    } catch (error) {
        console.error(error);
    }
}

export function syncDocumentBranding(): void {
    createEffect(() => {
        document.title = branding().siteName;
        const link = document.querySelector<HTMLLinkElement>("link[rel=icon]");
        const logo = branding().logo;
        if (link && logo) {
            link.removeAttribute("type");
            link.href = logo;
        }
    });
}
