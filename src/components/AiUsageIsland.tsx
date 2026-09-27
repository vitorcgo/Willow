import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { RefreshCw } from "lucide-react";
import type { ProviderUsage, UsageWindow } from "../types/aiUsage";
import "./AiUsageIsland.css";
import { useSettingsSync } from "../hooks/useSettingsSync";

const PROVIDERS = [
	{ id: "claude", name: "Claude", color: "#df9a68" },
	{ id: "codex", name: "Codex", color: "#72a6ff" },
	{ id: "cursor", name: "Cursor", color: "#eeeeee" },
	{ id: "grok", name: "Grok", color: "#b6c4d8" },
	{ id: "opencode", name: "OpenCode", color: "#9de374" },
	{ id: "antigravity", name: "Antigravity", color: "#c998ff" },
	{ id: "glm", name: "GLM", color: "#67d8ca" }
];

function ProviderLogo({ id }: { id: string }) {
	const paths: Record<string, string> = {
		claude:
			"M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z",
		codex:
			"M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.947 5.946 5.947.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z",
		cursor:
			"M22.106 5.68L12.5.135a.998.998 0 00-.998 0L1.893 5.68a.84.84 0 00-.419.726v11.186c0 .3.16.577.42.727l9.607 5.547a.999.999 0 00.998 0l9.608-5.547a.84.84 0 00.42-.727V6.407a.84.84 0 00-.42-.726zm-.603 1.176L12.228 22.92c-.063.108-.228.064-.228-.061V12.34a.59.59 0 00-.295-.51l-9.11-5.26c-.107-.062-.063-.228.062-.228h18.55c.264 0 .428.286.296.514z",
		grok: "M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815",
		opencode: "M16 6H8v12h8V6zm4 16H4V2h16v20z",
		antigravity:
			"M21.751 22.607c1.34 1.005 3.35.335 1.508-1.508C17.73 15.74 18.904 1 12.037 1 5.17 1 6.342 15.74.815 21.1c-2.01 2.009.167 2.511 1.507 1.506 5.192-3.517 4.857-9.714 9.715-9.714 4.857 0 4.522 6.197 9.714 9.715z",
		glm: "M12.105 2L9.927 4.953H.653L2.83 2h9.276zM23.254 19.048L21.078 22h-9.242l2.174-2.952h9.244zM24 2L9.264 22H0L14.736 2H24z"
	};
	return (
		<svg className="ai-provider-logo" viewBox="0 0 24 24" aria-hidden="true">
			<path d={paths[id]} />
		</svg>
	);
}

const browserPreview: ProviderUsage[] = [
	{
		id: "codex",
		name: "Codex",
		status: "ok",
		note: "Plano local",
		fetchedAt: Date.now(),
		working: true,
		windows: [
			{
				id: "session",
				label: "Sessão atual",
				used: 0.28,
				resetsAt: Date.now() + 2.4 * 60 * 60 * 1000
			},
			{
				id: "week",
				label: "Limite semanal",
				used: 0.46,
				resetsAt: Date.now() + 4 * 24 * 60 * 60 * 1000
			}
		]
	},
	{
		id: "claude",
		name: "Claude",
		status: "ok",
		note: "Conta conectada",
		fetchedAt: Date.now(),
		working: false,
		windows: [
			{ id: "session", label: "Sessão atual", used: 0.61, resetsAt: Date.now() + 54 * 60 * 1000 }
		]
	}
];

function remaining(window?: UsageWindow) {
	return window ? Math.max(0, Math.round((1 - window.used) * 100)) : null;
}

function resetText(timestamp: number | null) {
	if (!timestamp) return "Reinício não informado";
	const minutes = Math.max(0, Math.ceil((timestamp - Date.now()) / 60000));
	if (minutes < 60) return `Reinicia em ${minutes} min`;
	const hours = Math.ceil(minutes / 60);
	if (hours < 48) return `Reinicia em ${hours} h`;
	return `Reinicia em ${Math.ceil(hours / 24)} dias`;
}

