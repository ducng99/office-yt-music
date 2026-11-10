import type { JSX } from "solid-js";

interface IconProps {
    size?: number;
}

function Svg(props: IconProps & { children: JSX.Element }) {
    return (
        <svg
            width={props.size ?? 18}
            height={props.size ?? 18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
        >
            {props.children}
        </svg>
    );
}

export function MusicIcon(props: IconProps) {
    return <Svg size={props.size}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></Svg>;
}

export function StarIcon(props: IconProps) {
    return <Svg size={props.size}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></Svg>;
}

export function SkipIcon(props: IconProps) {
    return <Svg size={props.size}><polygon points="5 4 15 12 5 20 5 4" /><line x1="19" x2="19" y1="5" y2="19" /></Svg>;
}

export function SearchIcon(props: IconProps) {
    return <Svg size={props.size}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Svg>;
}

export function PlusIcon(props: IconProps) {
    return <Svg size={props.size}><path d="M5 12h14" /><path d="M12 5v14" /></Svg>;
}

export function XIcon(props: IconProps) {
    return <Svg size={props.size}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Svg>;
}

export function SunIcon(props: IconProps) {
    return (
        <Svg size={props.size}>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
        </Svg>
    );
}

export function MoonIcon(props: IconProps) {
    return <Svg size={props.size}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></Svg>;
}

export function MonitorIcon(props: IconProps) {
    return <Svg size={props.size}><rect width="20" height="14" x="2" y="3" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" /></Svg>;
}

export function LogOutIcon(props: IconProps) {
    return <Svg size={props.size}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></Svg>;
}

export function UserIcon(props: IconProps) {
    return <Svg size={props.size}><circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 0 0-16 0" /></Svg>;
}

export function WifiOffIcon(props: IconProps) {
    return (
        <Svg size={props.size}>
            <path d="M12 20h.01" /><path d="M8.5 16.43a5 5 0 0 1 7 0" /><path d="M5 12.86a10 10 0 0 1 5.17-2.69" />
            <path d="M19 12.86a10 10 0 0 0-2-1.5" /><path d="M2 8.82a15 15 0 0 1 4.17-2.65" /><path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
            <path d="m2 2 20 20" />
        </Svg>
    );
}
