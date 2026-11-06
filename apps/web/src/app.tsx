import { Route, Router, useLocation, useNavigate, type RouteSectionProps } from "@solidjs/router";
import { Show, Suspense, createEffect, lazy, onMount } from "solid-js";
import Header from "./components/Header";
import { loadBranding, syncDocumentBranding } from "./lib/branding";
import { loadSession, sessionChecked, user } from "./lib/session";
import "./styles/tokens.css";
import "./styles/app.css";

const Home = lazy(() => import("./routes/index"));
const Login = lazy(() => import("./routes/login"));
const Account = lazy(() => import("./routes/account"));
const AdminUsers = lazy(() => import("./routes/admin/users"));
const AdminSettings = lazy(() => import("./routes/admin/settings"));
const NotFound = lazy(() => import("./routes/not-found"));

function Layout(props: RouteSectionProps) {
    const location = useLocation();
    const navigate = useNavigate();

    onMount(loadSession);
    onMount(loadBranding);
    syncDocumentBranding();

    createEffect(() => {
        if (!sessionChecked()) {
            return;
        }
        const onLogin = location.pathname === "/login";
        if (!user() && !onLogin) {
            navigate("/login", { replace: true });
        } else if (user() && onLogin) {
            navigate("/", { replace: true });
        }
    });

    return (
        <>
            <Header />
            <Show when={sessionChecked()}>
                <Suspense>{props.children}</Suspense>
            </Show>
        </>
    );
}

export default function App() {
    return (
        <Router root={Layout}>
            <Route path="/" component={Home} />
            <Route path="/login" component={Login} />
            <Route path="/account" component={Account} />
            <Route path="/admin/users" component={AdminUsers} />
            <Route path="/admin/settings" component={AdminSettings} />
            <Route path="*404" component={NotFound} />
        </Router>
    );
}
