import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { useEffect, useState, useCallback, useRef, memo, useMemo } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getVersion } from "@tauri-apps/api/app";
import type { UpdateCheckResult } from "./updater";
import "./App.css";

const isTauriRuntime = "__TAURI_INTERNALS__" in window;
import { initTheme } from "./theme";
import {
	PlayIcon,
	PauseIcon,
	SkipBackIcon,
	SkipForwardIcon,
	VolumeLowIcon,
	VolumeHighIcon,
	MusicNoteIcon,
	HeadphonesIcon
} from "./icons";
import { CompactMediaPlayer } from "./CompactMediaPlayer";
import { AiUsageIsland } from "./components/AiUsageIsland";
import { BrowserDockPreview } from "./components/BrowserDockPreview";
import { useWeather } from "./hooks/useWeather";
import { useSettingsSync } from "./hooks/useSettingsSync";
import type { WidgetConfig } from "./components/StatusWidgetConfig";
import {
	Cpu,
	MemoryStick,
	HardDrive,
	ArrowUpDown,
	BellRing,
	Play,
	Pause,
	RotateCcw,
	Droplets,
	Wind,
	Sunrise,
	Sunset,
	Umbrella,
	MapPin,
	RefreshCw,
	Search,
	Thermometer,
	ArrowLeft
} from "lucide-react";
import { DEFAULT_DEVICE_CAPABILITIES, type DeviceCapabilities } from "./deviceCapabilities";

// Older versions could save a "journal" widget, which no longer exists.
const dropRetiredWidgets = (config: WidgetConfig): WidgetConfig => ({
	left: config.left.filter((id) => id !== "journal"),
	right: config.right.filter((id) => id !== "journal")
});

// Pomodoro timer limit.
const MAX_TIMER_SECONDS = 180 * 60;

// Inline timer editing: digits fill from the right and the colon is inserted
// automatically ("130" -> 1:30, "2500" -> 25:00, "45" -> 0:45).
const timerDigitsToSeconds = (digits: string): number | null => {
	if (!digits) return null;
	const secs = parseInt(digits.slice(-2) || "0", 10);
	const mins = parseInt(digits.slice(0, -2) || "0", 10);
	const total = mins * 60 + secs;
	return total > 0 && total <= MAX_TIMER_SECONDS ? total : null;
};

