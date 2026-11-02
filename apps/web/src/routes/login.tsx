import { useNavigate } from "@solidjs/router";
import { Show, createSignal } from "solid-js";
import { MusicIcon } from "~/components/Icons";
import { errorMessage } from "~/lib/api";
import { login } from "~/lib/session";

export default function Login() {
    const navigate = useNavigate();
    const [username, setUsername] = createSignal("");
    const [password, setPassword] = createSignal("");
    const [error, setError] = createSignal("");
    const [busy, setBusy] = createSignal(false);

    async function submit(event: SubmitEvent) {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
            await login(username(), password());
            navigate("/", { replace: true });
        } catch (caught) {
            setError(errorMessage(caught));
        } finally {
            setBusy(false);
        }
    }

    return (
        <main class="container login">
            <form class="card stack" onSubmit={submit}>
                <span class="brand-mark" style={{ width: "40px", height: "40px" }}><MusicIcon size={20} /></span>
                <div>
                    <h1>Sign in</h1>
                    <p class="muted" style={{ margin: 0 }}>See what's playing and pick what's next.</p>
                </div>
                <div class="field">
                    <label for="username">Username</label>
                    <input
                        id="username"
                        class="input"
                        autocomplete="username"
                        value={username()}
                        onInput={(event) => setUsername(event.currentTarget.value)}
                        required
                        autofocus
                    />
                </div>
                <div class="field">
                    <label for="password">Password</label>
                    <input
                        id="password"
                        class="input"
                        type="password"
                        autocomplete="current-password"
                        value={password()}
                        onInput={(event) => setPassword(event.currentTarget.value)}
                        required
                    />
                </div>
                <Show when={error()}>
                    <div class="notice error">{error()}</div>
                </Show>
                <button class="button primary" type="submit" disabled={busy()}>
                    <Show when={busy()}><span class="spinner" /></Show>
                    Sign in
                </button>
            </form>
        </main>
    );
}
