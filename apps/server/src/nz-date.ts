const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
});

export function nzDate(timestamp: number): string {
    return formatter.format(new Date(timestamp));
}