const timerSecondsToDigits = (seconds: number): string => {
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${mins}${secs.toString().padStart(2, "0")}`.replace(/^0+(?=\d)/, "");
};

const formatTimerDigits = (digits: string): string => {
	if (!digits) return "0:00";
	const secs = digits.slice(-2).padStart(2, "0");
	const mins = parseInt(digits.slice(0, -2) || "0", 10);
	return `${mins}:${secs}`;
};

// Completion chime for the Pomodoro timer. Synthesized with the Web Audio API
// so no audio asset is needed; created on the Start click so the webview's
// autoplay policy lets it play when the timer termina.
let timerChimeCtx: AudioContext | null = null;

const getTimerChimeCtx = (): AudioContext | null => {
	try {
		if (!timerChimeCtx) timerChimeCtx = new AudioContext();
		if (timerChimeCtx.state === "suspended") timerChimeCtx.resume().catch(() => {});
		return timerChimeCtx;
	} catch {
		return null;
	}
};

const playTimerChime = () => {
	const ctx = getTimerChimeCtx();
	if (!ctx) return;
	const start = ctx.currentTime + 0.02;
	const master = ctx.createGain();
	master.gain.value = 0.45;
	master.connect(ctx.destination);

	// Soft rising bell arpeggio (A5–C#6–E6) with a quiet octave harmonic.
	const notes = [
		{ freq: 880.0, at: 0 },
		{ freq: 1108.73, at: 0.18 },
		{ freq: 1318.51, at: 0.36 }
	];
	notes.forEach(({ freq, at }) => {
		const osc = ctx.createOscillator();
		const harmonic = ctx.createOscillator();
		const gain = ctx.createGain();
		const harmonicGain = ctx.createGain();
		osc.type = "sine";
		osc.frequency.value = freq;
		harmonic.type = "sine";
		harmonic.frequency.value = freq * 2.01;
		harmonicGain.gain.value = 0.12;
		gain.gain.setValueAtTime(0.0001, start + at);
		gain.gain.exponentialRampToValueAtTime(0.32, start + at + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 1.4);
		osc.connect(gain);
		harmonic.connect(harmonicGain);
		harmonicGain.connect(gain);
		gain.connect(master);
		osc.start(start + at);
		harmonic.start(start + at);
		osc.stop(start + at + 1.5);
		harmonic.stop(start + at + 1.5);
	});
};

// Simple SVG icons
function WifiIcon({ connected }: { connected: boolean }) {
	return (
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			opacity={connected ? 1 : 0.4}
		>
			<path d="M5 12.55a11 11 0 0 1 14.08 0" />
			<path d="M1.42 9a16 16 0 0 1 21.16 0" />
			<path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
			<line x1="12" y1="20" x2="12.01" y2="20" />
		</svg>
	);
}

function TrayIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<rect x="3" y="3" width="6" height="6" rx="1" />
			<rect x="15" y="3" width="6" height="6" rx="1" />
			<rect x="15" y="15" width="6" height="6" rx="1" />
			<rect x="3" y="15" width="6" height="6" rx="1" />
		</svg>
	);
}

function BatteryIcon({
	charging,
	level,
	threshold = 20
}: {
	charging: boolean;
	level: number;
	threshold?: number;
}) {
	const percentage = Math.min(Math.max(level, 0), 100);

	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				position: "relative",
				height: "14px",
				justifyContent: "center"
			}}
		>
			<svg width="20" height="10" viewBox="0 0 20 10" fill="none">
				{/* Battery Shell - Centered at 9px within 20px width, ignoring the tip's offset */}
				<rect
					x="2"
					y="0.75"
					width="14"
					height="8.5"
					rx="2.4"
					stroke="currentColor"
					strokeOpacity={0.35}
					strokeWidth="1.1"
				/>
				{/* Battery Tip */}
				<path
					d="M17.5 3.5V6.5"
					stroke="currentColor"
					strokeOpacity={0.35}
					strokeWidth="1.2"
					strokeLinecap="round"
				/>
				{/* Fill */}
				<rect
					x="3.8"
					y="2.5"
					width={Math.max(0.5, (percentage / 100) * 10.4)}
					height="5"
					rx="1"
					fill={charging ? "#32D74B" : percentage <= threshold ? "#FF453A" : "white"}
				/>
			</svg>
			{/* Carregando Bolt - Centered on the battery body */}
			{charging && (
				<div
					style={{
						position: "absolute",
						top: "50%",
						left: "9px",
						transform: "translate(-50%, -50%)",
						color: "white",
						filter: "drop-shadow(0px 0px 1.5px rgba(0,0,0,0.8))"
					}}
				>
					<svg width="7" height="10" viewBox="0 0 8 12" fill="currentColor">
						<path d="M4.5 0L0 7H3.5L2.5 12L8 5H4.5L5.5 0H4.5Z" />
					</svg>
				</div>
			)}
		</div>
	);
}

function GreenDownArrowIcon() {
	return (
		<div
			style={{
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				width: "18px",
				height: "18px",
				borderRadius: "50%",
				background: "rgba(50, 215, 75, 0.15)",
				border: "1px solid rgba(50, 215, 75, 0.35)",
				boxShadow: "0 0 8px rgba(50, 215, 75, 0.25)",
				flexShrink: 0,
				verticalAlign: "middle"
			}}
		>
			<svg
				width="10"
				height="10"
				viewBox="0 0 24 24"
				fill="none"
				stroke="#32D74B"
				strokeWidth="3"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<line x1="12" y1="4" x2="12" y2="16"></line>
				<polyline points="18 10 12 16 6 10"></polyline>
				<line x1="6" y1="20" x2="18" y2="20"></line>
			</svg>
		</div>
	);
}

export const Visualizer = memo(function Visualizer({
	isPlaying,
	bars = 5,
	height = 20
}: {
	isPlaying: boolean;
	bars?: number;
	height?: number;
}) {
	const [audioData, setAudioData] = useState<number[]>(new Array(bars).fill(0.18));

	useEffect(() => {
		if (!isPlaying) {
			setAudioData(new Array(bars).fill(0.18));
			return;
		}

		const unlisten = listen<{ frequencies: number[] }>("audio-visualization", (event) => {
			// If we receive fewer frequencies than bars, repeat or interpolate
			// If more, slice
			let data = event.payload.frequencies;
			if (data.length > bars) data = data.slice(0, bars);
			while (data.length < bars) data.push(0.18);
			setAudioData(data);
		});

		return () => {
			unlisten.then((fn) => fn());
		};
	}, [isPlaying, bars]);

	return (
		<div
			className="visualizer-horizontal"
			style={{ height: `${height}px`, width: `${bars * 6}px` }}
		>
			{audioData.map((value, i) => (
				<motion.div
					key={i}
					className="bar-horizontal"
					animate={{
						scaleY: isPlaying ? Math.max(0.2, value) : 0.1,
						opacity: isPlaying ? 0.95 : 0.5
					}}
					transition={{
						type: "spring",
						stiffness: 600,
						damping: 30,
						mass: 0.5
					}}
				/>
			))}
		</div>
	);
});

// Number of week rows the current month occupies. Calendar mode sizes the
// notch to the month so five-row months stay compact and six-row months never
// clip the last row.
const calendarMonthRows = (() => {
	const now = new Date();
	const firstWeekday = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
	const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
	return Math.ceil((firstWeekday + daysInMonth) / 7);
})();

// Odometer-style digit for the timer clock. When the value changes the old
// digit rolls up and out while the new one rolls in from below with a slight
// 3D tilt: no card chrome, just the numerals.
const RollDigit = memo(function RollDigit({
	value,
	compact = false
}: {
	value: string;
	compact?: boolean;
}) {
	return (
		<span className={`roll-digit ${compact ? "compact" : ""}`}>
			<AnimatePresence initial={false}>
				<motion.span
					key={value}
					className="roll-num"
					initial={{ y: "72%", rotateX: -50, opacity: 0 }}
					animate={{ y: "0%", rotateX: 0, opacity: 1 }}
					exit={{ y: "-72%", rotateX: 50, opacity: 0 }}
					transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
				>
					{value}
				</motion.span>
			</AnimatePresence>
		</span>
	);
});

interface MediaInfo {
	title: string;
	artist: string;
	is_playing: boolean;
	has_media: boolean;
	artwork?: string[];
	position_ms?: number;
	duration_ms?: number;
	seek_enabled?: boolean;
	position_updated_at?: number;
}

interface TrayAppInfo {
	name: string;
	path: string;
	icon: string | null;
	is_running: boolean;
	hwnd?: number;
}

const BROWSER_TRAY_APPS: TrayAppInfo[] = [
	{ name: "Assistente", path: "preview-assistant", icon: null, is_running: true },
	{ name: "Terminal", path: "preview-terminal", icon: null, is_running: true },
	{ name: "Segurança", path: "preview-security", icon: null, is_running: true },
	{ name: "Música", path: "preview-music", icon: null, is_running: true },
	{ name: "Nuvem", path: "preview-cloud", icon: null, is_running: true },
	{ name: "Bluetooth", path: "preview-bluetooth", icon: null, is_running: true }
];

const MARQUEE_SPEED = 30; // px/s: constant for all titles
const MARQUEE_MIN_DURATION = 5; // floor so short titles don't flicker

const TitleMarquee = ({ title }: { title: string }) => {
	const textRef = useRef<HTMLSpanElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [isOverflowing, setIsOverflowing] = useState(false);
	const [scrollDistance, setScrollDistance] = useState(0);
	const [scrollDuration, setScrollDuration] = useState(8);

	useEffect(() => {
		const check = () => {
			if (textRef.current && containerRef.current) {
				const textWidth = textRef.current.scrollWidth;
				const containerWidth = containerRef.current.clientWidth;
				const overflow = textWidth > containerWidth;
				setIsOverflowing(overflow);
				if (overflow) {
					const distance = textWidth - containerWidth;
					setScrollDistance(distance);
					setScrollDuration(Math.max(distance / MARQUEE_SPEED, MARQUEE_MIN_DURATION));
				}
			}
		};
		check();
		const observer = new ResizeObserver(check);
		if (containerRef.current) observer.observe(containerRef.current);
		return () => observer.disconnect();
	}, [title]);

	return (
		<div
			ref={containerRef}
			className="premium-title-wrap"
			style={{ width: "100%", overflow: "hidden" }}
		>
			<span
				ref={textRef}
				className={`premium-title ${isOverflowing ? "marquee" : ""}`}
				style={
					{
						"--scroll-distance": isOverflowing ? `-${scrollDistance}px` : undefined,
						"--scroll-duration": `${scrollDuration}s`
					} as React.CSSProperties
				}
			>
				{title}
			</span>
		</div>
	);
};

function App() {
	useEffect(() => {
		return initTheme();
	}, []);

	const [time, setTime] = useState("");
	const [isHovered, setIsHovered] = useState(false);
	const [isReady, setIsReady] = useState(false);
	const [scale, setScale] = useState(() =>
		parseFloat(localStorage.getItem("willow-scale") || "1.0")
	);
	const [timeFormat24h, setTimeFormat24h] = useState(
		() => localStorage.getItem("willow-time-format-24h") === "true"
	);
	const [deviceCapabilities, setDeviceCapabilities] = useState<DeviceCapabilities>(
		DEFAULT_DEVICE_CAPABILITIES
	);

	const [batteryLevel, setBatteryLevel] = useState(100);
	const [isCharging, setIsCharging] = useState(false);
	const [showPowerPulse, setShowPowerPulse] = useState(false);
	const [showLowBatteryPulse, setShowLowBatteryPulse] = useState(false);
	const [lowBatteryThreshold, setLowBatteryThreshold] = useState(() =>
		parseInt(localStorage.getItem("willow-low-battery-threshold") || "20")
	);
	const prevChargingRef = useRef<boolean | null>(null);
	const powerPulseTimeoutRef = useRef<any>(null);
	const lowBatteryPulseShownRef = useRef<boolean>(false);

	const [eventPeek, setEventPeek] = useState(false);
	const eventPeekTimeoutRef = useRef<any>(null);
	const updatePulseTimerRef = useRef<any>(null);
	const triggerEventPeek = useCallback((duration = 3000) => {
		setEventPeek(true);
		if (eventPeekTimeoutRef.current) clearTimeout(eventPeekTimeoutRef.current);
		eventPeekTimeoutRef.current = setTimeout(() => setEventPeek(false), duration);
	}, []);

	const [notchMode, setNotchMode] = useState(() => {
		const raw = localStorage.getItem("willow-notch-mode") || "fixed";
		if (raw === "auto-hide") return "smart";
		return raw;
	});

	useEffect(() => {
		invoke<DeviceCapabilities>("get_device_capabilities")
			.then(setDeviceCapabilities)
			.catch(() => {});
	}, []);

	useEffect(() => {
		if (
			deviceCapabilities.hasBattery &&
			isReady &&
			prevChargingRef.current !== null &&
			prevChargingRef.current !== isCharging
		) {
			setShowPowerPulse(true);
			if (notchMode === "peek") triggerEventPeek(4000);
			if (powerPulseTimeoutRef.current) clearTimeout(powerPulseTimeoutRef.current);
			powerPulseTimeoutRef.current = setTimeout(() => {
				setShowPowerPulse(false);
			}, 4000);
		}
		prevChargingRef.current = isCharging;
	}, [isCharging, isReady, notchMode, triggerEventPeek, deviceCapabilities.hasBattery]);

	useEffect(() => {
		// Trigger pulse when dropping below threshold while discharging
		if (
			deviceCapabilities.hasBattery &&
			isReady &&
			batteryLevel <= lowBatteryThreshold &&
			!isCharging &&
			!lowBatteryPulseShownRef.current
		) {
			setShowLowBatteryPulse(true);
			if (notchMode === "peek") triggerEventPeek(5000);
			lowBatteryPulseShownRef.current = true;
			setTimeout(() => setShowLowBatteryPulse(false), 5000);
		}

		// Reset the "shown" state if battery is charged or threshold is lowered
		if (isCharging || batteryLevel > lowBatteryThreshold) {
			lowBatteryPulseShownRef.current = false;
		}
	}, [
		batteryLevel,
		isCharging,
		lowBatteryThreshold,
		isReady,
		notchMode,
		triggerEventPeek,
		deviceCapabilities.hasBattery
	]);

	// Weather state (managed by useWeather hook)

	// Media state
	const [isPlaying, setIsPlaying] = useState(false);
	const [mediaInfo, setMediaInfo] = useState<MediaInfo>({
		title: "",
		artist: "",
		is_playing: false,
		has_media: false
	});
	const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(null);
	const [albumArtKey, setAlbumArtKey] = useState(0);
	const [volume, setVolume] = useState(0.5);
	const [wifiEnabled, setWifiEnabled] = useState(true);
	const [bluetoothEnabled, setBluetoothEnabled] = useState(true);
	const [batterySaverEnabled, setBatterySaverEnabled] = useState(false);
	const [currentBrightness, setCurrentBrightness] = useState(50);

	// System metrics for status widgets
	const [cpuUsage, setCpuUsage] = useState(0);
	const [ramUsage, setRamUsage] = useState(0);
	const [diskSpace, setDiskSpace] = useState(0);
	const [netUpSpeed, setNetUpSpeed] = useState(0);
	const [netDownSpeed, setNetDownSpeed] = useState(0);
	const [statusWidgets, setStatusWidgets] = useState<WidgetConfig>({
		left: ["weather"],
		right: ["battery"]
	});

	const [windowLabel, setWindowLabel] = useState<string>("");
	const [browserSettingsOpen, setBrowserSettingsOpen] = useState(false);
	const [trayApps, setTrayApps] = useState<TrayAppInfo[]>(isTauriRuntime ? [] : BROWSER_TRAY_APPS);
	const [installedTrayApps, setInstalledTrayApps] = useState<TrayAppInfo[]>(
		isTauriRuntime ? [] : BROWSER_TRAY_APPS
	);
	const [traySearch, setTraySearch] = useState("");
	const [trayIcons, setTrayIcons] = useState<Record<string, string>>({});
	const [trayAppsLoading, setTrayAppsLoading] = useState(false);
	const visibleTrayApps = useMemo(() => {
		const query = traySearch.trim().toLocaleLowerCase("pt-BR");
		const source = query ? installedTrayApps : trayApps;
		const seen = new Set<string>();
		return source
			.filter((app) => {
				const key = `${app.path}:${app.name}`.toLowerCase();
				if (seen.has(key)) return false;
				seen.add(key);
				return !query || app.name.toLocaleLowerCase("pt-BR").includes(query);
			})
			.slice(0, query ? 12 : 6);
	}, [installedTrayApps, trayApps, traySearch]);
	useEffect(() => {
		setWindowLabel(isTauriRuntime ? getCurrentWebviewWindow().label : "preview");
	}, []);

	useEffect(() => {
		if (isTauriRuntime) return;
		const handlePreviewMessage = (event: MessageEvent) => {
			if (event.origin === window.location.origin && event.data?.type === "willow-close-settings") {
				setBrowserSettingsOpen(false);
			}
		};
		window.addEventListener("message", handlePreviewMessage);
		return () => window.removeEventListener("message", handlePreviewMessage);
	}, []);

	// Update state
	const [updateAvailable, setUpdateAvailable] = useState(false);
	const [showUpdateIndicator, setShowUpdateIndicator] = useState(
		() => localStorage.getItem("willow-show-update-indicator") !== "false"
	);
	const [showUpdatePulse, setShowUpdatePulse] = useState(false);

	useEffect(() => {
		if (windowLabel !== "main") return;

		let unlisten: (() => void) | undefined;
		let disposed = false;

		listen<UpdateCheckResult>("update-available", (event) => {
			if (!event.payload.available) return;
			setUpdateAvailable(true);
			setShowUpdatePulse(true);
			if (notchMode === "peek") triggerEventPeek(6000);
			if (updatePulseTimerRef.current) clearTimeout(updatePulseTimerRef.current);
			updatePulseTimerRef.current = setTimeout(() => {
				setShowUpdatePulse(false);
			}, 6000);
		}).then((fn) => {
			if (disposed) fn();
			else unlisten = fn;
		});

		invoke<UpdateCheckResult>("get_update_state")
			.then((state) => {
				if (state.available) setUpdateAvailable(true);
			})
			.catch((e) => console.error("Failed to read update state:", e));

		return () => {
			disposed = true;
			unlisten?.();
			if (updatePulseTimerRef.current) clearTimeout(updatePulseTimerRef.current);
		};
	}, [windowLabel, notchMode, triggerEventPeek]);

	const [isVisible, setIsVisible] = useState(true);
	const [areCornersVisible, setAreCornersVisible] = useState(true);
	const [privacyState, setPrivacyState] = useState({ microphone: false, camera: false });
	const [settingsPrivacyIndicatorsEnabled, setSettingsPrivacyIndicatorsEnabled] = useState(
		() => localStorage.getItem("willow-privacy-indicators-enabled") !== "false"
	);
	const [isImpacted, setIsImpacted] = useState(false);
	const [isExpanded, setIsExpanded] = useState(false);
	const [startupAnimating, setStartupAnimating] = useState(false);

	const [dockMode, setDockMode] = useState(() => {
		const raw = localStorage.getItem("willow-dock-mode") || "fixed";
		if (raw === "auto-hide") return "smart";
		return raw;
	});
	const [dndActive, setDndActive] = useState(false);
	const [dockEnabled, setDockEnabled] = useState(
		() => localStorage.getItem("willow-dock-enabled") !== "false"
	);
	const [isNotchHovered, setIsNotchHovered] = useState(false);

	const [isEdgeHovered, setIsEdgeHovered] = useState(false);
	const [isOverlapped, setIsOverlapped] = useState(false);
	const [interactionState, setInteractionState] = useState<"active" | "grace" | "none">("none");
	const willowRef = useRef<HTMLDivElement>(null);
	const dockEnabledInitial = useRef(true);
	const dockModeInitial = useRef(true);
	const notchModeInitial = useRef(true);

	const privacyActive =
		settingsPrivacyIndicatorsEnabled && (privacyState.microphone || privacyState.camera);
	const isAnyInteraction = isHovered || isNotchHovered || isEdgeHovered;
	const isHidden =
		!startupAnimating &&
		!privacyActive &&
		((notchMode === "smart" && isOverlapped && interactionState === "none") ||
			(notchMode === "peek" && interactionState === "none" && !eventPeek));

	useEffect(() => {
		if (isAnyInteraction) {
			setInteractionState("active");
		} else if (interactionState !== "none") {
			setInteractionState("grace");
			const timer = setTimeout(() => setInteractionState("none"), 800);
			return () => clearTimeout(timer);
		}
	}, [isAnyInteraction]);

	useEffect(() => {
		if (windowLabel === "main") {
			invoke("set_notch_hovered", { hovered: isNotchHovered }).catch(() => {});
		}
	}, [isNotchHovered, windowLabel]);

	useEffect(() => {
		const updateRect = () => {
			if (willowRef.current && windowLabel === "main") {
				const rect = willowRef.current.getBoundingClientRect();
				invoke("update_notch_rect", {
					rect: {
						x: Math.round(rect.x),
						y: Math.round(rect.y),
						width: Math.round(rect.width),
						height: Math.round(rect.height)
					}
				}).catch(() => {});
			}
		};

		updateRect();
		window.addEventListener("resize", updateRect);
		const observer = new ResizeObserver(updateRect);
		if (willowRef.current) observer.observe(willowRef.current);

		return () => {
			window.removeEventListener("resize", updateRect);
			observer.disconnect();
		};
	}, [isExpanded, isHidden, windowLabel, scale]);

	useEffect(() => {
		if (!windowLabel) return;

		// Only animate the main top-bar
		if (windowLabel !== "main") {
			setIsReady(true);
			setIsImpacted(true);
			setIsExpanded(true);
			return;
		}

		const proceedWithStartup = () => {
			const checkVisibility = async () => {
				try {
					const win = getCurrentWebviewWindow();
					const visible = await win.isVisible();
					if (visible) {
						setStartupAnimating(true);
						setIsReady(true);
						setTimeout(() => {
							setIsImpacted(true);
							setIsExpanded(true);
						}, 240);
						setTimeout(() => setStartupAnimating(false), 1500);
						return true;
					}
				} catch (e) {}
				return false;
			};

			const interval = setInterval(async () => {
				if (await checkVisibility()) clearInterval(interval);
			}, 100);

			checkVisibility();
			return interval;
		};

		// Mirror Overlay.tsx's splash decision so we only wait when a splash will actually fire.
		// Overlay always emits splash-done, but on a normal relaunch it emits it near-instantly
		// (after one async getVersion() call): before this listener would be registered.
		// By making the same decision here we avoid a race and avoid any unnecessary delay.
		const firstRun = localStorage.getItem("willow-first-run") === null;
		const storedVersion = localStorage.getItem("willow-app-version");

		const waitForSplash = () => {
			// Splash is definitely coming: register listener now (2800ms animation gives us plenty of time)
			let started = false;
			let interval: any;
			const unlistenSplash = listen("splash-done", () => {
				if (started) return;
				started = true;
				interval = proceedWithStartup();
				unlistenSplash.then((fn) => fn());
			});
			const safetyTimer = setTimeout(() => {
				if (started) return;
				started = true;
				interval = proceedWithStartup();
				unlistenSplash.then((fn) => fn());
			}, 6000);
			return () => {
				clearTimeout(safetyTimer);
				if (interval) clearInterval(interval);
				unlistenSplash.then((fn) => fn());
			};
		};

		if (firstRun || storedVersion === null) {
			// Splash is definitely showing: wait for it
			return waitForSplash();
		}

		// Has a version key: need async check to know if version changed
		let interval: any;
		getVersion()
			.then((currentVersion) => {
				if (storedVersion !== currentVersion) {
					// Version changed: splash is coming, wait for it
					// (splash takes 2800ms so there's plenty of time to register the listener)
					waitForSplash();
				} else {
					// Same version: no splash, start immediately
					interval = proceedWithStartup();
				}
			})
			.catch(() => {
				interval = proceedWithStartup();
			});
		return () => {
			if (interval) clearInterval(interval);
		};
	}, [windowLabel]);

	// Settings state
	const [settingsWeatherEnabled, setSettingsWeatherEnabled] = useState(
		() => localStorage.getItem("willow-weather-enabled") !== "false"
	);
	const [settingsCalendarEnabled, setSettingsCalendarEnabled] = useState(
		() => localStorage.getItem("willow-calendar-enabled") !== "false"
	);
	const [settingsTimerSoundEnabled, setSettingsTimerSoundEnabled] = useState(
		() => localStorage.getItem("willow-timer-sound-enabled") !== "false"
	);
	const [settingsMusicModeEnabled, setSettingsMusicModeEnabled] = useState(
		() => localStorage.getItem("willow-music-mode-enabled") !== "false"
	);
	const [settingsMusicCompactNotch, setSettingsMusicCompactNotch] = useState(
		() => localStorage.getItem("willow-music-compact-notch") !== "false"
	);
	const [settingsVisualizerEnabled, setSettingsVisualizerEnabled] = useState(
		() => localStorage.getItem("willow-visualizer-enabled") !== "false"
	);
	const [settingsAlbumArtEnabled, setSettingsAlbumArtEnabled] = useState(
		() => localStorage.getItem("willow-media-album-art-enabled") !== "false"
	);
	const [settingsAmbienceEnabled, setSettingsAmbienceEnabled] = useState(
		() => localStorage.getItem("willow-media-ambience-enabled") !== "false"
	);
	const [settingsCompactGlowEnabled, setSettingsCompactGlowEnabled] = useState(
		() => localStorage.getItem("willow-media-compact-glow-enabled") !== "false"
	);
	const [settingsCornersEnabled, setSettingsCornersEnabled] = useState(
		() => localStorage.getItem("willow-corners-enabled") === "true"
	);
	const [mediaLayout, setMediaLayout] = useState<"classic" | "compact">(() =>
		localStorage.getItem("willow-media-layout") === "compact" ? "compact" : "classic"
	);
	const [compactVolumeExpanded, setCompactVolumeExpanded] = useState(false);

	// Weather hook
	const {
		temperature,
		weatherCondition,
		weatherIcon: WeatherIcon,
		cityName,
		tempUnit,
		weatherDetails,
		isRefreshing: isWeatherRefreshing,
		refreshWeather
	} = useWeather(settingsWeatherEnabled);

	useEffect(() => {
		if (!windowLabel) return;

		invoke("load_settings")
			.then((settings: any) => {
				const getVal = (key: string, fallback: string | null = null) => {
					const val = settings[key];
					if (val !== undefined && val !== null) return String(val);
					const local = localStorage.getItem(key);
					if (local !== null) return local;
					return fallback;
				};

				setSettingsWeatherEnabled(getVal("willow-weather-enabled", "true") !== "false");
				setSettingsCalendarEnabled(getVal("willow-calendar-enabled", "true") !== "false");
				setSettingsTimerSoundEnabled(getVal("willow-timer-sound-enabled", "true") !== "false");
				setSettingsMusicModeEnabled(getVal("willow-music-mode-enabled", "true") !== "false");
				setSettingsPrivacyIndicatorsEnabled(
					getVal("willow-privacy-indicators-enabled", "true") !== "false"
				);
				setSettingsMusicCompactNotch(getVal("willow-music-compact-notch", "true") !== "false");
				const viz =
					getVal("willow-media-visualizer-enabled") ?? getVal("willow-visualizer-enabled", "true");
				setSettingsVisualizerEnabled(viz !== "false");
				setSettingsAlbumArtEnabled(getVal("willow-media-album-art-enabled", "true") !== "false");
				setSettingsAmbienceEnabled(getVal("willow-media-ambience-enabled", "true") !== "false");
				setSettingsCompactGlowEnabled(
					getVal("willow-media-compact-glow-enabled", "true") !== "false"
				);
				setMediaLayout(
					getVal("willow-media-layout", "classic") === "compact" ? "compact" : "classic"
				);
				setSettingsCornersEnabled(getVal("willow-corners-enabled", "false") === "true");
				setTimeFormat24h(getVal("willow-time-format-24h") === "true");

				const thresholdStr = getVal("willow-low-battery-threshold", "20");
				if (thresholdStr) setLowBatteryThreshold(parseInt(thresholdStr as string));

				const nMode = getVal("willow-notch-mode", "fixed");
				if (nMode) {
					const mapped = nMode === "auto-hide" ? "smart" : nMode;
					setNotchMode(mapped);
				}

				if (windowLabel === "main") {
					const firstRun = localStorage.getItem("willow-first-run") === null;
					if (firstRun) {
						import("@tauri-apps/plugin-autostart").then(({ enable, isEnabled }) => {
							isEnabled().then((enabled) => {
								if (!enabled) enable().catch(() => {});
							});
						});
						localStorage.setItem("willow-first-run", "done");
					}
					const rawDockMode = getVal("willow-dock-mode", "fixed") as string;
					const dockMode = rawDockMode === "auto-hide" ? "smart" : rawDockMode;
					const syncWindows = async () => {
						const dockEnabled = getVal("willow-dock-enabled", "true") === "true";
						if (dockEnabled) {
							await invoke("init_dock", { mode: dockMode });
						}
						await invoke("change_notch_mode", { mode: nMode });
						await invoke("sync_appbar");
					};

					const dockEnabled = getVal("willow-dock-enabled", "true") === "true";
					const runDockInit = () => {
						// 1. Snappy initial sync
						setTimeout(syncWindows, 400);
						// 2. Safety-net dock retry
						if (dockEnabled) {
							setTimeout(() => invoke("init_dock", { mode: dockMode }).catch(() => {}), 1500);
						}
						// 3. Layout corrections
						setTimeout(() => invoke("sync_appbar"), 1000);
						setTimeout(() => invoke("sync_appbar"), 2500);
						setTimeout(() => invoke("sync_appbar"), 5000);
					};

					// Mirror Overlay.tsx's splash decision for dock init too: only wait when
					// a splash is actually coming, otherwise init immediately.
					const runDockInitAfterSplash = () => {
						let dockStarted = false;
						const unlistenDock = listen("splash-done", () => {
							if (dockStarted) return;
							dockStarted = true;
							runDockInit();
							unlistenDock.then((fn) => fn());
						});
						setTimeout(() => {
							if (dockStarted) return;
							dockStarted = true;
							runDockInit();
							unlistenDock.then((fn) => fn());
						}, 6000);
					};

					const storedVersion = localStorage.getItem("willow-app-version");
					if (firstRun || storedVersion === null) {
						runDockInitAfterSplash();
					} else {
						getVersion()
							.then((currentVersion) => {
								if (storedVersion !== currentVersion) {
									runDockInitAfterSplash();
								} else {
									runDockInit();
								}
							})
							.catch(() => runDockInit());
					}
				}

				const scaleVal = getVal("willow-scale");
				if (scaleVal !== null) setScale(parseFloat(scaleVal));

				const widgetsVal = getVal("willow-status-widgets");
				if (widgetsVal) {
					try {
						const parsed = JSON.parse(widgetsVal);
						if (parsed && Array.isArray(parsed.left) && Array.isArray(parsed.right)) {
							setStatusWidgets(dropRetiredWidgets(parsed));
						}
					} catch {}
				}
			})
			.catch(console.error);
	}, [windowLabel]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		// Disable context menu globally
		const preventContext = (e: MouseEvent) => e.preventDefault();
		document.addEventListener("contextmenu", preventContext);

		const unlistenVisibility = listen<boolean>("visibility-change", (event) => {
			setIsVisible(event.payload);
		});
		const unlistenCornersVisibility = listen<boolean>("corners-visibility-change", (event) => {
			setAreCornersVisible(event.payload);
		});

		const unlistenNotchOverlap = listen<boolean>("notch-overlap", (event) => {
			setIsOverlapped(event.payload);
		});

		const unlistenNotchEdgeHover = listen<boolean>("notch-edge-hover", (event) => {
			setIsEdgeHovered(event.payload);
		});
		const unlistenPrivacyState = listen<{ microphone: boolean; camera: boolean }>(
			"privacy-state",
			(event) =>
				setPrivacyState((current) =>
					current.microphone === event.payload.microphone && current.camera === event.payload.camera
						? current
						: event.payload
				)
		);

		return () => {
			unlistenVisibility.then((f) => f());
			unlistenCornersVisibility.then((f) => f());
			unlistenNotchOverlap.then((f) => f());
			unlistenNotchEdgeHover.then((f) => f());
			unlistenPrivacyState.then((f) => f());
			document.removeEventListener("contextmenu", preventContext);
		};
	}, [windowLabel]);

	// Settings sync: consolidated dispatch for all settings events
	useSettingsSync(
		{
			"willow-weather-enabled": setSettingsWeatherEnabled,
			"willow-calendar-enabled": setSettingsCalendarEnabled,
			"willow-timer-sound-enabled": setSettingsTimerSoundEnabled,
			"willow-music-mode-enabled": setSettingsMusicModeEnabled,
			"willow-privacy-indicators-enabled": setSettingsPrivacyIndicatorsEnabled,
			"willow-music-compact-notch": setSettingsMusicCompactNotch,
			"willow-media-visualizer-enabled": setSettingsVisualizerEnabled,
			"willow-visualizer-enabled": setSettingsVisualizerEnabled,
			"willow-media-album-art-enabled": setSettingsAlbumArtEnabled,
			"willow-media-ambience-enabled": setSettingsAmbienceEnabled,
			"willow-media-compact-glow-enabled": setSettingsCompactGlowEnabled,
			"willow-media-layout": setMediaLayout,
			"willow-corners-enabled": setSettingsCornersEnabled,
			"willow-scale": setScale,
			"willow-low-battery-threshold": setLowBatteryThreshold,
			"willow-dock-enabled": setDockEnabled,
			"willow-dock-mode": setDockMode,
			"willow-notch-mode": setNotchMode,
			"willow-status-widgets": (value) => {
				try {
					const parsed = JSON.parse(value);
					if (parsed && Array.isArray(parsed.left) && Array.isArray(parsed.right)) {
						setStatusWidgets(dropRetiredWidgets(parsed));
					}
				} catch {}
			},
			"willow-show-update-indicator": (value) => setShowUpdateIndicator(String(value) === "true"),
			"willow-time-format-24h": setTimeFormat24h
		},
		[windowLabel]
	);

	// Side effects: dock-enabled (skip first render: startup code handles initial state)
	useEffect(() => {
		if (windowLabel !== "main") return;
		if (dockEnabledInitial.current) {
			dockEnabledInitial.current = false;
			return;
		}
		if (dockEnabled) {
			invoke("init_dock", { mode: localStorage.getItem("willow-dock-mode") || "fixed" });
		} else {
			invoke("toggle_dock", { enable: false });
		}
		setTimeout(() => invoke("sync_appbar"), 200);
	}, [dockEnabled, windowLabel]);

	// Side effects: dock-mode (skip first render)
	useEffect(() => {
		if (windowLabel !== "main") return;
		if (dockModeInitial.current) {
			dockModeInitial.current = false;
			return;
		}
		invoke("change_dock_mode", { mode: dockMode });
		setTimeout(() => invoke("sync_appbar"), 200);
	}, [dockMode, windowLabel]);

	// Side effects: notch-mode (skip first render)
	useEffect(() => {
		if (windowLabel !== "main") return;
		if (notchModeInitial.current) {
			notchModeInitial.current = false;
			return;
		}
		invoke("change_notch_mode", { mode: notchMode });
	}, [notchMode, windowLabel]);

	type WillowMode =
		| "music"
		| "calendar"
		| "command-center"
		| "tray"
		| "weather"
		| "status";
	const [willowMode, setWillowMode] = useState<WillowMode>("status");
	const changeMediaLayout = useCallback((layout: "classic" | "compact") => {
		setMediaLayout(layout);
		localStorage.setItem("willow-media-layout", layout);
		invoke("save_setting", { key: "willow-media-layout", value: layout }).catch(console.error);
	}, []);
	const toggleControlCenter = (event: React.MouseEvent) => {
		event.stopPropagation();
		setIsHovered(true);
		setWillowMode("command-center");
	};
	const toggleTrayPanel = async (event: React.MouseEvent) => {
		event.stopPropagation();
		setIsHovered(true);
		setWillowMode("tray");
		if (!isTauriRuntime) return;
		setTrayAppsLoading(true);
		invoke<TrayAppInfo[]>("get_active_windows")
			.then((activeApps) =>
				setTrayApps(activeApps.filter((app) => app.name && app.path).slice(0, 15))
			)
			.catch(() => setTrayApps([]))
			.finally(() => setTrayAppsLoading(false));
		invoke<TrayAppInfo[]>("get_installed_apps")
			.then((apps) =>
				setInstalledTrayApps(
					apps
						.filter((app) => app.name && app.path)
						.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
				)
			)
			.catch(() => setInstalledTrayApps([]));
	};

	useEffect(() => {
		if (willowMode !== "tray" || !isTauriRuntime) return;
		let active = true;
		const missing = visibleTrayApps.filter((app) => !app.icon && !trayIcons[app.path]);
		if (missing.length === 0) return;
		Promise.all(
			missing.map(async (app) => {
				const icon = await invoke<string | null>("get_app_icon", {
					path: app.path,
					name: app.name,
					hwnd: app.hwnd || null
				}).catch(() => null);
				return icon ? ([app.path, icon] as const) : null;
			})
		).then((entries) => {
			if (!active) return;
			setTrayIcons((current) => ({
				...current,
				...Object.fromEntries(
					entries.filter((entry): entry is readonly [string, string] => !!entry)
				)
			}));
		});
		return () => {
			active = false;
		};
	}, [willowMode, visibleTrayApps, trayIcons]);
	const toggleWeatherPanel = (event: React.MouseEvent) => {
		event.stopPropagation();
		if (!settingsWeatherEnabled || temperature === null) return;
		setIsHovered(true);
		setWillowMode((current) => (current === "weather" ? "status" : "weather"));
	};
	const closeExpandedMusic = (event: React.MouseEvent) => {
		event.stopPropagation();
		manualMusicRef.current = false;
		setWillowMode("status");
	};

	// Window height is now kept constant to prevent rendering layout lag and sharp corners

	const lastScrollTime = useRef(0);
	const handleWheel = (e: React.WheelEvent) => {
		const target = e.target as HTMLElement;
		if (target.closest(".calendar-grid") || target.closest(".timer-column")) {
			return;
		}

		if (!isHovered) return;

		const now = Date.now();
		if (now - lastScrollTime.current < 250) return;

		// Use absolute values to detect horizontal swipe gestures on trackpad
		const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
		if (Math.abs(delta) < 5) return; // Ignore tiny movements

		// Music shifts position based on playing state.
		const musicBeforeStatus = isPlaying && mediaInfo.has_media && settingsMusicModeEnabled;
		const modes: WillowMode[] = musicBeforeStatus
			? ["command-center", "tray", "music", "status", "weather", "calendar"]
			: ["command-center", "tray", "status", "weather", "music", "calendar"];
		const availableModes = modes.filter((m) => {
			if (m === "music" && (!settingsMusicModeEnabled || !mediaInfo.has_media)) return false;
			if (m === "calendar" && !settingsCalendarEnabled) return false;
			if (m === "weather" && (!settingsWeatherEnabled || temperature === null)) return false;
			return true;
		});

		const currentIndex = availableModes.indexOf(willowMode);
		if (currentIndex === -1) return;

		if (delta > 0) {
			const nextIndex = (currentIndex + 1) % availableModes.length;
			const nextMode = availableModes[nextIndex];
			manualMusicRef.current = nextMode === "music";
			setWillowMode(nextMode);
			lastScrollTime.current = now;
		} else if (delta < 0) {
			const prevIndex = (currentIndex - 1 + availableModes.length) % availableModes.length;
			const prevMode = availableModes[prevIndex];
			manualMusicRef.current = prevMode === "music";
			setWillowMode(prevMode);
			lastScrollTime.current = now;
		}
	};

	// Timer state
	const [timerSeconds, setTimerSeconds] = useState(0);
	const [isTimerRunning, setIsTimerRunning] = useState(false);
	const [isTimerFinished, setIsTimerFinished] = useState(false);
	const [isEditingTimer, setIsEditingTimer] = useState(false);
	const [timerEditDigits, setTimerEditDigits] = useState("");
	const [lastDurationSeconds, setLastDurationSeconds] = useState(() => {
		const stored = parseInt(localStorage.getItem("willow-timer-last-duration") || "", 10);
		return Number.isFinite(stored) && stored > 0 ? stored : 25 * 60;
	});
	const timerInputRef = useRef<HTMLInputElement>(null);
	const timerEditActiveRef = useRef(false);
	const timerIntervalRef = useRef<any>(null);
	const prevTimerFinishedRef = useRef(false);

	const formatTimerTime = (totalSeconds: number) => {
		const mins = Math.floor(Math.abs(totalSeconds) / 60);
		const secs = Math.abs(totalSeconds) % 60;
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	const startTimer = (seconds: number) => {
		// Unlock audio here (user gesture) so the completion chime can play later.
		getTimerChimeCtx();
		timerEditActiveRef.current = false;
		setIsEditingTimer(false);
		setTimerSeconds(seconds);
		setLastDurationSeconds(seconds);
		localStorage.setItem("willow-timer-last-duration", String(seconds));
		setIsTimerRunning(true);
		setIsTimerFinished(false);
	};

	const resetTimer = () => {
		timerEditActiveRef.current = false;
		setIsEditingTimer(false);
		setIsTimerRunning(false);
		setTimerSeconds(0);
		setIsTimerFinished(false);
	};

	// Idle/finished play restarts the last duration; paused play resumes.
	const handlePrimaryTimerAction = () => {
		if (isEditingTimer) {
			commitTimerEdit(true);
		} else if (isTimerRunning) {
			setIsTimerRunning(false);
		} else if (timerSeconds > 0) {
			getTimerChimeCtx();
			setIsTimerRunning(true);
		} else {
			startTimer(lastDurationSeconds);
		}
	};

	// Clicking the big time turns it into a masked editor. Digits fill from the
	// right, so the colon never has to be typed.
	const beginTimerEdit = () => {
		if (isTimerRunning || isEditingTimer) return;
		if (isTimerFinished) resetTimer();
		const base = timerSeconds > 0 ? timerSeconds : lastDurationSeconds;
		setTimerEditDigits(timerSecondsToDigits(base));
		timerEditActiveRef.current = true;
		setIsEditingTimer(true);
	};

	const commitTimerEdit = (start: boolean) => {
		if (!timerEditActiveRef.current) return;
		timerEditActiveRef.current = false;
		setIsEditingTimer(false);
		const total = timerDigitsToSeconds(timerEditDigits);
		if (total === null) return;
		const base = timerSeconds > 0 ? timerSeconds : lastDurationSeconds;
		// A tap that changes nothing (e.g. paused timer) must not reset the state.
		if (!start && total === base) return;
		localStorage.setItem("willow-timer-last-duration", String(total));
		setLastDurationSeconds(total);
		setTimerSeconds(start ? total : 0);
		setIsTimerRunning(start);
		setIsTimerFinished(false);
		if (start) getTimerChimeCtx();
	};

	useEffect(() => {
		if (isEditingTimer) {
			timerInputRef.current?.focus();
			timerInputRef.current?.select();
		}
	}, [isEditingTimer]);

	const timerEditValid = timerDigitsToSeconds(timerEditDigits) !== null;

	const timerState: "idle" | "running" | "paused" | "finished" = isEditingTimer
		? "idle"
		: isTimerFinished
			? "finished"
			: isTimerRunning
				? "running"
				: timerSeconds > 0
					? "paused"
					: "idle";
	const timerDisplaySeconds =
		timerSeconds > 0 || isTimerFinished ? timerSeconds : lastDurationSeconds;
	const primaryTimerLabel = isTimerRunning
		? "Pausar"
		: timerSeconds > 0
			? "Continuar"
			: isTimerFinished
				? "Reiniciar"
				: "Iniciar";
	const timerEndTime =
		timerSeconds > 0 && !isTimerFinished
			? new Date(Date.now() + timerSeconds * 1000).toLocaleTimeString([], {
					hour: "2-digit",
					minute: "2-digit",
					hour12: !timeFormat24h
				})
			: null;

	// Split the display time into individual flip-clock digits. Keys are counted
	// from the right so existing digits keep their identity when minutes grow
	// from two digits to three. While editing, the same clock renders the digits
	// being typed so the layout never changes.
	const clockText = isEditingTimer
		? formatTimerDigits(timerEditDigits)
		: formatTimerTime(timerDisplaySeconds);
	const [clockMinutesText, clockSecondsText] = clockText.split(":");
	const clockMinutesPadded = clockMinutesText.padStart(2, "0");
	const clockCompact = clockMinutesPadded.length > 2;
	const minuteDigitItems = clockMinutesPadded
		.split("")
		.map((digit, i, arr) => ({ digit, key: `m${arr.length - i}` }));
	const secondDigitItems = clockSecondsText
		.split("")
		.map((digit, i, arr) => ({ digit, key: `s${arr.length - i}` }));

	useEffect(() => {
		if (isTimerRunning && timerSeconds > 0) {
			timerIntervalRef.current = setInterval(() => {
				setTimerSeconds((s) => s - 1);
			}, 1000);
		} else if (isTimerRunning && timerSeconds === 0) {
			setIsTimerRunning(false);
			setIsTimerFinished(true);
		}
		return () => {
			if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
		};
	}, [isTimerRunning, timerSeconds === 0]);

	// Completion moment: chime once and reveal the notch in peek mode.
	useEffect(() => {
		if (isTimerFinished && !prevTimerFinishedRef.current) {
			if (settingsTimerSoundEnabled) playTimerChime();
			if (notchMode === "peek") triggerEventPeek(6000);
		}
		prevTimerFinishedRef.current = isTimerFinished;
	}, [isTimerFinished, settingsTimerSoundEnabled, notchMode, triggerEventPeek]);

	const lastTrackRef = useRef<string | null>(null);
	const lastPlayingRef = useRef<boolean>(false);
	const manualMusicRef = useRef<boolean>(false);

	// Auto-switch to music mode only when a *new* track starts while playing,
	// or when playback transitions from paused to playing.
	useEffect(() => {
		const isNewTrackWhilePlaying = mediaInfo.title !== lastTrackRef.current && isPlaying;
		const justStartedPlaying = isPlaying && !lastPlayingRef.current;

		// Peek notch on media events (play start or track change)
		if (notchMode === "peek" && (isNewTrackWhilePlaying || justStartedPlaying)) {
			triggerEventPeek(3000);
		}

		// Only auto-switch if music mode is enabled
		if (
			settingsMusicModeEnabled &&
			mediaInfo.has_media &&
			isPlaying &&
			(willowMode === "status" || willowMode === "music") &&
			(isNewTrackWhilePlaying || justStartedPlaying)
		) {
			// Switch if compact notch display is enabled OR we are hovered
			if (settingsMusicCompactNotch || isHovered) {
				manualMusicRef.current = false;
				setWillowMode("music");
			}
		}

		lastTrackRef.current = mediaInfo.title;
		lastPlayingRef.current = isPlaying;
	}, [
		mediaInfo.has_media,
		isPlaying,
		mediaInfo.title,
		settingsMusicModeEnabled,
		settingsMusicCompactNotch,
		isHovered,
		willowMode,
		notchMode,
		triggerEventPeek
	]);

	// Auto-switch back from music if music stops for 5 seconds
	// Skip if user manually scrolled to music mode
	useEffect(() => {
		let timer: any;
		if (!isPlaying && willowMode === "music" && !manualMusicRef.current) {
			timer = setTimeout(() => {
				setWillowMode("status");
			}, 5000);
		}
		return () => clearTimeout(timer);
	}, [isPlaying, willowMode]);

	// Reset willow mode when calendar setting is disabled
	useEffect(() => {
		if (!settingsCalendarEnabled && willowMode === "calendar") {
			setWillowMode("status");
		}
	}, [settingsCalendarEnabled, willowMode]);

	// Reset willow mode when music mode setting is disabled
	useEffect(() => {
		if (!settingsMusicModeEnabled && willowMode === "music") {
			setWillowMode("status");
		}
	}, [settingsMusicModeEnabled, willowMode]);

	// Reset willow mode when compact notch display is disabled while collapsed
	useEffect(() => {
		if (!settingsMusicCompactNotch && willowMode === "music" && !isHovered) {
			setWillowMode("status");
		}
	}, [settingsMusicCompactNotch, willowMode, isHovered]);

	// Synchronize willow mode immediately when music settings are toggled and music is playing
	useEffect(() => {
		if (
			settingsMusicModeEnabled &&
			settingsMusicCompactNotch &&
			mediaInfo.has_media &&
			isPlaying &&
			willowMode === "status" &&
			!isHovered
		) {
			setWillowMode("music");
		}
	}, [
		settingsMusicModeEnabled,
		settingsMusicCompactNotch,
		mediaInfo.has_media,
		isPlaying,
		willowMode,
		isHovered
	]);

	// Update time
	useEffect(() => {
		const updateTime = () => {
			const now = new Date();
			setTime(
				now.toLocaleTimeString([], {
					hour: "2-digit",
					minute: "2-digit",
					hour12: !timeFormat24h
				})
			);
		};

		updateTime();
		const interval = setInterval(updateTime, 1000);

		return () => {
			clearInterval(interval);
		};
	}, [timeFormat24h]);

	// Battery API
	useEffect(() => {
		let battery: any = null;
		let cleanup: (() => void) | undefined;
		if (!deviceCapabilities.hasBattery) return;

		const initBattery = async () => {
			try {
				battery = await (navigator as any).getBattery();

				const updateBattery = () => {
					setBatteryLevel(Math.round(battery.level * 100));
					setIsCharging(battery.charging);
				};

				updateBattery();

				battery.addEventListener("levelchange", updateBattery);
				battery.addEventListener("chargingchange", updateBattery);

				cleanup = () => {
					battery.removeEventListener("levelchange", updateBattery);
					battery.removeEventListener("chargingchange", updateBattery);
				};
			} catch (e) {
				// Battery API not supported
			}
		};

		initBattery();
		return () => cleanup?.();
	}, [deviceCapabilities.hasBattery]);

	// Listen for Volume Changes
	useEffect(() => {
		const unlisten = listen<{ volume: number; is_muted: boolean }>("volume-change", (event) => {
			setVolume(event.payload.volume);
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	// Load wifi/bluetooth/volume/brightness state on mount
	useEffect(() => {
		invoke<boolean>("get_wifi_state")
			.then(setWifiEnabled)
			.catch(() => {});
		invoke<boolean>("get_bluetooth_state")
			.then(setBluetoothEnabled)
			.catch(() => {});
		if (deviceCapabilities.hasBattery) {
			invoke<boolean>("get_battery_saver_state")
				.then(setBatterySaverEnabled)
				.catch(() => {});
		}
		invoke<number>("get_volume")
			.then(setVolume)
			.catch(() => {});
		if (deviceCapabilities.hasBrightness) {
			invoke<number>("get_brightness")
				.then(setCurrentBrightness)
				.catch(() => {});
		}

		// Poll battery saver state every 5s (since we can't listen for changes)
		const interval = deviceCapabilities.hasBattery
			? setInterval(() => {
					invoke<boolean>("get_battery_saver_state")
						.then(setBatterySaverEnabled)
						.catch(() => {});
				}, 5000)
			: 0;
		return () => {
			if (interval) clearInterval(interval);
		};
	}, [deviceCapabilities.hasBattery, deviceCapabilities.hasBrightness]);

	// Poll system metrics for status widgets
	useEffect(() => {
		const fetchMetrics = () => {
			invoke<number>("get_cpu_usage")
				.then(setCpuUsage)
				.catch((e) => console.warn("CPU:", e));
			invoke<number>("get_ram_usage")
				.then(setRamUsage)
				.catch((e) => console.warn("RAM:", e));
			invoke<number>("get_disk_space")
				.then(setDiskSpace)
				.catch((e) => console.warn("Disk:", e));
			invoke<[number, number]>("get_network_speed")
				.then(([up, down]) => {
					setNetUpSpeed(up);
					setNetDownSpeed(down);
				})
				.catch(() => {});
		};
		fetchMetrics();
		const interval = setInterval(fetchMetrics, 3000);
		return () => clearInterval(interval);
	}, []);

	// Listen for brightness changes
	useEffect(() => {
		const unlisten = listen<{ brightness: number }>("brightness-change", (event) => {
			setCurrentBrightness(event.payload.brightness);
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	// Native Windows Media Controls - Listen for updates from background worker
	useEffect(() => {
		const unlisten = listen<MediaInfo>("media-update", (event) => {
			const info = event.payload;
			if (!info) return;

			setMediaInfo((prev) => {
				// Find if artwork changed by checking the first element
				const prevArt = prev.artwork?.[0];
				const nextArt = info.artwork?.[0];
				const artChanged = prevArt !== nextArt;

				if (
					prev.title === info.title &&
					prev.artist === info.artist &&
					prev.is_playing === info.is_playing &&
					prev.has_media === info.has_media &&
					!artChanged &&
					prev.position_ms === info.position_ms &&
					prev.duration_ms === info.duration_ms
				) {
					return prev;
				}

				// Update playing state separately for the hook triggers
				setIsPlaying(info.is_playing);

				if (info.artwork && info.artwork.length > 0) {
					const newArt = info.artwork[0];
					setAlbumArtUrl((prev) => {
						if (prev !== newArt) {
							setAlbumArtKey((k) => k + 1);
							return newArt;
						}
						return prev;
					});
				} else {
					setAlbumArtUrl(null);
				}

				return info;
			});
		});

		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	// Media controls via Tauri commands
	/* Unused saveAndBroadcast removed to fix TS build error */
	const togglePlayPause = useCallback(async () => {
		try {
			await invoke("media_play_pause");
			setIsPlaying(!isPlaying);
		} catch (e) {
			console.error("Failed to toggle play/pause:", e);
		}
	}, [isPlaying]);

	const skipNext = useCallback(async () => {
		try {
			await invoke("media_next");
		} catch (e) {
			console.error("Failed to skip next:", e);
		}
	}, []);

	const skipPrevious = useCallback(async () => {
		try {
			await invoke("media_previous");
		} catch (e) {
			console.error("Failed to skip previous:", e);
		}
	}, []);

	// Slide-push animation for prev/next buttons
	const prevFront = useAnimation();
	const prevBack = useAnimation();
	const nextFront = useAnimation();
	const nextBack = useAnimation();

	const animatePrev = useCallback(async () => {
		prevFront.set({ x: 0 });
		prevBack.set({ x: 30 });
		prevFront.start({ x: -30, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } });
		await prevBack.start({ x: 0, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } });
		skipPrevious();
	}, [skipPrevious, prevFront, prevBack]);

	const animateNext = useCallback(async () => {
		nextFront.set({ x: 0 });
		nextBack.set({ x: -30 });
		nextFront.start({ x: 30, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } });
		await nextBack.start({ x: 0, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } });
		skipNext();
	}, [skipNext, nextFront, nextBack]);

	const lastVolumeCallRef = useRef(0);
	const pendingVolumeCallRef = useRef<number | null>(null);

	const handleVolumeChange = useCallback((newVol: number) => {
		setVolume(newVol);

		if (pendingVolumeCallRef.current !== null) window.clearTimeout(pendingVolumeCallRef.current);
		const commit = () => {
			lastVolumeCallRef.current = Date.now();
			pendingVolumeCallRef.current = null;
			invoke("set_volume", { volume: newVol }).catch(console.error);
		};
		const remaining = 50 - (Date.now() - lastVolumeCallRef.current);
		if (remaining <= 0) commit();
		else pendingVolumeCallRef.current = window.setTimeout(commit, remaining);
	}, []);

	// Open WiFi settings
	const openWifiSettings = useCallback(async () => {
		try {
			await invoke("open_wifi_settings");
		} catch (e) {
			console.error("Failed to open WiFi settings:", e);
		}
	}, []);

	// WiFi toggle
	const toggleWifi = useCallback(async () => {
		const newState = !wifiEnabled;
		setWifiEnabled(newState);
		try {
			await invoke("set_wifi_state", { enabled: newState });
		} catch (e) {
			setWifiEnabled(!newState);
			console.error("Failed to toggle WiFi:", e);
		}
	}, [wifiEnabled]);

	// Bluetooth toggle
	const toggleBluetooth = useCallback(async () => {
		const newState = !bluetoothEnabled;
		setBluetoothEnabled(newState);
		try {
			await invoke("set_bluetooth_state", { enabled: newState });
		} catch (e) {
			setBluetoothEnabled(!newState);
			console.error("Failed to toggle Bluetooth:", e);
		}
	}, [bluetoothEnabled]);

	// Battery Saver - opens settings (no public API to toggle without admin)
	const openBatterySaverSettings = useCallback(async () => {
		try {
			await invoke("open_battery_saver_settings");
		} catch (e) {
			console.error("Failed to open Battery Saver settings:", e);
		}
	}, []);

	// Brightness change with throttling
	const lastBrightnessCallRef = useRef(0);
	const pendingBrightnessCallRef = useRef<number | null>(null);

	const handleBrightnessChange = useCallback((newVal: number) => {
		setCurrentBrightness(newVal);

		if (pendingBrightnessCallRef.current !== null) {
			window.clearTimeout(pendingBrightnessCallRef.current);
		}
		const commit = () => {
			lastBrightnessCallRef.current = Date.now();
			pendingBrightnessCallRef.current = null;
			invoke("set_brightness", { brightness: newVal }).catch(console.error);
		};
		const remaining = 50 - (Date.now() - lastBrightnessCallRef.current);
		if (remaining <= 0) commit();
		else pendingBrightnessCallRef.current = window.setTimeout(commit, remaining);
	}, []);

	// Open system tray (unhide taskbar and invoke Win+B)
	const openSystemTray = useCallback(async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!isTauriRuntime) return;
		try {
			await invoke("open_system_tray");
		} catch (e) {
			console.error("Failed to open system tray:", e);
		}
	}, []);

	const openTrayApp = useCallback(async (event: React.MouseEvent, app: TrayAppInfo) => {
		event.stopPropagation();
		if (!isTauriRuntime) return;
		try {
			if (app.hwnd) {
				await invoke("focus_window", { hwnd: app.hwnd });
			} else {
				await invoke("open_app", { appName: app.path });
			}
		} catch (error) {
			console.error("Não foi possível abrir o aplicativo:", error);
		}
	}, []);

	const openSettingsWindow = useCallback(async () => {
		if (!isTauriRuntime) {
			setBrowserSettingsOpen(true);
			return;
		}
		try {
			await invoke("open_settings_window");
		} catch (e) {
			console.error("Failed to open settings window:", e);
		}
	}, []);

	const handleWifiRightClick = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			openWifiSettings();
		},
		[openWifiSettings]
	);

	const toggleDockModeSetting = useCallback(
		async (e: React.MouseEvent) => {
			e.stopPropagation();
			const nextMode = dockMode === "fixed" ? "smart" : dockMode === "smart" ? "peek" : "fixed";
			setDockMode(nextMode);
			localStorage.setItem("willow-dock-mode", nextMode);
			invoke("save_setting", { key: "willow-dock-mode", value: nextMode }).catch(console.error);
			try {
				await invoke("change_dock_mode", { mode: nextMode });
			} catch (err) {
				console.error("Failed to change dock mode:", err);
			}
		},
		[dockMode]
	);

	const toggleNotchModeSetting = useCallback(
		async (e: React.MouseEvent) => {
			e.stopPropagation();
			const nextMode = notchMode === "fixed" ? "smart" : notchMode === "smart" ? "peek" : "fixed";
			setNotchMode(nextMode);
			localStorage.setItem("willow-notch-mode", nextMode);
			invoke("save_setting", { key: "willow-notch-mode", value: nextMode }).catch(console.error);
			try {
				await invoke("change_notch_mode", { mode: nextMode });
			} catch (err) {
				console.error("Failed to change notch mode:", err);
			}
		},
		[notchMode]
	);

	const handleBluetoothRightClick = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		invoke("open_bluetooth_settings");
	}, []);

	const toggleCalendarMode = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (isTimerFinished) {
			resetTimer();
			return;
		}
		if (!settingsCalendarEnabled) return;
		setIsHovered(true);

		setWillowMode((prev) => {
			if (prev === "calendar") {
				// Return to music mode if media is present and playing and music mode is enabled, otherwise status
				return settingsMusicModeEnabled && mediaInfo.has_media && isPlaying ? "music" : "status";
			}
			return "calendar";
		});
	};

	// Render a status widget by ID
	const renderStatusWidget = (id: string) => {
		switch (id) {
			case "weather":
				if (!settingsWeatherEnabled || temperature === null) return null;
				return (
					<button
						type="button"
						className="passive-feature weather-feature-button"
						key="weather"
						title={cityName ? `${weatherCondition}: ${cityName}` : weatherCondition}
						onClick={toggleWeatherPanel}
					>
						<WeatherIcon size={12} strokeWidth={2.2} />
						<span className="label">
							{temperature}°{tempUnit === "fahrenheit" ? "F" : "C"}
						</span>
					</button>
				);
			case "battery":
				if (!deviceCapabilities.hasBattery) return null;
				return (
					<div className="passive-feature" key="battery">
						<BatteryIcon
							charging={isCharging}
							level={batteryLevel}
							threshold={lowBatteryThreshold}
						/>
						<span className="label">{batteryLevel}%</span>
					</div>
				);
			case "cpu":
				return (
					<div className="passive-feature" key="cpu" title="Uso da CPU">
						<Cpu size={12} strokeWidth={2} />
						<span className="label">{cpuUsage}%</span>
					</div>
				);
			case "ram":
				return (
					<div className="passive-feature" key="ram" title="Uso da memória RAM">
						<MemoryStick size={12} strokeWidth={2} />
						<span className="label">{Math.round(ramUsage)}%</span>
					</div>
				);
			case "disk":
				return (
					<div className="passive-feature" key="disk" title="Espaço livre em disco">
						<HardDrive size={12} strokeWidth={2} />
						<span className="label">{diskSpace}GB</span>
					</div>
				);
			case "net":
				return (
					<div className="passive-feature" key="net" title="Velocidade da rede">
						<ArrowUpDown size={12} strokeWidth={2} />
						<span className="label">
							↑{formatBytes(netUpSpeed)} ↓{formatBytes(netDownSpeed)}
						</span>
					</div>
				);
			default:
				return null;
		}
	};

	const formatBytes = (bytes: number) => {
		if (bytes < 1024) return `${bytes}B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
		return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
	};

	// Music mode shows any time we have media info (playing or paused) and music mode setting is enabled
	const isMusicMode = mediaInfo.has_media && willowMode === "music" && settingsMusicModeEnabled;

	// Calculate width dynamically based on enabled features
	const getDynamicWidth = () => {
		const totalWidgets = [...statusWidgets.left, ...statusWidgets.right].filter(
			(id) => id !== "battery" || deviceCapabilities.hasBattery
		).length;
		if (isCalendarMode) return 480;
		if (willowMode === "weather" && isHovered) return 480;
		if (willowMode === "command-center" && isHovered) return Math.min(350 + totalWidgets * 36, 540);
		if (willowMode === "tray" && isHovered) return Math.min(390 + totalWidgets * 28, 540);
		if (willowMode === "status" && isHovered) {
			return Math.min(200 + totalWidgets * 50, 380);
		}
		if (isMusicMode && isHovered)
			return Math.min((mediaLayout === "compact" ? 356 : 396) + totalWidgets * 34, 560);
		if ((showPowerPulse || showLowBatteryPulse || showUpdatePulse) && !isHovered) return 200;

		let w = 140;
		if (isMusicMode) {
			if (settingsVisualizerEnabled && isPlaying) w += 30;
			if (settingsAlbumArtEnabled) w += 30;

			if (isHovered) {
				w += 60;
			}
		}

		return Math.min(w, 520);
	};

	const getDynamicHeight = () => {
		if (!isExpanded || !isVisible || isHidden) {
			return isImpacted ? 28.9 : 44.2;
		}
		// Sized to the calendar's week-row count plus the timer's fixed content.
		if (willowMode === "calendar") return calendarMonthRows >= 6 ? 305 : 273;
		if (willowMode === "weather") return isHovered ? 258 : 36;
		if (willowMode === "command-center") return isHovered ? 230 : 36;
		if (willowMode === "tray") return isHovered ? 286 : 36;
		if (willowMode === "status") return 36;
		if (isMusicMode && isHovered) {
			const hasProgressBar = (mediaInfo.duration_ms ?? 0) > 0;
			let h = mediaLayout === "compact" ? (hasProgressBar ? 152 : 136) : 140;
			if (mediaLayout === "compact") {
				if (compactVolumeExpanded) h += 36;
			}
			return h;
		}
		return 36;
	};

	const isCalendarMode = willowMode === "calendar";
	const isAttachedPanel = willowMode === "calendar" || willowMode === "weather";
	const formatWeatherClock = (value: string) => {
		if (!value) return "--:--";
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return "--:--";
		return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
	};

	// Close compact media player expansions when notch is unhovered or mode changes
	useEffect(() => {
		if (mediaLayout === "compact") {
			setCompactVolumeExpanded(false);
		}
	}, [isHovered, mediaLayout, willowMode]);

	return (
		<div
			className={`screen ${!isTauriRuntime ? "browser-preview-screen" : ""}`}
			style={{ overflow: "hidden" }}
		>
			{!isTauriRuntime && (
				<>
					<AiUsageIsland />
					<BrowserDockPreview onOpenSettings={openSettingsWindow} />
					{browserSettingsOpen && (
						<div className="browser-settings-preview" onClick={() => setBrowserSettingsOpen(false)}>
							<div
								className="browser-settings-frame-wrap"
								onClick={(event) => event.stopPropagation()}
							>
								<iframe src="/settings.html" title="Configurações do Willow" />
							</div>
						</div>
					)}
				</>
			)}
			{/* Cantos da tela (Top) */}
			<AnimatePresence>
				{areCornersVisible && settingsCornersEnabled && (
					<>
						<motion.div
							className="screen-corner top-left"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1, filter: "blur(0px)" }}
							exit={{ opacity: 0, filter: "blur(10px)" }}
						/>
						<motion.div
							className="screen-corner top-right"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1, filter: "blur(0px)" }}
							exit={{ opacity: 0, filter: "blur(10px)" }}
						/>
					</>
				)}
			</AnimatePresence>

			<div style={{ zoom: scale, width: "100%", display: "flex", justifyContent: "center" }}>
				<motion.div
					ref={willowRef}
					className={`willow ${isHovered ? "expanded" : ""} ${isImpacted ? "is-impacted" : ""}`}
					onMouseEnter={() => {
						setIsNotchHovered(true);
						setIsHovered(true);
						if (!isHovered && willowMode === "status") {
							setWillowMode(mediaInfo.has_media && isPlaying ? "music" : "status");
						}
					}}
					onMouseLeave={() => {
						setIsNotchHovered(false);
						setIsHovered(false);
						const targetMode =
							mediaInfo.has_media && isPlaying && settingsMusicCompactNotch ? "music" : "status";
						manualMusicRef.current = targetMode === "music";
						setWillowMode(targetMode);
					}}
					onWheel={handleWheel}
					initial={{
						y: 250,
						width: 30.6,
						height: 44.2,
						borderTopLeftRadius: 18,
						borderTopRightRadius: 18,
						borderBottomLeftRadius: 18,
						borderBottomRightRadius: 18,
						scaleX: 1,
						scaleY: 1,
						opacity: 0
					}}
					animate={{
						y: !isReady ? 250 : isVisible ? (isHidden ? -100 : 0) : -150,
						width: !isReady
							? 34
							: isExpanded && isVisible && !isHidden
								? getDynamicWidth()
								: isImpacted
									? 39.1
									: 30.6,
						height: !isReady ? 34 : getDynamicHeight(),
						opacity: isVisible ? 1 : 0,
						scaleX: 1,
						scaleY: 1,
						borderTopLeftRadius: isImpacted ? 0 : 18,
						borderTopRightRadius: isImpacted ? 0 : 18,
						borderBottomLeftRadius: isAttachedPanel ? 28 : 18,
						borderBottomRightRadius: isAttachedPanel ? 28 : 18,
						filter: isVisible ? "blur(0px)" : "blur(8px)",
						pointerEvents: isVisible ? "auto" : "none"
					}}
					onClick={(e) => {
						e.stopPropagation();
					}}
					style={{ originY: 0 }}
					transition={{
						width: { type: "spring", stiffness: 400, damping: 31 },
						height: { type: "spring", stiffness: 450, damping: 29 },
						y: { type: "spring", stiffness: 550, damping: 45, mass: 0.8, restDelta: 0.001 },
						opacity: { duration: 0.2 },
						borderTopLeftRadius: { type: "spring", stiffness: 1000, damping: 40 },
						borderTopRightRadius: { type: "spring", stiffness: 1000, damping: 40 },
						borderBottomLeftRadius: { type: "spring", stiffness: 1000, damping: 40 },
						borderBottomRightRadius: { type: "spring", stiffness: 1000, damping: 40 },
						default: { type: "spring", stiffness: 500, damping: 30, mass: 1 }
					}}
				>
					<AnimatePresence>
						{isMusicMode &&
							settingsAmbienceEnabled &&
							albumArtUrl &&
							isHovered &&
							!isCalendarMode && (
								<motion.div
									className="notch-ambient-glow"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									transition={{ duration: 0.15 }}
								>
									<AnimatePresence mode="wait">
										<motion.img
											key={albumArtUrl}
											src={albumArtUrl}
											alt=""
											draggable={false}
											initial={{ opacity: 0, scale: 1.1 }}
											animate={{ opacity: 1, scale: 1.8 }}
											exit={{ opacity: 0 }}
											transition={{ duration: 0.3 }}
										/>
									</AnimatePresence>
								</motion.div>
							)}
					</AnimatePresence>
					<AnimatePresence mode="wait">
						{isExpanded && (
							<motion.div
								key="willow-content"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.1 }}
								style={{
									width: "100%",
									height: "100%",
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									position: "relative",
									borderRadius: "inherit"
								}}
							>
								{/* Faster Waiting Transition Area */}
								<AnimatePresence mode="wait">
									{isHovered && isMusicMode && !isCalendarMode ? (
										<motion.div
											key="expanded-music"
											className="expanded-music-container"
											initial={{ opacity: 0, scale: 0.98 }}
											animate={{ opacity: 1, scale: 1 }}
											exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
											transition={{ type: "spring", stiffness: 500, damping: 30 }}
										>
											<div className="music-status-strip" aria-label="Indicadores do sistema">
												<button
													type="button"
													className="music-back-button"
													onClick={closeExpandedMusic}
													title="Fechar player expandido"
													aria-label="Fechar player expandido"
												>
													<ArrowLeft />
												</button>
												{[...statusWidgets.left, ...statusWidgets.right].map(renderStatusWidget)}
											</div>
											{mediaLayout === "compact" ? (
												<CompactMediaPlayer
													mediaInfo={mediaInfo}
													albumArtUrl={albumArtUrl}
													albumArtKey={albumArtKey}
													isPlaying={isPlaying}
													volume={volume}
													volumeExpanded={compactVolumeExpanded}
													onVolumeExpandedChange={setCompactVolumeExpanded}
													onTogglePlayPause={togglePlayPause}
													onVolumeChange={handleVolumeChange}
													prevFront={prevFront}
													prevBack={prevBack}
													nextFront={nextFront}
													nextBack={nextBack}
													onAnimatePrev={animatePrev}
													onAnimateNext={animateNext}
													onLayoutChange={changeMediaLayout}
												/>
											) : (
												<div className="compact-premium-layout">
													<div className="album-art-section">
														<motion.div
															className="premium-album-art"
															whileHover={{ scale: 1.05 }}
															whileTap={{ scale: 0.95 }}
															onClick={(e) => {
																e.stopPropagation();
																changeMediaLayout("compact");
															}}
															style={{ cursor: "pointer" }}
														>
															<AnimatePresence mode="wait" initial={false}>
																{albumArtUrl ? (
																	<motion.img
																		key={`art-${albumArtKey}`}
																		src={albumArtUrl}
																		alt="Art"
																		initial={{ rotateY: 90, opacity: 0 }}
																		animate={{ rotateY: 0, opacity: 1 }}
																		exit={{ rotateY: -90, opacity: 0 }}
																		transition={{ duration: 0.3, ease: "easeInOut" }}
																		style={{ width: "100%", height: "100%", objectFit: "cover" }}
																	/>
																) : (
																	<motion.div
																		key="placeholder"
																		className="art-placeholder-mini"
																		initial={{ rotateY: 90, opacity: 0 }}
																		animate={{ rotateY: 0, opacity: 1 }}
																		exit={{ rotateY: -90, opacity: 0 }}
																		transition={{ duration: 0.3, ease: "easeInOut" }}
																	>
																		<MusicNoteIcon size={32} className="music-placeholder-svg" />
																	</motion.div>
																)}
															</AnimatePresence>
														</motion.div>
													</div>

													<div className="metadata-controls-section-middle">
														<div className="track-header-row">
															<div className="track-info-middle">
																<TitleMarquee title={mediaInfo.title} />
																<span className="premium-artist">{mediaInfo.artist}</span>
															</div>
															<div className="header-visualizer-wrap">
																<div className="header-visualizer">
																	<Visualizer isPlaying={isPlaying} bars={5} height={18} />
																</div>
																<motion.button
																	className="classic-audio-output-btn"
																	onClick={(e) => {
																		e.stopPropagation();
																		invoke("open_sound_settings").catch(() => {});
																	}}
																	whileTap={{ scale: 0.9 }}
																	title="Saída de áudio"
																>
																	<HeadphonesIcon size={20} style={{ opacity: 0.5 }} />
																</motion.button>
															</div>
														</div>

														<div className="controls-row-sleek">
															<motion.button
																className="sleek-btn previous-btn"
																onClick={(e) => {
																	e.stopPropagation();
																	animatePrev();
																}}
																whileHover={{ scale: 1.2 }}
																whileTap={{ scale: 0.9 }}
																transition={{ type: "spring", stiffness: 400, damping: 25 }}
															>
																<div
																	style={{
																		position: "relative",
																		width: 32,
																		height: 16,
																		overflow: "hidden"
																	}}
																>
																	<motion.div
																		animate={prevBack}
																		style={{
																			position: "absolute",
																			inset: 0,
																			display: "flex",
																			alignItems: "center",
																			justifyContent: "center"
																		}}
																	>
																		<SkipBackIcon size={32} />
																	</motion.div>
																	<motion.div
																		animate={prevFront}
																		style={{
																			position: "absolute",
																			inset: 0,
																			display: "flex",
																			alignItems: "center",
																			justifyContent: "center"
																		}}
																	>
																		<SkipBackIcon size={32} />
																	</motion.div>
																</div>
															</motion.button>

															<motion.button
																className="sleek-btn play-pause-btn-floating"
																onClick={(e) => {
																	e.stopPropagation();
																	togglePlayPause();
																}}
																whileHover={{ scale: 1.2 }}
																whileTap={{ scale: 0.95 }}
																transition={{ type: "spring", stiffness: 400, damping: 25 }}
															>
																<AnimatePresence mode="wait" initial={false}>
																	<motion.div
																		key={isPlaying ? "pause" : "play"}
																		initial={{ opacity: 0, scale: 0.8 }}
																		animate={{ opacity: 1, scale: 1 }}
																		exit={{ opacity: 0, scale: 0.8 }}
																		transition={{ duration: 0.15 }}
																		style={{
																			display: "flex",
																			alignItems: "center",
																			justifyContent: "center"
																		}}
																	>
																		{isPlaying ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
																	</motion.div>
																</AnimatePresence>
															</motion.button>

															<motion.button
																className="sleek-btn next-btn"
																onClick={(e) => {
																	e.stopPropagation();
																	animateNext();
																}}
																whileHover={{ scale: 1.2 }}
																whileTap={{ scale: 0.9 }}
																transition={{ type: "spring", stiffness: 400, damping: 25 }}
															>
																<div
																	style={{
																		position: "relative",
																		width: 32,
																		height: 16,
																		overflow: "hidden"
																	}}
																>
																	<motion.div
																		animate={nextBack}
																		style={{
																			position: "absolute",
																			inset: 0,
																			display: "flex",
																			alignItems: "center",
																			justifyContent: "center"
																		}}
																	>
																		<SkipForwardIcon size={32} />
																	</motion.div>
																	<motion.div
																		animate={nextFront}
																		style={{
																			position: "absolute",
																			inset: 0,
																			display: "flex",
																			alignItems: "center",
																			justifyContent: "center"
																		}}
																	>
																		<SkipForwardIcon size={32} />
																	</motion.div>
																</div>
															</motion.button>
														</div>

														<div className="volume-slider-container">
															<VolumeLowIcon size={12} style={{ opacity: 0.5 }} />
															<div className="slider-track-premium">
																<input
																	type="range"
																	min="0"
																	max="1"
																	step="0.01"
																	value={volume}
																	onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
																	onPointerDown={(e) => e.stopPropagation()}
																	onClick={(e) => e.stopPropagation()}
																	className="premium-slider"
																/>
																<div
																	className="slider-progress-fill"
																	style={{ width: `${volume * 100}%` }}
																/>
															</div>
															<VolumeHighIcon size={14} style={{ opacity: 0.5 }} />
														</div>
													</div>
												</div>
											)}
										</motion.div>
									) : (
										<motion.div
											key="standard-view-group"
											initial={{ opacity: 0, y: -5 }}
											animate={{ opacity: 1, y: 0 }}
											exit={{ opacity: 0, y: 5, transition: { duration: 0.1 } }}
											transition={{ duration: 0.2 }}
											style={{ width: "100%" }}
										>
											<div className="main-row">
												<AnimatePresence mode="wait">
													{(showPowerPulse || showLowBatteryPulse || showUpdatePulse) &&
													!isHovered ? (
														showUpdatePulse ? (
															<motion.div
																key="update-pulse-view"
																initial={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
																animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
																exit={{ opacity: 0, scale: 1.05, filter: "blur(4px)" }}
																className="power-pulse-content"
															>
																<GreenDownArrowIcon />
																<span className="label" style={{ color: "#32D74B" }}>
																	Atualização disponível
																</span>
															</motion.div>
														) : (
															<motion.div
																key="pulse-view"
																initial={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
																animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
																exit={{ opacity: 0, scale: 1.05, filter: "blur(4px)" }}
																className="power-pulse-content"
															>
																{updateAvailable && <GreenDownArrowIcon />}
																<BatteryIcon
																	charging={isCharging}
																	level={batteryLevel}
																	threshold={lowBatteryThreshold}
																/>
																<span
																	className="label"
																	style={{ color: showLowBatteryPulse ? "#FF453A" : "inherit" }}
																>
																	{showLowBatteryPulse
																		? "Bateria fraca"
																		: isCharging
																			? "Carregando"
																			: "Usando bateria"}{" "}
																	• {batteryLevel}%
																</span>
															</motion.div>
														)
													) : (
														<motion.div
															key="standard-view"
															className="main-row-inner"
															initial={{ opacity: 0 }}
															animate={{ opacity: 1 }}
															exit={{ opacity: 0 }}
														>
															{/* Left: visualizer (music) or weather (command-center, calendar) */}
															<div className="side-content left">
																<div className="notch-side-tools">
																	{isHovered && (
																		<button
																			className={`notch-control-orb ${willowMode === "command-center" ? "active" : ""}`}
																			onClick={toggleControlCenter}
																			title="Abrir controles de som e brilho"
																		>
																			<VolumeLowIcon size={11} />
																		</button>
																	)}
																	{isMusicMode && settingsVisualizerEnabled && (
																		<AnimatePresence>
																			<motion.div
																				key="visualizer"
																				initial={{ scale: 0.8, opacity: 0 }}
																				animate={{ scale: 1, opacity: 1 }}
																				exit={{ scale: 0.8, opacity: 0 }}
																			>
																				<Visualizer isPlaying={isPlaying} />
																			</motion.div>
																		</AnimatePresence>
																	)}
																	{isHovered && statusWidgets.left.map(renderStatusWidget)}
																</div>
															</div>

															{/* Center - Time (always visible) */}
															<div className="time-center">
																<div className="time-flip-container" onClick={toggleCalendarMode}>
																	<AnimatePresence initial={false}>
																		{timerSeconds > 0 || isTimerFinished ? (
																			<motion.span
																				key="timer"
																				className={`time compact-timer ${isTimerFinished ? "timer-finished" : ""}`}
																				initial={{ rotateX: -90, opacity: 0 }}
																				animate={{ rotateX: 0, opacity: 1 }}
																				exit={{ rotateX: 90, opacity: 0 }}
																				transition={{ type: "spring", stiffness: 600, damping: 30 }}
																			>
																				{isTimerFinished && (
																					<BellRing
																						size={13}
																						strokeWidth={2.5}
																						className="timer-bell"
																					/>
																				)}
																				{formatTimerTime(timerSeconds)}
																			</motion.span>
																		) : (
																			<motion.span
																				key="clock"
																				className="time"
																				initial={{ rotateX: -90, opacity: 0 }}
																				animate={{ rotateX: 0, opacity: 1 }}
																				exit={{ rotateX: 90, opacity: 0 }}
																				transition={{ type: "spring", stiffness: 600, damping: 30 }}
																			>
																				{time}
																			</motion.span>
																		)}
																	</AnimatePresence>
																</div>
																{updateAvailable && showUpdateIndicator && (
																	<div className="update-dot" />
																)}
																<AnimatePresence>
																	{privacyActive && (
																		<motion.div
																			className="privacy-indicators"
																			initial={{ opacity: 0, scale: 0.4, x: -4 }}
																			animate={{ opacity: 1, scale: 1, x: 0 }}
																			exit={{ opacity: 0, scale: 0.4, x: -4 }}
																			transition={{ type: "spring", stiffness: 520, damping: 28 }}
																			title={
																				privacyState.microphone && privacyState.camera
																					? "Microfone e câmera em uso"
																					: privacyState.camera
																						? "Câmera em uso"
																						: "Microfone em uso"
																			}
																		>
																			{privacyState.microphone && (
																				<span className="privacy-dot microphone" />
																			)}
																			{privacyState.camera && (
																				<span className="privacy-dot camera" />
																			)}
																		</motion.div>
																	)}
																</AnimatePresence>
															</div>

															{/* Right: album art (music) or battery (command-center, calendar) */}
															<div className="side-content right">
																<div className="notch-side-tools">
																	{isMusicMode && settingsAlbumArtEnabled && (
																		<AnimatePresence mode="wait">
																			<motion.div
																				key="album-art"
																				className="album-art-glow-wrapper"
																				initial={{ opacity: 0, scale: 0.8 }}
																				animate={{ opacity: 1, scale: 1 }}
																				exit={{
																					opacity: 0,
																					y: -20,
																					scale: 0.8,
																					filter: "blur(8px)"
																				}}
																				transition={{ duration: 0.12 }}
																			>
																				{albumArtUrl && settingsCompactGlowEnabled && (
																					<img
																						src={albumArtUrl}
																						alt=""
																						className="album-art-glow-bg"
																						draggable={false}
																					/>
																				)}
																				<button
																					className={`album-art${isHovered ? " album-art-large" : ""}${!isPlaying ? " paused" : ""}`}
																					onClick={(e) => {
																						e.stopPropagation();
																						togglePlayPause();
																					}}
																					onDoubleClick={(e) => {
																						e.stopPropagation();
																						skipNext();
																					}}
																					onContextMenu={(e) => {
																						e.preventDefault();
																						e.stopPropagation();
																						skipPrevious();
																					}}
																				>
																					<div className="album-art-inner">
																						<AnimatePresence mode="wait" initial={false}>
																							{albumArtUrl ? (
																								<motion.img
																									key={`compact-art-${albumArtKey}`}
																									src={albumArtUrl}
																									alt="Art"
																									draggable={false}
																									initial={{ rotateY: 90, opacity: 0 }}
																									animate={{ rotateY: 0, opacity: 1 }}
																									exit={{ rotateY: -90, opacity: 0 }}
																									transition={{ duration: 0.25, ease: "easeInOut" }}
																									style={{
																										width: "100%",
																										height: "100%",
																										objectFit: "cover"
																									}}
																								/>
																							) : (
																								<motion.div
																									key="compact-placeholder"
																									className="album-art-placeholder"
																									initial={{ rotateY: 90, opacity: 0 }}
																									animate={{ rotateY: 0, opacity: 1 }}
																									exit={{ rotateY: -90, opacity: 0 }}
																									transition={{ duration: 0.25, ease: "easeInOut" }}
																								>
																									<MusicNoteIcon className="music-placeholder-svg-small" />
																								</motion.div>
																							)}
																						</AnimatePresence>
																						<div className="album-art-overlay">
																							<div className="control-icon-small">
																								{isPlaying ? <PauseIcon /> : <PlayIcon />}
																							</div>
																						</div>
																					</div>
																				</button>
																			</motion.div>
																		</AnimatePresence>
																	)}
																	{isHovered && statusWidgets.right.map(renderStatusWidget)}
																	{isHovered && (
																		<button
																			className={`notch-control-orb ${willowMode === "tray" ? "active" : ""}`}
																			onClick={toggleTrayPanel}
																			title="Abrir aplicativos ocultos"
																		>
																			<TrayIcon />
																		</button>
																	)}
																</div>
															</div>
														</motion.div>
													)}
												</AnimatePresence>
											</div>
										</motion.div>
									)}
								</AnimatePresence>

								{/* Command Center Panel */}
								<AnimatePresence>
									{willowMode === "command-center" && (
										<motion.div
											className="command-center-content-minimal"
											onClick={(e) => e.stopPropagation()}
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0, filter: "blur(4px)", transition: { duration: 0.1 } }}
											transition={{ type: "spring", stiffness: 400, damping: 30 }}
										>
											{/* Pills Grid */}
											<div className="cc-pills-grid">
												{/* Wi-Fi Pill */}
												<div
													className={`cc-pill-tile ${wifiEnabled ? "active" : ""}`}
													onClick={(e) => {
														e.stopPropagation();
														toggleWifi();
													}}
													onContextMenu={handleWifiRightClick}
													title="Clique para alternar. Use o botão direito para abrir as configurações"
												>
													<div className="cc-pill-icon-wrapper">
														<WifiIcon connected={wifiEnabled} />
													</div>
													<div className="cc-pill-info">
														<span className="cc-pill-title">Wi-Fi</span>
														<span className="cc-pill-status">
															{wifiEnabled ? "Conectado" : "Desligado"}
														</span>
													</div>
												</div>

												{/* Modo do dock Pill */}
												<div
													className={`cc-pill-tile ${dockMode === "fixed" ? "active" : ""}`}
													onClick={toggleDockModeSetting}
													title="Alternar modo do dock: Fixo, Inteligente ou Espiar"
												>
													<div className="cc-pill-icon-wrapper">
														<DockIcon />
													</div>
													<div className="cc-pill-info">
														<span className="cc-pill-title">Modo do dock</span>
														<span className="cc-pill-status">
															{dockMode === "fixed"
																? "Fixo"
																: dockMode === "smart"
																	? "Inteligente"
																	: "Espiar"}
														</span>
													</div>
												</div>

												{/* Bluetooth Pill */}
												<div
													className={`cc-pill-tile ${bluetoothEnabled ? "active" : ""}`}
													onClick={(e) => {
														e.stopPropagation();
														toggleBluetooth();
													}}
													onContextMenu={handleBluetoothRightClick}
													title="Clique para alternar. Use o botão direito para abrir as configurações"
												>
													<div className="cc-pill-icon-wrapper">
														<BluetoothIcon />
													</div>
													<div className="cc-pill-info">
														<span className="cc-pill-title">Bluetooth</span>
														<span className="cc-pill-status">
															{bluetoothEnabled ? "Ligado" : "Desligado"}
														</span>
													</div>
												</div>

												{/* Notch Mode Pill */}
												<div
													className={`cc-pill-tile ${notchMode === "fixed" ? "active" : ""}`}
													onClick={toggleNotchModeSetting}
													title="Alternar modo da ilha: Fixo, Inteligente ou Espiar"
												>
													<div className="cc-pill-icon-wrapper">
														<NotchIcon />
													</div>
													<div className="cc-pill-info">
														<span className="cc-pill-title">Modo da ilha</span>
														<span className="cc-pill-status">
															{notchMode === "fixed"
																? "Fixo"
																: notchMode === "smart"
																	? "Inteligente"
																	: "Espiar"}
														</span>
													</div>
												</div>
											</div>

											{/* Circular Actions Row */}
											<div className="cc-circular-actions-row">
												<button
													className={`cc-circular-btn ${dndActive ? "active" : ""}`}
													onClick={(e) => {
														e.stopPropagation();
														setDndActive((prev) => !prev);
													}}
													title={`Foco e não perturbe: ${dndActive ? "Ligado" : "Desligado"}`}
												>
													<MoonIcon />
												</button>
												{deviceCapabilities.hasBattery && (
													<button
														className={`cc-circular-btn ${batterySaverEnabled ? "active" : ""}`}
														onClick={(e) => {
															e.stopPropagation();
															openBatterySaverSettings();
														}}
														title={`Economia de energia: ${batterySaverEnabled ? "Ligada" : "Desligada"}. Clique para abrir as configurações`}
													>
														<BatterySaverIcon />
													</button>
												)}
												<button
													className="cc-circular-btn"
													onClick={(e) => {
														e.stopPropagation();
														openSystemTray(e);
													}}
													title="Bandeja do sistema"
												>
													<TrayIcon />
												</button>
												<button
													className="cc-circular-btn"
													onClick={(e) => {
														e.stopPropagation();
														invoke("open_notification_center");
													}}
													title="Central de notificações"
												>
													<BellIcon />
												</button>
												<button
													className="cc-circular-btn"
													onClick={(e) => {
														e.stopPropagation();
														openSettingsWindow();
													}}
													title="Configurações do Willow"
												>
													<SettingsIcon />
												</button>
												<button
													className="cc-circular-btn"
													onClick={(e) => {
														e.stopPropagation();
														invoke("restart_willow");
													}}
													title="Reiniciar Willow"
												>
													<ReloadIcon />
												</button>
											</div>

											{/* Classic Sliders Area */}
											<div className="cc-classic-sliders-area">
												{/* Volume Slider */}
												<div className="cc-classic-slider-row">
													<div className="cc-classic-slider-label">
														<VolumeLowIcon style={{ opacity: 0.5 }} />
														<span>Volume</span>
													</div>
													<div className="cc-classic-slider-track">
														<input
															type="range"
															min="0"
															max="1"
															step="0.01"
															value={volume}
															onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
															onPointerDown={(e) => e.stopPropagation()}
															onClick={(e) => e.stopPropagation()}
															className="cc-classic-input"
														/>
														<div
															className="cc-classic-fill"
															style={{ width: `${volume * 100}%` }}
														/>
													</div>
													<span className="cc-classic-percentage">{Math.round(volume * 100)}%</span>
												</div>

												{/* Brightness Slider */}
												{deviceCapabilities.hasBrightness && (
													<div className="cc-classic-slider-row">
														<div className="cc-classic-slider-label">
															<BrightnessLowIcon />
															<span>Brilho</span>
														</div>
														<div className="cc-classic-slider-track">
															<input
																type="range"
																min="0"
																max="100"
																step="1"
																value={currentBrightness}
																onChange={(e) => handleBrightnessChange(parseInt(e.target.value))}
																onPointerDown={(e) => e.stopPropagation()}
																onClick={(e) => e.stopPropagation()}
																className="cc-classic-input"
															/>
															<div
																className="cc-classic-fill"
																style={{ width: `${currentBrightness}%` }}
															/>
														</div>
														<span className="cc-classic-percentage">{currentBrightness}%</span>
													</div>
												)}
											</div>
										</motion.div>
									)}
								</AnimatePresence>

								{/* Aplicativos ativos */}
								<AnimatePresence>
									{willowMode === "tray" && (
										<motion.div
											className="tray-apps-content"
											onClick={(event) => event.stopPropagation()}
											initial={{ opacity: 0, y: -5, scale: 0.98 }}
											animate={{ opacity: 1, y: 0, scale: 1 }}
											exit={{ opacity: 0, y: -4, filter: "blur(4px)" }}
											transition={{ type: "spring", stiffness: 420, damping: 32 }}
										>
											<div className="tray-apps-head">
												<div>
													<strong>Central de aplicativos</strong>
													<span>Abra uma janela ativa ou pesquise qualquer aplicativo</span>
												</div>
											</div>

											<label className="tray-apps-search">
												<Search size={12} />
												<input
													type="search"
													value={traySearch}
													onChange={(event) => setTraySearch(event.target.value)}
													placeholder="Pesquisar aplicativos..."
													onClick={(event) => event.stopPropagation()}
												/>
											</label>

											<div className="tray-apps-section-title">
												{traySearch.trim() ? "Resultados" : "Janelas abertas"}
											</div>
											<div className="tray-apps-grid">
												{trayAppsLoading ? (
													<div className="tray-apps-message">Carregando aplicativos...</div>
												) : visibleTrayApps.length ? (
													visibleTrayApps.map((app) => (
														<button
															key={`${app.path}-${app.hwnd || app.name}`}
															aria-label={app.name}
															onClick={(event) => openTrayApp(event, app)}
														>
															{app.icon || trayIcons[app.path] ? (
																<img src={app.icon || trayIcons[app.path]} alt="" />
															) : (
																<span>{app.name.slice(0, 1).toUpperCase()}</span>
															)}
															<i>{app.name}</i>
															{!traySearch.trim() && <b className="tray-app-running-dot" />}
														</button>
													))
												) : (
													<div className="tray-apps-message">
														{traySearch.trim()
															? "Nenhum aplicativo encontrado."
															: "Nenhuma janela aberta encontrada."}
													</div>
												)}
											</div>

											<div className="tray-quick-actions">
												<button type="button" onClick={openSystemTray}>
													<TrayIcon />
													<span>Bandeja do Windows</span>
												</button>
												<button
													type="button"
													onClick={(event) => {
														event.stopPropagation();
														invoke("open_notification_center");
													}}
												>
													<BellIcon />
													<span>Notificações</span>
												</button>
												<button
													type="button"
													onClick={(event) => {
														event.stopPropagation();
														openSettingsWindow();
													}}
												>
													<SettingsIcon />
													<span>Configurações</span>
												</button>
											</div>
										</motion.div>
									)}
								</AnimatePresence>

								{/* Clima detalhado */}
								<AnimatePresence>
									{willowMode === "weather" && settingsWeatherEnabled && (
										<motion.div
											className="weather-details-content"
											onClick={(event) => event.stopPropagation()}
											initial={{ opacity: 0, y: -8, filter: "blur(5px)" }}
											animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
											exit={{ opacity: 0, y: -5, filter: "blur(5px)" }}
											transition={{ type: "spring", stiffness: 420, damping: 32 }}
										>
											<div className="weather-details-header">
												<div className="weather-current-icon">
													<WeatherIcon size={34} strokeWidth={1.7} />
												</div>
												<div className="weather-current-copy">
													<div className="weather-location">
														<MapPin size={10} />
														<span>{cityName || "Localização atual"}</span>
													</div>
													<strong>
														{temperature ?? "--"}°
														<small>{tempUnit === "fahrenheit" ? "F" : "C"}</small>
													</strong>
													<span>{weatherCondition || "Atualizando clima"}</span>
												</div>
												<button
													type="button"
													className={`weather-refresh-button ${isWeatherRefreshing ? "refreshing" : ""}`}
													onClick={() => refreshWeather()}
													title="Atualizar clima"
												>
													<RefreshCw size={13} />
												</button>
											</div>

											{weatherDetails ? (
												<>
													<div className="weather-metrics-grid">
														<div>
															<Thermometer size={13} />
															<span>Sensação</span>
															<strong>{weatherDetails.apparentTemperature}°</strong>
														</div>
														<div>
															<Droplets size={13} />
															<span>Umidade</span>
															<strong>{weatherDetails.humidity}%</strong>
														</div>
														<div>
															<Wind size={13} />
															<span>Vento</span>
															<strong>{weatherDetails.windSpeed} km/h</strong>
														</div>
														<div>
															<Umbrella size={13} />
															<span>Chuva</span>
															<strong>{weatherDetails.precipitation}%</strong>
														</div>
													</div>

													<div className="weather-sun-times">
														<span>
															<Sunrise size={12} /> Nascer{" "}
															{formatWeatherClock(weatherDetails.sunrise)}
														</span>
														<span>
															<Sunset size={12} /> Pôr {formatWeatherClock(weatherDetails.sunset)}
														</span>
													</div>

													<div className="weather-forecast-row">
														{weatherDetails.forecast.map((day, index) => {
															const ForecastIcon = day.icon;
															const label =
																index === 0
																	? "Hoje"
																	: new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
																			.format(new Date(`${day.date}T12:00:00`))
																			.replace(".", "");
															return (
																<div key={day.date} title={day.condition}>
																	<span>{label}</span>
																	<ForecastIcon size={15} strokeWidth={1.8} />
																	<strong>
																		{day.maximum}° <small>{day.minimum}°</small>
																	</strong>
																</div>
															);
														})}
													</div>
												</>
											) : (
												<div className="weather-details-loading">Consultando previsão...</div>
											)}
										</motion.div>
									)}
								</AnimatePresence>

								{/* Calendário e temporizador Split View */}
								<AnimatePresence>
									{settingsCalendarEnabled && isCalendarMode && (
										<motion.div
											className="calendar-timer-content split-view"
											onClick={(e) =>
												e.stopPropagation()
											} /* Block mode switches when clicking inside */
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0, filter: "blur(4px)", transition: { duration: 0.1 } }}
											transition={{ type: "spring", stiffness: 400, damping: 30 }}
										>
											<div className="calendar-column">
												<Calendar />
											</div>

											<div className="timer-column">
												<div className={`timer-section-new state-${timerState}`}>
													<div className="timer-main">
														<div className="timer-status">
															{isEditingTimer
																? "Defina a duração"
																: isTimerFinished
																	? "Tempo encerrado"
																	: timerEndTime
																		? `${timerState === "paused" ? "Pausado · " : ""}termina ${timerEndTime}`
																		: "Clique para editar"}
														</div>

														<div className={`timer-clock-row ${isEditingTimer ? "editing" : ""}`}>
															<div
																className={`timer-clock ${isEditingTimer && !timerEditValid ? "invalid" : ""}`}
																onClick={beginTimerEdit}
																title={
																	isTimerRunning ? undefined : "Clique para definir uma duração"
																}
															>
																{minuteDigitItems.map(({ digit, key }) => (
																	<RollDigit key={key} value={digit} compact={clockCompact} />
																))}
																<span className="timer-colon">:</span>
																{secondDigitItems.map(({ digit, key }) => (
																	<RollDigit key={key} value={digit} compact={clockCompact} />
																))}
															</div>
															<span className="timer-edit-underline" aria-hidden="true" />
															{isEditingTimer && (
																<input
																	ref={timerInputRef}
																	className="timer-edit-input"
																	type="text"
																	inputMode="numeric"
																	aria-label="Definir duração do temporizador"
																	value={formatTimerDigits(timerEditDigits)}
																	onChange={(e) =>
																		setTimerEditDigits(
																			e.target.value.replace(/\D/g, "").slice(0, 5)
																		)
																	}
																	onKeyDown={(e) => {
																		if (e.key === "Enter") commitTimerEdit(true);
																	}}
																	onBlur={() => commitTimerEdit(false)}
																	onWheel={(e) => e.stopPropagation()}
																/>
															)}
														</div>
													</div>

													<div className="timer-controls-row">
														<span className="timer-controls-spacer" aria-hidden="true" />
														<button
															onClick={handlePrimaryTimerAction}
															onMouseDown={(e) => e.preventDefault()}
															className="timer-btn-play"
															title={primaryTimerLabel}
														>
															{isTimerRunning ? (
																<Pause size={14} strokeWidth={2} fill="currentColor" />
															) : (
																<Play size={14} strokeWidth={2} fill="currentColor" />
															)}
															<span>{primaryTimerLabel}</span>
														</button>
														<button
															onClick={resetTimer}
															className="timer-btn-reset"
															disabled={timerSeconds === 0 && !isTimerFinished}
															title="Redefinir"
														>
															<RotateCcw size={14} strokeWidth={2.5} />
														</button>
													</div>

													<div className="timer-preset-group">
														{[5, 15, 25, 50].map((mins) => (
															<button
																key={mins}
																onClick={() => startTimer(mins * 60)}
																className={`timer-preset-segment ${lastDurationSeconds === mins * 60 && !isTimerFinished ? "active" : ""}`}
															>
																{mins}m
															</button>
														))}
													</div>
												</div>
											</div>
										</motion.div>
									)}
								</AnimatePresence>
							</motion.div>
						)}
					</AnimatePresence>
				</motion.div>
			</div>
		</div>
	);
}

