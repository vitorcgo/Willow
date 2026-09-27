import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { motion, AnimatePresence } from "framer-motion";
import {
	ArrowLeft,
	ArrowRight,
	BookOpenText,
	CalendarDays,
	Check,
	ChevronLeft,
	ChevronRight,
	CloudMoon,
	MoonStar,
	Plus,
	Printer,
	Redo2,
	Sparkles,
	Trash2,
	Undo2,
	X
} from "lucide-react";
import { initTheme } from "./theme";
import "./Journal.css";

type DayPeriod = { morning: string; afternoon: string; night: string };
type Habit = { id: string; name: string; days: Record<string, boolean> };
type JournalData = {
	days: Record<string, string>;
	week: Record<string, DayPeriod>;
	diary: Record<string, string>;
	diaryKeys: Record<string, string>;
	sleep: Record<string, number>;
	habits: Habit[];
};

const WEEK_DAYS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
const DEFAULT_HABITS = ["Cafeína", "Muay Thai", "Estudar", "Trabalhar", "Presencial", "Higiene"];
const KEYS = [
	"☐ Tarefa",
	"☑ Em andamento",
	"■ Completa",
	"⊟ Reagendada",
	"☒ Cancelada",
	"⟍ Em aguardo",
	"⟋ Importante",
	"★ Prioridade",
	"N Nota",
	"• To Do",
	"? Dúvida",
	"💡 Ideia",
	"☁ Memória",
	"⊚ Prazo final"
];

function emptyData(): JournalData {
	return {
		days: {},
		week: Object.fromEntries(
			WEEK_DAYS.map((day) => [day, { morning: "", afternoon: "", night: "" }])
		),
		diary: {},
		diaryKeys: {},
		sleep: {},
		habits: DEFAULT_HABITS.map((name, index) => ({ id: `default-${index}`, name, days: {} }))
	};
}

function normalizeData(value: Partial<JournalData> | null): JournalData {
	const fallback = emptyData();
	if (!value) return fallback;
	return {
		days: value.days || {},
		week: { ...fallback.week, ...(value.week || {}) },
		diary: value.diary || {},
		diaryKeys: value.diaryKeys || {},
		sleep: value.sleep || {},
		habits: Array.isArray(value.habits) ? value.habits : fallback.habits
	};
}

