import { A } from "@solidjs/router";

export default function NotFound() {
    return (
        <main class="container">
            <div class="card empty stack">
                <h1 class="page-title" style={{ margin: 0 }}>Page not found</h1>
                <A href="/" class="button">Back to music</A>
            </div>
        </main>
    );
}