function Calendar() {
	const [date] = useState(new Date());

	const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
	const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

	const currentMonth = date.getMonth();
	const currentYear = date.getFullYear();
	const monthName = date.toLocaleString("default", { month: "long" });

	const totalDays = daysInMonth(currentYear, currentMonth);
	const startDay = firstDayOfMonth(currentYear, currentMonth);
	const days = [];

	// Padding for start of month
	for (let i = 0; i < startDay; i++) {
		days.push(<div key={`empty-${i}`} className="calendar-day empty" />);
	}

	// Actual days
	const today = new Date().getDate();
	const isCurrentMonth =
		new Date().getMonth() === currentMonth && new Date().getFullYear() === currentYear;

	for (let i = 1; i <= totalDays; i++) {
		days.push(
			<div key={i} className={`calendar-day ${isCurrentMonth && i === today ? "today" : ""}`}>
				{i}
			</div>
		);
	}

	return (
		<div className="calendar-container">
			<div className="calendar-header">
				<span className="month-year">
					{monthName} {currentYear}
				</span>
			</div>
			<div className="calendar-grid">
				{["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
					<div key={`${d}-${i}`} className="day-name">
						{d}
					</div>
				))}
				{days}
			</div>
		</div>
	);
}

function BluetoothIcon() {
	return (
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M6.5 6.5l11 11L12 23V1l5.5 5.5-11 11" />
		</svg>
	);
}

function SettingsIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ opacity: 0.9 }}
		>
			<circle cx="12" cy="12" r="3" />
			<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
		</svg>
	);
}

function BrightnessLowIcon() {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ opacity: 0.5 }}
		>
			<circle cx="12" cy="12" r="5" fill="currentColor" />
		</svg>
	);
}

function MoonIcon() {
	return (
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
		</svg>
	);
}

function DockIcon() {
	return (
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<rect x="2" y="14" width="20" height="8" rx="2" />
			<line x1="6" y1="18" x2="6.01" y2="18" strokeWidth="3.5" strokeLinecap="round" />
			<line x1="10" y1="18" x2="10.01" y2="18" strokeWidth="3.5" strokeLinecap="round" />
			<line x1="14" y1="18" x2="14.01" y2="18" strokeWidth="3.5" strokeLinecap="round" />
			<line x1="18" y1="18" x2="18.01" y2="18" strokeWidth="3.5" strokeLinecap="round" />
		</svg>
	);
}

function NotchIcon() {
	return (
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M4 3h16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
			<path d="M9 9v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V9" />
		</svg>
	);
}

function BellIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9z" />
			<path d="M13.73 21a2 2 0 0 1-3.46 0" />
		</svg>
	);
}

function ReloadIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
		</svg>
	);
}

function BatterySaverIcon() {
	return (
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<rect x="2" y="7" width="16" height="10" rx="2" />
			<path d="M22 11v2" />
			<path d="M6 12h4l2-3v6l-2-3H6" />
		</svg>
	);
}

export default App;
