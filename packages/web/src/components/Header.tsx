import { A, useNavigate } from "@solidjs/router";
import { Show } from "solid-js";
import { branding } from "~/lib/branding";
import { logout, user } from "~/lib/session";
import { LogOutIcon, MusicIcon, UserIcon } from "./Icons";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
    const navigate = useNavigate();

    async function handleLogout() {
        await logout();
        navigate("/login", { replace: true });
    }

    return (
        <header class="header">
            <div class="header-inner">
                <A href="/" class="brand">
                    <Show when={branding().logo} fallback={<span class="brand-mark"><MusicIcon size={16} /></span>}>
                        {(logo) => <img class="brand-logo" src={logo()} alt={branding().logoOnly ? branding().siteName : ""} />}
                    </Show>
                    <Show when={!(branding().logo && branding().logoOnly)}>
                        <span class="brand-name">{branding().siteName}</span>
                    </Show>
                </A>
                <Show when={user()?.isAdmin}>
                    <A href="/admin/users" class="nav-link" activeClass="active">Users</A>
                    <A href="/admin/settings" class="nav-link" activeClass="active">Settings</A>
                </Show>
                <ThemeToggle />
                <Show when={user()}>
                    {(currentUser) => (
                        <>
                            <A href="/account" class="icon-button" title={`Account (${currentUser().username})`} aria-label="Account">
                                <UserIcon />
                            </A>
                            <button class="icon-button" type="button" onClick={handleLogout} title="Log out" aria-label="Log out">
                                <LogOutIcon />
                            </button>
                        </>
                    )}
                </Show>
            </div>
        </header>
    );
}
