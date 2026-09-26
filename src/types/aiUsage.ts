export interface UsageWindow {
	id: string;
	label: string;
	used: number;
	resetsAt: number | null;
}

export interface ProviderUsage {
	id: string;
	name: string;
	status: "ok" | "stale" | "needsAuth" | "error" | "none" | "detected" | string;
	note: string;
	fetchedAt: number;
	windows: UsageWindow[];
	working: boolean;
}
