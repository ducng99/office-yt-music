export class ApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export async function api<T>(path: string, method: Method = "GET", body?: unknown): Promise<T> {
    const response = await fetch(path, {
        method,
        credentials: "same-origin",
        headers: body === undefined ? {} : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const message = data && typeof data.error === "string" ? data.error : `Request failed (${response.status})`;
        throw new ApiError(response.status, message);
    }
    return data as T;
}

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
