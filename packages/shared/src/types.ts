export interface Track {
    videoId: string;
    title: string;
    artist: string;
    thumbnail: string;
}

export interface SearchResult extends Track {
    album: string;
    durationText: string;
}

export type QueueStatus = "pending" | "sent" | "played" | "removed";

export interface QueueItem extends Track {
    id: number;
    status: QueueStatus;
}

export interface NowPlaying extends Track {
    playId: number;
    position: number;
    duration: number;
    isPaused: boolean;
    reportedAt: number;
}

export interface VoteState {
    voteCount: number;
    threshold: number;
    windowSeconds: number;
    secondsLeft: number;
}

export interface PublicState {
    controllerOnline: boolean;
    nowPlaying: NowPlaying | null;
    votes: VoteState;
    queue: QueueItem[];
}

export interface PersonalState {
    youVoted: boolean;
    votesLeftToday: number;
    dailyVoteLimit: number;
    queuedItemIds: number[];
}

export interface SessionUser {
    id: number;
    username: string;
    isAdmin: boolean;
}

export interface AdminUser extends SessionUser {
    disabled: boolean;
    createdAt: string;
}

export interface Settings {
    skipThreshold: number;
    dailyVoteLimit: number;
    duplicateWindowHours: number;
    voteWindowSeconds: number;
    maxQueuedPerUser: number;
}

export interface Branding {
    siteName: string;
    logo: string | null;
    logoOnly: boolean;
}
