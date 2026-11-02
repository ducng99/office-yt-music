import AddSong from "~/components/AddSong";
import NowPlaying from "~/components/NowPlaying";
import Queue from "~/components/Queue";
import VotePanel from "~/components/VotePanel";

export default function Home() {
    return (
        <main class="container stack">
            <NowPlaying />
            <VotePanel />
            <AddSong />
            <Queue />
        </main>
    );
}
