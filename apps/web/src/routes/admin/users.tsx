import { For, Show, createResource, createSignal } from "solid-js";
import type { AdminUser } from "@office-music/shared";
import { api, errorMessage } from "~/lib/api";
import { user } from "~/lib/session";

export default function AdminUsers() {
    const [users, { refetch }] = createResource(() => user()?.isAdmin, () => api<AdminUser[]>("/api/admin/users"));
    const [username, setUsername] = createSignal("");
    const [password, setPassword] = createSignal("");
    const [isAdmin, setIsAdmin] = createSignal(false);
    const [error, setError] = createSignal("");
    const [success, setSuccess] = createSignal("");

    async function run(action: () => Promise<unknown>, message: string): Promise<boolean> {
        setError("");
        setSuccess("");
        try {
            await action();
            setSuccess(message);
            await refetch();
            return true;
        } catch (caught) {
            setError(errorMessage(caught));
            return false;
        }
    }

    async function create(event: SubmitEvent) {
        event.preventDefault();
        const name = username().trim();
        const body = { username: name, password: password(), isAdmin: isAdmin() };
        const created = await run(() => api("/api/admin/users", "POST", body), `Created ${name}`);
        if (created) {
            setUsername("");
            setPassword("");
            setIsAdmin(false);
        }
    }

    function resetPassword(target: AdminUser) {
        const newPassword = prompt(`New password for ${target.username} (min 6 characters):`);
        if (newPassword) {
            run(() => api(`/api/admin/users/${target.id}`, "PATCH", { password: newPassword }), `Password reset for ${target.username}`);
        }
    }

    function toggleAdmin(target: AdminUser) {
        run(() => api(`/api/admin/users/${target.id}`, "PATCH", { isAdmin: !target.isAdmin }), `Updated ${target.username}`);
    }

    function toggleDisabled(target: AdminUser) {
        run(() => api(`/api/admin/users/${target.id}`, "PATCH", { disabled: !target.disabled }), `${target.disabled ? "Enabled" : "Disabled"} ${target.username}`);
    }

    function remove(target: AdminUser) {
        if (confirm(`Delete ${target.username}? Their votes and queued songs are removed too.`)) {
            run(() => api(`/api/admin/users/${target.id}`, "DELETE"), `Deleted ${target.username}`);
        }
    }

    return (
        <main class="container wide stack">
            <h1 class="page-title" style={{ margin: 0 }}>Users</h1>

            <form class="card stack" onSubmit={create}>
                <h2 class="card-title" style={{ margin: 0 }}>Add a user</h2>
                <div class="row" style={{ "flex-wrap": "wrap" }}>
                    <input class="input grow" placeholder="Username" value={username()} onInput={(event) => setUsername(event.currentTarget.value)} required style={{ "min-width": "160px" }} />
                    <input class="input grow" type="password" placeholder="Password" autocomplete="new-password" minLength={6} value={password()} onInput={(event) => setPassword(event.currentTarget.value)} required style={{ "min-width": "160px" }} />
                    <label class="checkbox">
                        <input type="checkbox" checked={isAdmin()} onChange={(event) => setIsAdmin(event.currentTarget.checked)} />
                        Admin
                    </label>
                    <button class="button primary" type="submit">Add user</button>
                </div>
            </form>

            <Show when={error()}>
                <div class="notice error">{error()}</div>
            </Show>
            <Show when={success()}>
                <div class="notice success">{success()}</div>
            </Show>

            <section class="card table-scroll">
                <Show when={users()} fallback={<div class="empty">Loading users...</div>}>
                    {(list) => (
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Username</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                <For each={list()}>
                                    {(target) => {
                                        const isSelf = () => target.id === user()?.id;
                                        return (
                                            <tr>
                                                <td>
                                                    {target.username}
                                                    <Show when={isSelf()}> <span class="muted">(you)</span></Show>
                                                </td>
                                                <td>
                                                    <span class="badge" classList={{ neutral: !target.isAdmin }}>{target.isAdmin ? "Admin" : "Member"}</span>
                                                </td>
                                                <td>
                                                    <span class="row">
                                                        <span class="status-dot" classList={{ online: !target.disabled, offline: target.disabled }} />
                                                        {target.disabled ? "Disabled" : "Active"}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div class="table-actions">
                                                        <button class="button small" type="button" onClick={() => resetPassword(target)}>Reset password</button>
                                                        <Show when={!isSelf()}>
                                                            <button class="button small" type="button" onClick={() => toggleAdmin(target)}>
                                                                {target.isAdmin ? "Remove admin" : "Make admin"}
                                                            </button>
                                                            <button class="button small" type="button" onClick={() => toggleDisabled(target)}>
                                                                {target.disabled ? "Enable" : "Disable"}
                                                            </button>
                                                            <button class="button small danger" type="button" onClick={() => remove(target)}>Delete</button>
                                                        </Show>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }}
                                </For>
                            </tbody>
                        </table>
                    )}
                </Show>
            </section>
        </main>
    );
}