export function AiUsageIsland() {
	const isTauriRuntime = "__TAURI_INTERNALS__" in window;
	const [readings, setReadings] = useState<ProviderUsage[]>(isTauriRuntime ? [] : browserPreview);
	const [selectedId, setSelectedId] = useState("claude");
	const [cardOpen, setCardOpen] = useState(false);
	const [islandOpen, setIslandOpen] = useState(false);
	const [loading, setLoading] = useState(isTauriRuntime);
	const [mode, setMode] = useState(() => localStorage.getItem("willow-ai-mode") || "smart");
	const pillRef = useRef<HTMLDivElement>(null);
	const cardRef = useRef<HTMLDivElement>(null);

	useSettingsSync({ "willow-ai-mode": setMode });

	const refresh = async () => {
		if (!isTauriRuntime) return;
		setLoading(true);
		try {
			setReadings(await invoke<ProviderUsage[]>("get_ai_usage"));
		} catch {
			setReadings([]);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (!isTauriRuntime) return;
		invoke<Record<string, string>>("load_settings")
			.then((settings) => {
				const saved = settings["willow-ai-mode"];
				if (saved) setMode(String(saved));
			})
			.catch(() => {});
		const initial = window.setTimeout(refresh, 1500);
		const timer = window.setInterval(refresh, 5 * 60 * 1000);
		return () => {
			window.clearTimeout(initial);
			window.clearInterval(timer);
		};
	}, []);

	useEffect(() => {
		if (!isTauriRuntime) return;
		const unlisten = listen<boolean>("ai-edge-hover", (event) => {
			if (mode !== "smart") return;
			setIslandOpen(event.payload);
			if (!event.payload) setCardOpen(false);
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, [isTauriRuntime, mode]);

	useEffect(() => {
		if (mode === "fixed") setIslandOpen(true);
		if (mode === "hidden") {
			setIslandOpen(false);
			setCardOpen(false);
		}
	}, [mode]);

	useEffect(() => {
		if (!isTauriRuntime) return;
		invoke("set_ai_usage_state", { open: islandOpen, cardOpen }).catch(() => {});

		const reportBounds = () => {
			if (!islandOpen || !pillRef.current) {
				invoke("update_ai_usage_rect", { rect: null }).catch(() => {});
				return;
			}
			const elements = [pillRef.current, cardOpen ? cardRef.current : null].filter(
				(element): element is HTMLDivElement => Boolean(element)
			);
			const boxes = elements.map((element) => element.getBoundingClientRect());
			const left = Math.min(...boxes.map((box) => box.left));
			const top = Math.min(...boxes.map((box) => box.top));
			const right = Math.max(...boxes.map((box) => box.right));
			const bottom = Math.max(...boxes.map((box) => box.bottom));
			invoke("update_ai_usage_rect", {
				rect: { x: left, y: top, width: right - left, height: bottom - top }
			}).catch(() => {});
		};

		const frame = window.requestAnimationFrame(reportBounds);
		const observer = new ResizeObserver(reportBounds);
		if (pillRef.current) observer.observe(pillRef.current);
		if (cardRef.current) observer.observe(cardRef.current);
		return () => {
			window.cancelAnimationFrame(frame);
			observer.disconnect();
		};
	}, [isTauriRuntime, islandOpen, cardOpen]);

	const providers = useMemo(
		() =>
			PROVIDERS.flatMap((provider) => {
				const reading = readings.find((item) => item.id === provider.id);
				if (reading) return [reading];
				if (provider.id !== "claude" && provider.id !== "codex") return [];
				return [
					{
						...provider,
						status: "none",
						note: "Conta não detectada",
						fetchedAt: 0,
						windows: [],
						working: false
					}
				];
			}),
		[readings]
	);
	const selected = providers.find((provider) => provider.id === selectedId) || providers[0];

	if (mode === "hidden") return null;

	return (
		<div
			className={`ai-edge-surface ${islandOpen ? "expanded" : "collapsed"}`}
			onMouseEnter={() => mode !== "hidden" && setIslandOpen(true)}
			onMouseLeave={() => {
				setCardOpen(false);
				if (mode === "smart") setIslandOpen(false);
			}}
		>
			<div className="ai-edge-sensor" aria-hidden="true" />
			<div ref={pillRef} className="ai-edge-pill" aria-label="Uso de inteligência artificial">
				{providers.map((provider) => {
					const value = remaining(provider.windows[0]);
					const circumference = 2 * Math.PI * 18;
					const dash = value === null ? 0 : circumference * (value / 100);
					const color = PROVIDERS.find((item) => item.id === provider.id)?.color || "#8db8ff";
					return (
						<button
							key={provider.id}
							className={`ai-edge-cell ${provider.status === "none" ? "dim" : ""}`}
							onMouseEnter={() => {
								setSelectedId(provider.id);
								setCardOpen(true);
							}}
							onClick={() => {
								setSelectedId(provider.id);
								setCardOpen(true);
							}}
							title={provider.name}
						>
							<span className="ai-edge-ring">
								<svg viewBox="0 0 44 44" aria-hidden="true">
									<circle className="ai-edge-track" cx="22" cy="22" r="18" />
									<circle
										className="ai-edge-value"
										cx="22"
										cy="22"
										r="18"
										style={{ stroke: color, strokeDasharray: `${dash} ${circumference}` }}
									/>
								</svg>
								<span>
									<ProviderLogo id={provider.id} />
								</span>
								{provider.working && <i />}
							</span>
							<small>{value === null ? "••" : `${value}%`}</small>
						</button>
					);
				})}
			</div>

			<div ref={cardRef} className={`ai-edge-card ${cardOpen ? "show" : ""}`}>
				<div className="ai-edge-card-head">
					<div>
						<strong>{selected.name}</strong>
						<span>{selected.working ? "Trabalhando agora" : selected.note}</span>
					</div>
					<button onClick={refresh} disabled={loading || !isTauriRuntime} title="Atualizar limites">
						<RefreshCw size={13} className={loading ? "spinning" : ""} />
					</button>
				</div>

				{selected.windows.length ? (
					<div className="ai-edge-windows">
						{selected.windows.map((window) => {
							const value = remaining(window) || 0;
							return (
								<div className="ai-edge-window" key={window.id}>
									<div>
										<b>{window.label}</b>
										<span>{resetText(window.resetsAt)}</span>
									</div>
									<div className="ai-edge-meter">
										<i style={{ width: `${value}%` }} />
									</div>
									<small>{value}% disponível</small>
								</div>
							);
						})}
					</div>
				) : (
					<p className="ai-edge-empty">
						{selected.note || "Nenhum limite disponível para esta conta."}
					</p>
				)}
			</div>
			<div className={`ai-edge-tail ${cardOpen ? "show" : ""}`} />
		</div>
	);
}