function monthKey(date: Date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(date: Date) {
	return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function monthCells(date: Date) {
	const count = daysInMonth(date);
	const offset = (new Date(date.getFullYear(), date.getMonth(), 1).getDay() + 6) % 7;
	return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
}

function cloneData(data: JournalData): JournalData {
	return structuredClone(data);
}

export default function Journal() {
	const now = useMemo(() => new Date(), []);
	const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
	const [selectedDay, setSelectedDay] = useState(now.getDate());
	const [data, setData] = useState<JournalData>(emptyData);
	const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
	const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
	const [history, setHistory] = useState<JournalData[]>([]);
	const [historyIndex, setHistoryIndex] = useState(-1);
	const [newHabit, setNewHabit] = useState("");
	const [flow, setFlow] = useState<{
		id: number;
		x: number;
		y: number;
		target: "dock" | "island";
		label: string;
	} | null>(null);
	const loadSequence = useRef(0);

	useEffect(() => initTheme(), []);

	const key = monthKey(month);
	const dayKey = String(selectedDay);
	const count = daysInMonth(month);
	const cells = useMemo(() => monthCells(month), [month]);

	useEffect(() => {
		const sequence = ++loadSequence.current;
		setLoadedMonth(null);
		invoke<Partial<JournalData> | null>("journal_load_month", { month: key })
			.then((saved) => {
				if (sequence !== loadSequence.current) return;
				const next = normalizeData(saved);
				setData(next);
				setHistory([cloneData(next)]);
				setHistoryIndex(0);
				setSelectedDay((current) => Math.min(current, daysInMonth(month)));
				setLoadedMonth(key);
				setSaveState("saved");
			})
			.catch(() => setSaveState("error"));
	}, [key, month]);

	useEffect(() => {
		if (loadedMonth !== key) return;
		setSaveState("saving");
		const timer = window.setTimeout(() => {
			invoke("journal_save_month", { month: key, data })
				.then(() => setSaveState("saved"))
				.catch(() => setSaveState("error"));
		}, 450);
		return () => window.clearTimeout(timer);
	}, [data, key, loadedMonth]);

	const animateFlow = useCallback(
		(element: HTMLElement | null, target: "dock" | "island", label: string) => {
			const rect = element?.getBoundingClientRect();
			setFlow({
				id: Date.now(),
				x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
				y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
				target,
				label
			});
			emit("journal-activity", { target, label }).catch(() => {});
		},
		[]
	);

	const commit = useCallback(
		(change: (draft: JournalData) => void) => {
			setData((current) => {
				const next = cloneData(current);
				change(next);
				setHistory((oldHistory) => {
					const trimmed = oldHistory.slice(0, historyIndex + 1);
					const updated = [...trimmed, cloneData(next)].slice(-40);
					setHistoryIndex(updated.length - 1);
					return updated;
				});
				return next;
			});
		},
		[historyIndex]
	);

	const undo = () => {
		if (historyIndex <= 0) return;
		const nextIndex = historyIndex - 1;
		setHistoryIndex(nextIndex);
		setData(cloneData(history[nextIndex]));
	};
	const redo = () => {
		if (historyIndex >= history.length - 1) return;
		const nextIndex = historyIndex + 1;
		setHistoryIndex(nextIndex);
		setData(cloneData(history[nextIndex]));
	};

	const changeMonth = (delta: number) => {
		setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
	};

	const toggleHabit = (habitId: string, day: number, element: HTMLElement) => {
		commit((draft) => {
			const habit = draft.habits.find((item) => item.id === habitId);
			if (habit) habit.days[String(day)] = !habit.days[String(day)];
		});
		animateFlow(
			element,
			day === now.getDate() && key === monthKey(now) ? "island" : "dock",
			"Hábito atualizado"
		);
	};

	const addHabit = () => {
		const name = newHabit.trim();
		if (!name) return;
		commit((draft) => draft.habits.push({ id: crypto.randomUUID(), name, days: {} }));
		setNewHabit("");
	};

	const sleepPoints = useMemo(() => {
		const values = Array.from({ length: count }, (_, index) =>
			Number(data.sleep[String(index + 1)] || 0)
		);
		return values
			.map(
				(hours, index) => `${(index / Math.max(count - 1, 1)) * 100},${100 - (hours / 12) * 100}`
			)
			.join(" ");
	}, [count, data.sleep]);

	const dragWindow = (event: React.MouseEvent<HTMLElement>) => {
		if (
			event.button !== 0 ||
			(event.target as HTMLElement).closest("button, input, textarea, select")
		)
			return;
		getCurrentWebviewWindow()
			.startDragging()
			.catch(() => undefined);
	};

	const closeWindow = async () => {
		try {
			await getCurrentWebviewWindow().hide();
		} catch {
			await invoke("close_journal_window");
		}
	};

	return (
		<div className="journal-shell">
			<header className="journal-titlebar" data-tauri-drag-region onMouseDown={dragWindow}>
				<div className="journal-brand" data-tauri-drag-region>
					<span className="journal-brand-mark">
						<BookOpenText size={25} />
					</span>
					<div>
						<strong>Willow Journal</strong>
						<span>Seu mês, salvo somente neste computador</span>
					</div>
				</div>
				<div className="journal-actions">
					<span className={`journal-save-state ${saveState}`}>
						{saveState === "saved"
							? "Salvo"
							: saveState === "saving"
								? "Salvando…"
								: "Erro ao salvar"}
					</span>
					<button onClick={undo} disabled={historyIndex <= 0} title="Desfazer">
						<Undo2 size={16} />
					</button>
					<button onClick={redo} disabled={historyIndex >= history.length - 1} title="Refazer">
						<Redo2 size={16} />
					</button>
					<button onClick={() => window.print()} title="Exportar ou imprimir">
						<Printer size={16} />
					</button>
					<button className="journal-close" onClick={closeWindow} title="Fechar">
						<X size={16} />
					</button>
				</div>
			</header>

			<div className="journal-monthbar">
				<button onClick={() => changeMonth(-1)}>
					<ChevronLeft size={18} />
				</button>
				<div>
					<span>{month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</span>
					<small>{count} dias organizados localmente</small>
				</div>
				<button onClick={() => changeMonth(1)}>
					<ChevronRight size={18} />
				</button>
			</div>

			<main className="journal-grid">
				<section className="journal-card calendar-card">
					<div className="card-heading">
						<div>
							<CalendarDays size={18} />
							<span>Calendário mensal</span>
						</div>
						<small>Clique em um dia para editar</small>
					</div>
					<div className="calendar-weekdays">
						{WEEK_DAYS.map((day) => (
							<span key={day}>{day}</span>
						))}
					</div>
					<div className="calendar-grid">
						{cells.map((day, index) =>
							day ? (
								<button
									key={day}
									className={`${selectedDay === day ? "selected" : ""} ${day === now.getDate() && key === monthKey(now) ? "today" : ""}`}
									onClick={() => setSelectedDay(day)}
								>
									<strong>{day}</strong>
									{data.days[String(day)] && <span>{data.days[String(day)].split("\n")[0]}</span>}
								</button>
							) : (
								<div key={`empty-${index}`} />
							)
						)}
					</div>
					<textarea
						className="day-note"
						value={data.days[dayKey] || ""}
						onChange={(event) =>
							commit((draft) => {
								draft.days[dayKey] = event.target.value;
							})
						}
						placeholder={`Notas rápidas do dia ${selectedDay}…`}
					/>
				</section>

				<section className="journal-card sleep-card">
					<div className="card-heading">
						<div>
							<MoonStar size={18} />
							<span>Sono</span>
						</div>
						<small>
							{Number(data.sleep[dayKey] || 0).toFixed(1)}h no dia {selectedDay}
						</small>
					</div>
					<div className="sleep-chart">
						<div className="sleep-axis">
							<span>12h</span>
							<span>6h</span>
							<span>0h</span>
						</div>
						<svg
							viewBox="0 0 100 100"
							preserveAspectRatio="none"
							aria-label="Gráfico mensal de sono"
						>
							<defs>
								<linearGradient id="sleepStroke">
									<stop stopColor="#53b7ff" />
									<stop offset="1" stopColor="#8c7dff" />
								</linearGradient>
							</defs>
							<polyline
								points={sleepPoints}
								fill="none"
								stroke="url(#sleepStroke)"
								strokeWidth="2.4"
								vectorEffect="non-scaling-stroke"
							/>
							{Array.from({ length: count }, (_, index) => {
								const day = index + 1;
								const hours = Number(data.sleep[String(day)] || 0);
								return (
									<circle
										key={day}
										cx={(index / Math.max(count - 1, 1)) * 100}
										cy={100 - (hours / 12) * 100}
										r={selectedDay === day ? 2.4 : 1.35}
										className={selectedDay === day ? "active" : ""}
										onClick={() => setSelectedDay(day)}
									>
										<title>
											Dia {day}: {hours}h
										</title>
									</circle>
								);
							})}
						</svg>
					</div>
					<div className="sleep-editor">
						<CloudMoon size={17} />
						<input
							type="range"
							min="0"
							max="12"
							step="0.5"
							value={data.sleep[dayKey] || 0}
							onChange={(event) =>
								commit((draft) => {
									draft.sleep[dayKey] = Number(event.target.value);
								})
							}
						/>
						<strong>{Number(data.sleep[dayKey] || 0).toFixed(1)}h</strong>
					</div>
				</section>

				<section className="journal-card weekly-card">
					<div className="card-heading">
						<div>
							<Sparkles size={18} />
							<span>Anotação da semana</span>
						</div>
						<small>Manhã, tarde e noite</small>
					</div>
					<div className="week-list">
						{WEEK_DAYS.map((day) => (
							<div className="week-row" key={day}>
								<strong>{day}</strong>
								{(["morning", "afternoon", "night"] as const).map((period) => (
									<input
										key={period}
										value={data.week[day]?.[period] || ""}
										onChange={(event) =>
											commit((draft) => {
												draft.week[day] ||= { morning: "", afternoon: "", night: "" };
												draft.week[day][period] = event.target.value;
											})
										}
										placeholder={
											period === "morning" ? "Manhã" : period === "afternoon" ? "Tarde" : "Noite"
										}
									/>
								))}
							</div>
						))}
					</div>
				</section>

				<section className="journal-card diary-card">
					<div className="card-heading">
						<div>
							<BookOpenText size={18} />
							<span>Diário do dia {selectedDay}</span>
						</div>
						<select
							value={data.diaryKeys[dayKey] || "N Nota"}
							onChange={(event) =>
								commit((draft) => {
									draft.diaryKeys[dayKey] = event.target.value;
								})
							}
						>
							{KEYS.map((item) => (
								<option key={item}>{item}</option>
							))}
						</select>
					</div>
					<textarea
						value={data.diary[dayKey] || ""}
						onChange={(event) =>
							commit((draft) => {
								draft.diary[dayKey] = event.target.value;
							})
						}
						placeholder="Registre uma reflexão, memória, ideia ou acontecimento…"
					/>
					<div className="keys-strip">
						{KEYS.slice(0, 8).map((item) => (
							<button
								key={item}
								onClick={() =>
									commit((draft) => {
										draft.diary[dayKey] =
											`${draft.diary[dayKey] || ""}${draft.diary[dayKey] ? "\n" : ""}${item.split(" ")[0]} `;
									})
								}
							>
								{item}
							</button>
						))}
					</div>
				</section>

				<section className="journal-card habits-card">
					<div className="card-heading">
						<div>
							<Check size={18} />
							<span>Controle de hábitos</span>
						</div>
						<small>
							{data.habits.filter((habit) => habit.days[dayKey]).length}/{data.habits.length} no dia
							selecionado
						</small>
					</div>
					<div className="habit-add">
						<input
							value={newHabit}
							onChange={(event) => setNewHabit(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") addHabit();
							}}
							placeholder="Novo hábito"
						/>
						<button onClick={addHabit}>
							<Plus size={15} />
							Adicionar
						</button>
					</div>
					<div className="habits-scroll">
						<table>
							<thead>
								<tr>
									<th>Hábito</th>
									{Array.from({ length: count }, (_, index) => (
										<th key={index}>{index + 1}</th>
									))}
									<th />
								</tr>
							</thead>
							<tbody>
								{data.habits.map((habit) => (
									<tr key={habit.id}>
										<td>{habit.name}</td>
										{Array.from({ length: count }, (_, index) => {
											const day = index + 1;
											const active = habit.days[String(day)];
											return (
												<td key={day}>
													<button
														className={active ? "done" : ""}
														onClick={(event) => toggleHabit(habit.id, day, event.currentTarget)}
														aria-label={`${habit.name}, dia ${day}`}
													>
														{active && <Check size={11} />}
													</button>
												</td>
											);
										})}
										<td>
											<button
												className="habit-delete"
												onClick={() =>
													commit((draft) => {
														draft.habits = draft.habits.filter((item) => item.id !== habit.id);
													})
												}
											>
												<Trash2 size={13} />
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			</main>

			<AnimatePresence>
				{flow && (
					<motion.div
						key={flow.id}
						className="journal-flow"
						initial={{ x: flow.x, y: flow.y, opacity: 0, scale: 0.65 }}
						animate={{
							x: window.innerWidth / 2,
							y: flow.target === "island" ? 12 : window.innerHeight - 8,
							opacity: [0, 1, 1, 0],
							scale: [0.65, 1, 0.8, 0.25]
						}}
						transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
						onAnimationComplete={() => setFlow(null)}
					>
						<span className="journal-flow-mark">
							<BookOpenText size={15} />
						</span>
						<span>{flow.label}</span>
						{flow.target === "dock" ? <ArrowRight size={13} /> : <ArrowLeft size={13} />}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
