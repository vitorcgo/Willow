import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";

function convertSettingValue(value: any): any {
	if (value === "true") return true;
	if (value === "false") return false;
	if (typeof value === "string" && !isNaN(Number(value))) return Number(value);
	return value;
}

/**
 * Centralized settings sync hook. Listens to:
 * - `settings-changed`: emitted by save_setting (willow keys, native values)
 * - `settings-external-changed`: emitted by file watcher for external edits (willow keys, string values)
 *
 * Both events use the same willow-prefixed keys (e.g. "willow-dock-enabled").
 * Values may pass through String() conversion in the frontend, producing
 * "true"/"false" strings: the hook auto-converts these to booleans.
 *
 * Uses a ref for handlers so listeners are registered once (not re-registered
 * on every render when a new object literal is passed).
 *
 * @param handlers - Map of willow-prefixed key → setter
 * @param deps - Optional additional dependency array
 */
export function useSettingsSync(
	handlers: Record<string, (value: any) => void>,
	deps?: React.DependencyList
) {
	const handlersRef = useRef(handlers);
	handlersRef.current = handlers;

	useEffect(() => {
		const applySetting = (key: string, value: any) => {
			const handler = handlersRef.current[key];
			if (handler && value !== null && value !== undefined) {
				handler(convertSettingValue(value));
			}
		};

		const unlistenSC = listen<{ key: string; value: any }>("settings-changed", (event) => {
			const { key, value } = event.payload;
			applySetting(key, value);
		});

		const unlistenSEC = listen<{ key: string; value: any }>(
			"settings-external-changed",
			(event) => {
				const { key, value } = event.payload;

				if (value !== null) {
					localStorage.setItem(key, String(value));
				} else {
					localStorage.removeItem(key);
				}

				applySetting(key, value);
			}
		);

		// Same-document updates and same-origin iframe previews do not always
		// travel through Tauri. These browser events keep the preview and every
		// local settings consumer in sync immediately.
		const handleLocalSetting = (event: Event) => {
			const detail = (event as CustomEvent<{ key?: string; value?: any }>).detail;
			if (detail?.key) applySetting(detail.key, detail.value);
		};
		const handleStorageSetting = (event: StorageEvent) => {
			if (event.key?.startsWith("willow-") && event.newValue !== null) {
				applySetting(event.key, event.newValue);
			}
		};
		window.addEventListener("willow-setting-changed", handleLocalSetting);
		window.addEventListener("storage", handleStorageSetting);

		return () => {
			unlistenSC.then((fn) => fn());
			unlistenSEC.then((fn) => fn());
			window.removeEventListener("willow-setting-changed", handleLocalSetting);
			window.removeEventListener("storage", handleStorageSetting);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps ?? []);
}
