import { Show, createSignal } from "solid-js";
import { api, errorMessage } from "~/lib/api";
import { user } from "~/lib/session";

export default function Account() {
    const [currentPassword, setCurrentPassword] = createSignal("");
    const [newPassword, setNewPassword] = createSignal("");
    const [confirmPassword, setConfirmPassword] = createSignal("");
    const [error, setError] = createSignal("");
    const [success, setSuccess] = createSignal("");
    const [busy, setBusy] = createSignal(false);

    async function submit(event: SubmitEvent) {
        event.preventDefault();
        setError("");
        setSuccess("");
        if (newPassword() !== confirmPassword()) {
            setError("New passwords don't match");
            return;
        }

        setBusy(true);
        try {
            await api("/api/me/password", "POST", { currentPassword: currentPassword(), newPassword: newPassword() });
            setSuccess("Password changed. Other devices have been signed out.");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (caught) {
            setError(errorMessage(caught));
        } finally {
            setBusy(false);
        }
    }

    return (
        <main class="container">
            <h1 class="page-title">Account</h1>
            <form class="card stack" onSubmit={submit}>
                <p class="muted" style={{ margin: 0 }}>Signed in as <strong>{user()?.username}</strong></p>
                <div class="field">
                    <label for="current">Current password</label>
                    <input id="current" class="input" type="password" autocomplete="current-password" value={currentPassword()} onInput={(event) => setCurrentPassword(event.currentTarget.value)} required />
                </div>
                <div class="field">
                    <label for="new">New password</label>
                    <input id="new" class="input" type="password" autocomplete="new-password" minLength={6} value={newPassword()} onInput={(event) => setNewPassword(event.currentTarget.value)} required />
                </div>
                <div class="field">
                    <label for="confirm">Confirm new password</label>
                    <input id="confirm" class="input" type="password" autocomplete="new-password" minLength={6} value={confirmPassword()} onInput={(event) => setConfirmPassword(event.currentTarget.value)} required />
                </div>
                <Show when={error()}>
                    <div class="notice error">{error()}</div>
                </Show>
                <Show when={success()}>
                    <div class="notice success">{success()}</div>
                </Show>
                <div>
                    <button class="button primary" type="submit" disabled={busy()}>Change password</button>
                </div>
            </form>
        </main>
    );
}
