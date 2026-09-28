import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
	BookOpenText,
	Ban,
	CalendarDays,
	Check,
	ChevronLeft,
	ChevronRight,
	Circle,
	ClipboardCheck,
	Code2,
	Clock3,
	FileText,
	Frown,
	GitBranch,
	ListTodo,
	Meh,
	Minus,
	MoonStar,
	PauseCircle,
	Palette,
	Plus,
	Printer,
	Redo2,
	RotateCcw,
	Smile,
	Square,
	Star,
	Trash2,
	Undo2,
	X
} from "lucide-react";
import { WillowJournalMark } from "./components/WillowMarks";
import { initTheme } from "./theme";
import "./Journal.css";

type DayPeriod = { morning: string; afternoon: string; night: string };
type Habit = { id: string; name: string; days: Record<string, boolean> };
type Task = { id: string; text: string; status: number };
type JournalData = {
	days: Record<string, string>;
	week: Record<string, DayPeriod>;
	diary: Record<string, string>;
	diaryKeys: Record<string, string>;
	sleep: Record<string, number>;
	habits: Habit[];
	tasks: Record<string, Task[]>;
	mood: Record<string, string>;
};

const WEEK_DAYS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
const TASK_STATES = [
	"A fazer",
	"Em andamento",
	"Concluída",
	"Reagendada",
	"Cancelada",
	"Em aguardo"
];
const MOODS = [
	{ id: "Ótimo", icon: Star, tone: "yellow" },
	{ id: "Bom", icon: Smile, tone: "green" },
	{ id: "Neutro", icon: Meh, tone: "cyan" },
	{ id: "Difícil", icon: Frown, tone: "pink" }
] as const;
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

const isTauriRuntime = "__TAURI_INTERNALS__" in window;
const JOURNAL_ACCENT_KEY = "willow-journal-accent";
const DAY_KEY_PATTERN = /^(?:[1-9]|[12]\d|3[01])$/;

function asRecord(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function stringRecord(value: unknown): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, item] of Object.entries(asRecord(value))) {
		if (DAY_KEY_PATTERN.test(key) && typeof item === "string") result[key] = item;
	}
	return result;
}

function booleanRecord(value: unknown): Record<string, boolean> {
	const result: Record<string, boolean> = {};
	for (const [key, item] of Object.entries(asRecord(value))) {
		if (DAY_KEY_PATTERN.test(key) && typeof item === "boolean") result[key] = item;
	}
	return result;
}

function emptyData(): JournalData {
	return {
		days: {},
		week: Object.fromEntries(
			WEEK_DAYS.map((day) => [day, { morning: "", afternoon: "", night: "" }])
		),
		diary: {},
		diaryKeys: {},
		sleep: {},
		habits: [],
		tasks: {},
		mood: {}
	};
}

function normalizeData(value: unknown): JournalData {
	const fallback = emptyData();
	const source = asRecord(value);
	const weekSource = asRecord(source.week);
	const week = Object.fromEntries(
		WEEK_DAYS.map((day) => {
			const period = asRecord(weekSource[day]);
			return [
				day,
				{
					morning: typeof period.morning === "string" ? period.morning : "",
					afternoon: typeof period.afternoon === "string" ? period.afternoon : "",
					night: typeof period.night === "string" ? period.night : ""
				}
			];
		})
	) as Record<string, DayPeriod>;
	const sleep = Object.fromEntries(
		Object.entries(asRecord(source.sleep)).flatMap(([day, value]) => {
			const hours = Number(value);
			return DAY_KEY_PATTERN.test(day) && Number.isFinite(hours)
				? [[day, Math.min(12, Math.max(0, hours))]]
				: [];
		})
	);
	const habits = Array.isArray(source.habits)
		? source.habits.flatMap((value, index) => {
				const habit = asRecord(value);
				if (typeof habit.name !== "string" || !habit.name.trim()) return [];
				return [
					{
						id: typeof habit.id === "string" && habit.id ? habit.id : `habit-${index}`,
						name: habit.name.trim(),
						days: booleanRecord(habit.days)
					}
				];
			})
		: [];
	const tasks = Object.fromEntries(
		Object.entries(asRecord(source.tasks)).flatMap(([day, value]) => {
			if (!DAY_KEY_PATTERN.test(day) || !Array.isArray(value)) return [];
			const normalized = value.flatMap((item, index) => {
				const task = asRecord(item);
				if (typeof task.text !== "string" || !task.text.trim()) return [];
				const status = Number(task.status);
				return [
					{
						id: typeof task.id === "string" && task.id ? task.id : `task-${day}-${index}`,
						text: task.text.trim(),
						status:
							Number.isInteger(status) && status >= 0 && status < TASK_STATES.length ? status : 0
					}
				];
			});
			return [[day, normalized]];
		})
	);
	const mood = Object.fromEntries(
		Object.entries(stringRecord(source.mood)).filter(([, value]) =>
			MOODS.some((moodOption) => moodOption.id === value)
		)
	);
	return {
		days: stringRecord(source.days),
		week: { ...fallback.week, ...week },
		diary: stringRecord(source.diary),
		diaryKeys: stringRecord(source.diaryKeys),
		sleep,
		habits,
		tasks,
		mood
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

async function loadMonth(key: string): Promise<unknown> {
	if (isTauriRuntime) return invoke("journal_load_month", { month: key });
	const value = localStorage.getItem(`willow-journal-preview:${key}`);
	return value ? JSON.parse(value) : null;
}

async function saveMonth(key: string, data: JournalData): Promise<void> {
	if (isTauriRuntime) {
		await invoke("journal_save_month", { month: key, data });
		return;
	}
	localStorage.setItem(`willow-journal-preview:${key}`, JSON.stringify(data));
}

export default function Journal() {
	const now = useMemo(() => new Date(), []);
	const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
	const [selectedDay, setSelectedDay] = useState(now.getDate());
	const [bottomPanel, setBottomPanel] = useState<"habits" | "week">("habits");
	const [weekPeriod, setWeekPeriod] = useState<keyof DayPeriod>("morning");
	const [data, setData] = useState<JournalData>(emptyData);
	const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
	const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
	const [history, setHistory] = useState<JournalData[]>([]);
	const [historyIndex, setHistoryIndex] = useState(-1);
	const [newHabit, setNewHabit] = useState("");
	const [newTask, setNewTask] = useState("");
	const [loadRetry, setLoadRetry] = useState(0);
	const [loadError, setLoadError] = useState(false);
	const [journalAccent, setJournalAccent] = useState(() => {
		const saved = localStorage.getItem(JOURNAL_ACCENT_KEY) || "";
		return /^#[0-9a-f]{6}$/i.test(saved) ? saved : "";
	});
	const loadSequence = useRef(0);
	const saveSequence = useRef(0);
	const saveQueue = useRef<Promise<void>>(Promise.resolve());
	const dataRef = useRef(data);
	const loadedMonthRef = useRef(loadedMonth);

	useEffect(() => initTheme(), []);
	useEffect(() => {
		const previousTitle = document.title;
		document.title = "Willow Journal";
		return () => {
			document.title = previousTitle;
		};
	}, []);
	useEffect(() => {
		const resetScroll = () => document.querySelector<HTMLElement>(".journal-ide")?.scrollTo(0, 0);
		resetScroll();
		const frame = window.requestAnimationFrame(resetScroll);
		return () => window.cancelAnimationFrame(frame);
	}, []);
	useEffect(() => {
		dataRef.current = data;
	}, [data]);
	useEffect(() => {
		loadedMonthRef.current = loadedMonth;
	}, [loadedMonth]);

	const key = monthKey(month);
	const dayKey = String(selectedDay);
	const count = daysInMonth(month);
	const cells = useMemo(() => monthCells(month), [month]);
	const dayTasks = data.tasks[dayKey] || [];

	const persist = useCallback((monthToSave: string, payload: JournalData) => {
		const sequence = ++saveSequence.current;
		const snapshot = cloneData(payload);
		setSaveState("saving");
		const operation = saveQueue.current
			.catch(() => undefined)
			.then(() => saveMonth(monthToSave, snapshot));
		saveQueue.current = operation;
		return operation
			.then(() => {
				if (sequence === saveSequence.current) setSaveState("saved");
			})
			.catch((error) => {
				console.error("Não foi possível salvar o Journal", error);
				if (sequence === saveSequence.current) setSaveState("error");
				throw error;
			});
	}, []);

	useEffect(() => {
		const sequence = ++loadSequence.current;
		setLoadedMonth(null);
		setLoadError(false);
		loadMonth(key)
			.then((saved) => {
				if (sequence !== loadSequence.current) return;
				const next = normalizeData(saved);
				setData(next);
				dataRef.current = next;
				setHistory([cloneData(next)]);
				setHistoryIndex(0);
				setSelectedDay((current) => Math.min(current, daysInMonth(month)));
				setLoadedMonth(key);
				setSaveState("saved");
				setLoadError(false);
			})
			.catch((error) => {
				if (sequence !== loadSequence.current) return;
				console.error("Não foi possível carregar o Journal", error);
				const next = emptyData();
				setData(next);
				dataRef.current = next;
				setHistory([cloneData(next)]);
				setHistoryIndex(0);
				setSaveState("error");
				setLoadError(true);
			});
	}, [key, month, loadRetry]);

	useEffect(() => {
		if (loadedMonth !== key) return;
		const timer = window.setTimeout(() => {
			persist(key, data).catch(() => undefined);
		}, 320);
		return () => window.clearTimeout(timer);
	}, [data, key, loadedMonth, persist]);

	const commit = useCallback(
		(change: (draft: JournalData) => void) => {
			setData((current) => {
				const next = cloneData(current);
				change(next);
				dataRef.current = next;
				setHistory((oldHistory) => {
					const trimmed = oldHistory.slice(0, historyIndex + 1);
					const updated = [...trimmed, cloneData(next)].slice(-50);
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
		const next = cloneData(history[nextIndex]);
		setHistoryIndex(nextIndex);
		setData(next);
		dataRef.current = next;
	};

	const redo = () => {
		if (historyIndex >= history.length - 1) return;
		const nextIndex = historyIndex + 1;
		const next = cloneData(history[nextIndex]);
		setHistoryIndex(nextIndex);
		setData(next);
		dataRef.current = next;
	};

	const changeMonth = async (delta: number) => {
		if (loadedMonthRef.current === key) {
			try {
				await persist(key, dataRef.current);
			} catch {
				return;
			}
		}
		setMonth((current) => {
			const next = new Date(current.getFullYear(), current.getMonth() + delta, 1);
			setSelectedDay((day) => Math.min(day, daysInMonth(next)));
			return next;
		});
	};

	const closeWindow = async () => {
		if (loadedMonthRef.current === key) {
			try {
				await persist(key, dataRef.current);
			} catch {
				return;
			}
		}
		if (!isTauriRuntime) return;
		try {
			await getCurrentWebviewWindow().hide();
		} catch {
			await invoke("close_journal_window");
		}
	};

	const printJournal = async () => {
		if (loadedMonthRef.current === key) {
			try {
				await persist(key, dataRef.current);
			} catch {
				return;
			}
		}
		window.print();
	};

	const changeJournalAccent = (color: string) => {
		if (!/^#[0-9a-f]{6}$/i.test(color)) return;
		setJournalAccent(color);
		localStorage.setItem(JOURNAL_ACCENT_KEY, color);
		invoke("save_setting", { key: JOURNAL_ACCENT_KEY, value: color }).catch(() => undefined);
	};

	const resetJournalAccent = () => {
		setJournalAccent("");
		localStorage.removeItem(JOURNAL_ACCENT_KEY);
		invoke("save_setting", { key: JOURNAL_ACCENT_KEY, value: null }).catch(() => undefined);
	};

	const minimizeWindow = () => {
		if (!isTauriRuntime) return;
		getCurrentWebviewWindow()
			.minimize()
			.catch(() => undefined);
	};

	const toggleMaximizeWindow = () => {
		if (!isTauriRuntime) return;
		getCurrentWebviewWindow()
			.toggleMaximize()
			.catch(() => undefined);
	};

	const dragWindow = (event: React.MouseEvent<HTMLElement>) => {
		if (!isTauriRuntime || event.button !== 0) return;
		if ((event.target as HTMLElement).closest("button, input, textarea, select")) return;
		getCurrentWebviewWindow()
			.startDragging()
			.catch(() => undefined);
	};

	const addHabit = () => {
		const name = newHabit.trim();
		if (!name) return;
		commit((draft) => draft.habits.push({ id: crypto.randomUUID(), name, days: {} }));
		setNewHabit("");
	};

	const addTask = () => {
		const text = newTask.trim();
		if (!text) return;
		commit((draft) => {
			draft.tasks[dayKey] ||= [];
			draft.tasks[dayKey].push({ id: crypto.randomUUID(), text, status: 0 });
		});
		setNewTask("");
	};

	const sleepAverage = useMemo(() => {
		const values = Object.values(data.sleep).filter((value) => value > 0);
		return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
	}, [data.sleep]);

	const completedToday = data.habits.filter((habit) => habit.days[dayKey]).length;
	const monthLabelRaw = month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
	const monthLabel = monthLabelRaw.charAt(0).toUpperCase() + monthLabelRaw.slice(1);
	const monthName = month.toLocaleDateString("pt-BR", { month: "long" });
	const selectedDate = new Date(month.getFullYear(), month.getMonth(), selectedDay);
	const weekDayIndex = (selectedDate.getDay() + 6) % 7;
	const selectedWeekDay = WEEK_DAYS[weekDayIndex];
	const selectedWeekDayLong = selectedDate.toLocaleDateString("pt-BR", { weekday: "long" });
	const selectedDateLabel = selectedDate.toLocaleDateString("pt-BR", {
		weekday: "long",
		day: "2-digit",
		month: "long",
		year: "numeric"
	});
	const selectedFile = `${String(selectedDay).padStart(2, "0")}-${selectedWeekDay.toLowerCase()}`;
	const diaryText = data.diary[dayKey] || "";
	const diaryWords = diaryText.trim() ? diaryText.trim().split(/\s+/).length : 0;
	const completedTasks = dayTasks.filter((task) => task.status === 2).length;
	const selectedMood = data.mood[dayKey] || "";

	const hasDayData = (day: number) => {
		const id = String(day);
		return Boolean(
			data.days[id] ||
			data.diary[id] ||
			data.tasks[id]?.length ||
			data.mood[id] ||
			data.sleep[id] ||
			data.habits.some((habit) => habit.days[id])
		);
	};

	const pickDay = (day: number) => {
		setSelectedDay(day);
	};

	const taskStatusIcon = (status: number) => {
		if (status === 1) return <Clock3 size={13} />;
		if (status === 2) return <Check size={13} />;
		if (status === 3) return <Redo2 size={13} />;
		if (status === 4) return <Ban size={13} />;
		if (status === 5) return <PauseCircle size={13} />;
		return <Circle size={12} />;
	};

	const journalAccentStyle = journalAccent
		? ({
				"--j-pink": journalAccent,
				"--j-green": journalAccent,
				"--j-orange": journalAccent,
				"--j-yellow": journalAccent,
				"--j-cyan": journalAccent,
				"--j-purple": journalAccent
			} as React.CSSProperties)
		: undefined;

	return (
		<div className="journal-ide" style={journalAccentStyle}>
			<header
				className="journal-titlebar"
				data-tauri-drag-region
				onMouseDown={dragWindow}
				onDoubleClick={(event) => {
					if (!(event.target as HTMLElement).closest("button, input, textarea, select"))
						toggleMaximizeWindow();
				}}
			>
				<div className="journal-brand" data-tauri-drag-region>
					<Code2 size={17} />
					<strong>willow-journal</strong>
					<label className="journal-color-picker" title="Aplicar uma cor aos destaques">
						<Palette size={13} />
						<input
							type="color"
							value={journalAccent || "#f92672"}
							onChange={(event) => changeJournalAccent(event.target.value)}
							aria-label="Cor dos destaques do Journal"
						/>
					</label>
					{journalAccent && (
						<button
							className="journal-color-reset"
							onClick={resetJournalAccent}
							title="Restaurar paleta original"
						>
							<RotateCcw size={12} />
						</button>
					)}
				</div>
				<div className="journal-month-switcher">
					<button onClick={() => changeMonth(-1)} title="Mês anterior">
						<ChevronLeft size={15} />
					</button>
					<div>
						<strong>{monthLabel}</strong>
						<span>{count} dias organizados localmente</span>
					</div>
					<button onClick={() => changeMonth(1)} title="Próximo mês">
						<ChevronRight size={15} />
					</button>
				</div>
				<div className="journal-actions">
					<button
						className={`journal-save-state ${saveState}`}
						disabled={saveState !== "error"}
						onClick={() =>
							loadError
								? setLoadRetry((value) => value + 1)
								: persist(key, dataRef.current).catch(() => undefined)
						}
						title={
							saveState === "error"
								? loadError
									? "Tentar carregar novamente"
									: "Tentar salvar novamente"
								: undefined
						}
					>
						<i />
						{saveState === "saved"
							? "Salvo"
							: saveState === "saving"
								? "Salvando"
								: loadError
									? "Recarregar"
									: "Tentar salvar"}
					</button>
					<button onClick={undo} disabled={historyIndex <= 0} title="Desfazer">
						<Undo2 size={15} />
					</button>
					<button onClick={redo} disabled={historyIndex >= history.length - 1} title="Refazer">
						<Redo2 size={15} />
					</button>
					<button onClick={printJournal} title="Imprimir relatório">
						<Printer size={15} />
					</button>
					<span className="window-action-separator" />
					<button onClick={minimizeWindow} title="Minimizar">
						<Minus size={16} />
					</button>
					<button onClick={toggleMaximizeWindow} title="Maximizar ou restaurar">
						<Square size={13} />
					</button>
					<button className="window-close" onClick={closeWindow} title="Fechar">
						<X size={16} />
					</button>
				</div>
			</header>

			<div className="journal-middle">
				<main className="journal-editor">
					<div className="journal-tabs">
						<div className="journal-tab active">
							<button>
								<FileText size={14} />
								<span>{selectedFile}</span>
							</button>
						</div>
					</div>
					<div className="journal-breadcrumb">
						<span>willow-journal</span>
						<b>›</b>
						<span>{month.getFullYear()}</span>
						<b>›</b>
						<span>{monthName}</span>
						<b>›</b>
						<strong>{selectedFile}</strong>
					</div>

					<div className="journal-bento">
						<section className="journal-card today-card">
							<div className="card-title pink">
								<FileText size={14} />
								<strong>hoje</strong>
							</div>
							<div className="today-code">
								<ol>
									<li>
										<b>export const</b> hoje = &#123;
									</li>
									<li>
										dia: <em>{selectedDay}</em>,
									</li>
									<li>
										semana: <q>{selectedWeekDayLong}</q>,
									</li>
									<li>
										mes: <q>{monthName}</q>,
									</li>
									<li>
										humor: <q>{selectedMood || "não definido"}</q>,
									</li>
									<li>&#125;;</li>
								</ol>
								<span className="today-watermark">{String(selectedDay).padStart(2, "0")}</span>
							</div>
							<div className="mood-row">
								{MOODS.map(({ id, icon: Icon, tone }) => (
									<button
										className={`${tone} ${selectedMood === id ? "active" : ""}`}
										key={id}
										onClick={() =>
											commit((draft) => {
												draft.mood[dayKey] = draft.mood[dayKey] === id ? "" : id;
											})
										}
										title={id}
									>
										<Icon size={15} />
									</button>
								))}
							</div>
						</section>

						<section className="journal-card calendar-card">
							<div className="card-title cyan">
								<CalendarDays size={14} />
								<strong>calendario</strong>
								<span>// clique em um dia para editar</span>
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
											onClick={() => pickDay(day)}
										>
											<strong>{String(day).padStart(2, "0")}</strong>
											{hasDayData(day) && <i />}
										</button>
									) : (
										<div key={`empty-${index}`} />
									)
								)}
							</div>
							<label className="quick-note">
								<b>&gt;</b>
								<input
									value={data.days[dayKey] || ""}
									onChange={(event) =>
										commit((draft) => {
											draft.days[dayKey] = event.target.value;
										})
									}
									placeholder={`nota rápida do dia ${selectedDay}...`}
								/>
							</label>
						</section>

						<section className="journal-card diary-card">
							<div className="card-title yellow">
								<BookOpenText size={14} />
								<strong>diario</strong>
								<span>
									{diaryWords} {diaryWords === 1 ? "palavra" : "palavras"}
								</span>
							</div>
							<div className="diary-editor">
								<div className="line-numbers">
									{Array.from({ length: 7 }, (_, index) => (
										<span key={index}>{index + 1}</span>
									))}
								</div>
								<textarea
									value={diaryText}
									onChange={(event) =>
										commit((draft) => {
											draft.diary[dayKey] = event.target.value;
										})
									}
									placeholder="// como foi o dia? escreva livremente..."
								/>
							</div>
							<select
								className="diary-key"
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
						</section>

						<section className="journal-card sleep-card">
							<div className="card-title purple">
								<MoonStar size={14} />
								<strong>sono</strong>
								<span>
									// média {sleepAverage.toFixed(1)}h ·{" "}
									{Object.values(data.sleep).filter(Boolean).length} noites
								</span>
							</div>
							<div className="sleep-top">
								<strong>
									{Number(data.sleep[dayKey] || 0).toFixed(1)}
									<small>h</small>
								</strong>
								<div>
									<button
										onClick={() =>
											commit((draft) => {
												draft.sleep[dayKey] = Math.max(0, Number(draft.sleep[dayKey] || 0) - 0.5);
											})
										}
									>
										<Minus size={14} />
									</button>
									<button
										onClick={() =>
											commit((draft) => {
												draft.sleep[dayKey] = Math.min(12, Number(draft.sleep[dayKey] || 0) + 0.5);
											})
										}
									>
										<Plus size={14} />
									</button>
								</div>
							</div>
							<div className="sleep-bars">
								{Array.from({ length: count }, (_, index) => {
									const day = index + 1;
									const hours = Number(data.sleep[String(day)] || 0);
									return (
										<button
											key={day}
											className={selectedDay === day ? "active" : ""}
											onClick={() => pickDay(day)}
											title={`Dia ${day}: ${hours}h`}
										>
											<i style={{ height: `${Math.max(3, (hours / 12) * 100)}%` }} />
										</button>
									);
								})}
							</div>
							<div className="sleep-axis">
								<span>01</span>
								<span>15</span>
								<span>{count}</span>
							</div>
						</section>

						<section className="journal-card tasks-card">
							<div className="card-title orange">
								<ListTodo size={14} />
								<strong>tarefas</strong>
								<span>
									{completedTasks}/{dayTasks.length} concluídas
								</span>
							</div>
							<div className="task-add">
								<b>+</b>
								<input
									value={newTask}
									onChange={(event) => setNewTask(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "Enter") addTask();
									}}
									placeholder="nova tarefa e Enter..."
								/>
								<button onClick={addTask}>add</button>
							</div>
							<div className="task-list">
								{dayTasks.length === 0 && (
									<p>
										// nenhuma tarefa neste dia
										<br />
										// adicione uma e clique no ícone para mudar o status.
									</p>
								)}
								{dayTasks.map((task) => {
									const status =
										Number.isInteger(task.status) &&
										task.status >= 0 &&
										task.status < TASK_STATES.length
											? task.status
											: 0;
									return (
										<div className={`task-row status-${status}`} key={task.id}>
											<button
												className="task-status"
												onClick={() =>
													commit((draft) => {
														const current = draft.tasks[dayKey].find((item) => item.id === task.id);
														if (current) {
															const currentStatus =
																Number.isInteger(current.status) &&
																current.status >= 0 &&
																current.status < TASK_STATES.length
																	? current.status
																	: 0;
															current.status = (currentStatus + 1) % TASK_STATES.length;
														}
													})
												}
												title={TASK_STATES[status]}
											>
												{taskStatusIcon(status)}
											</button>
											<span>{task.text}</span>
											<small>{TASK_STATES[status]}</small>
											<button
												className="task-delete"
												onClick={() =>
													commit((draft) => {
														draft.tasks[dayKey] = draft.tasks[dayKey].filter(
															(item) => item.id !== task.id
														);
													})
												}
											>
												<X size={12} />
											</button>
										</div>
									);
								})}
							</div>
							<div className="task-legend">
								{TASK_STATES.map((state, index) => (
									<span className={`status-${index}`} key={state}>
										{taskStatusIcon(index)} {state.toLowerCase()}
									</span>
								))}
							</div>
						</section>

						<section className="journal-card ring-card">
							<div className="card-title green">
								<ClipboardCheck size={14} />
								<strong>habitos</strong>
								<span>// dia {selectedDay}</span>
							</div>
							<div className="ring-content">
								<div
									className="habit-ring"
									style={
										{
											"--progress": `${data.habits.length ? (completedToday / data.habits.length) * 360 : 0}deg`
										} as React.CSSProperties
									}
								>
									<span />
								</div>
								<div>
									<strong>
										{completedToday}/{data.habits.length}
									</strong>
									<span>hábitos feitos no dia</span>
								</div>
							</div>
						</section>

						<section className="journal-card progress-card">
							<div className="card-title cyan">
								<ListTodo size={14} />
								<strong>progresso</strong>
								<span>// dias concluídos no mês</span>
							</div>
							<div className="progress-list">
								{data.habits.slice(0, 3).map((habit, index) => {
									const done = Object.values(habit.days).filter(Boolean).length;
									return (
										<div key={habit.id} className={`tone-${index}`}>
											<span>{habit.name}</span>
											<i>
												<b style={{ width: `${(done / count) * 100}%` }} />
											</i>
											<small>
												{done}/{count}
											</small>
										</div>
									);
								})}
							</div>
						</section>
					</div>

					<section className="journal-bottom-panel">
						<header>
							<button
								className={bottomPanel === "habits" ? "active" : ""}
								onClick={() => setBottomPanel("habits")}
							>
								HÁBITOS <b>{data.habits.length}</b>
							</button>
							<button
								className={bottomPanel === "week" ? "active" : ""}
								onClick={() => setBottomPanel("week")}
							>
								SEMANA
							</button>
							<span>// clique no número do dia para selecioná-lo</span>
						</header>
						{bottomPanel === "habits" ? (
							<div className="habits-panel">
								<div className="habit-add">
									<b>+</b>
									<input
										value={newHabit}
										onChange={(event) => setNewHabit(event.target.value)}
										onKeyDown={(event) => {
											if (event.key === "Enter") addHabit();
										}}
										placeholder="novo hábito e Enter..."
									/>
									<button onClick={addHabit}>adicionar</button>
								</div>
								<div className="habits-scroll">
									<table>
										<thead>
											<tr>
												<th>hábito</th>
												{Array.from({ length: count }, (_, index) => (
													<th
														className={selectedDay === index + 1 ? "selected-day" : ""}
														key={index}
													>
														<button onClick={() => pickDay(index + 1)}>
															{String(index + 1).padStart(2, "0")}
														</button>
													</th>
												))}
												<th />
											</tr>
										</thead>
										<tbody>
											{data.habits.map((habit, habitIndex) => (
												<tr className={`tone-${habitIndex}`} key={habit.id}>
													<td>
														<i />
														{habit.name}
													</td>
													{Array.from({ length: count }, (_, index) => {
														const day = index + 1;
														const active = habit.days[String(day)];
														return (
															<td className={selectedDay === day ? "selected-day" : ""} key={day}>
																<button
																	className={active ? "done" : ""}
																	onClick={() =>
																		commit((draft) => {
																			const current = draft.habits.find(
																				(item) => item.id === habit.id
																			);
																			if (current)
																				current.days[String(day)] = !current.days[String(day)];
																		})
																	}
																>
																	{active && <Check size={10} />}
																</button>
															</td>
														);
													})}
													<td>
														<button
															className="habit-delete"
															onClick={() =>
																commit((draft) => {
																	draft.habits = draft.habits.filter(
																		(item) => item.id !== habit.id
																	);
																})
															}
														>
															<Trash2 size={12} />
														</button>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>
						) : (
							<div className="week-panel">
								<nav>
									{(["morning", "afternoon", "night"] as const).map((period) => (
										<button
											className={weekPeriod === period ? "active" : ""}
											key={period}
											onClick={() => setWeekPeriod(period)}
										>
											{period === "morning" ? "MANHÃ" : period === "afternoon" ? "TARDE" : "NOITE"}
										</button>
									))}
								</nav>
								<div>
									{WEEK_DAYS.map((day) => (
										<label key={day}>
											<span>{day}</span>
											<textarea
												value={data.week[day]?.[weekPeriod] || ""}
												onChange={(event) =>
													commit((draft) => {
														draft.week[day] ||= { morning: "", afternoon: "", night: "" };
														draft.week[day][weekPeriod] = event.target.value;
													})
												}
												placeholder="anotação..."
											/>
										</label>
									))}
								</div>
							</div>
						)}
					</section>
				</main>
			</div>

			<section className="journal-print-report">
				<header className="print-report-header">
					<div>
						<span>Willow Journal</span>
						<h1>{monthLabel}</h1>
					</div>
					<p>{selectedDateLabel}</p>
				</header>

				<div className="print-report-stats">
					<div>
						<span>Humor</span>
						<strong>{selectedMood || "Não definido"}</strong>
					</div>
					<div>
						<span>Sono</span>
						<strong>{Number(data.sleep[dayKey] || 0).toFixed(1)}h</strong>
					</div>
					<div>
						<span>Hábitos</span>
						<strong>
							{completedToday}/{data.habits.length}
						</strong>
					</div>
					<div>
						<span>Tarefas</span>
						<strong>
							{completedTasks}/{dayTasks.length}
						</strong>
					</div>
				</div>

				<section className="print-report-block print-calendar-block">
					<h2>Calendário mensal</h2>
					<div className="print-calendar-weekdays">
						{WEEK_DAYS.map((day) => (
							<span key={day}>{day}</span>
						))}
					</div>
					<div className="print-calendar-grid">
						{cells.map((day, index) =>
							day ? (
								<div className={selectedDay === day ? "selected" : ""} key={day}>
									<strong>{String(day).padStart(2, "0")}</strong>
									{hasDayData(day) && <i />}
								</div>
							) : (
								<div className="empty" key={`print-empty-${index}`} />
							)
						)}
					</div>
				</section>

				<div className="print-report-columns">
					<section className="print-report-block">
						<h2>Notas do dia</h2>
						<h3>Nota rápida</h3>
						<p>{data.days[dayKey]?.trim() || "Nenhuma nota rápida."}</p>
						<h3>Diário</h3>
						<p className="print-diary-text">{diaryText.trim() || "Nenhuma anotação no diário."}</p>
					</section>
					<section className="print-report-block">
						<h2>Tarefas</h2>
						{dayTasks.length ? (
							<ul className="print-task-list">
								{dayTasks.map((task) => {
									const status =
										Number.isInteger(task.status) &&
										task.status >= 0 &&
										task.status < TASK_STATES.length
											? task.status
											: 0;
									return (
										<li key={task.id}>
											<span>{status === 2 ? "✓" : "○"}</span>
											<b>{task.text}</b>
											<small>{TASK_STATES[status]}</small>
										</li>
									);
								})}
							</ul>
						) : (
							<p>Nenhuma tarefa neste dia.</p>
						)}
					</section>
				</div>

				<section className="print-report-block print-habits-block">
					<h2>Hábitos do mês</h2>
					{data.habits.length ? (
						<table>
							<thead>
								<tr>
									<th>Hábito</th>
									<th>Dias concluídos</th>
									<th>Total</th>
								</tr>
							</thead>
							<tbody>
								{data.habits.map((habit) => {
									const completedDays = Object.entries(habit.days)
										.filter(([, done]) => done)
										.map(([day]) => String(day).padStart(2, "0"))
										.sort((a, b) => Number(a) - Number(b));
									return (
										<tr key={habit.id}>
											<td>{habit.name}</td>
											<td>{completedDays.join(", ") || "—"}</td>
											<td>
												{completedDays.length}/{count}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					) : (
						<p>Nenhum hábito cadastrado neste mês.</p>
					)}
				</section>

				<section className="print-report-block print-week-block">
					<h2>Anotações da semana</h2>
					<table>
						<thead>
							<tr>
								<th>Dia</th>
								<th>Manhã</th>
								<th>Tarde</th>
								<th>Noite</th>
							</tr>
						</thead>
						<tbody>
							{WEEK_DAYS.map((day) => (
								<tr key={day}>
									<th>{day}</th>
									<td>{data.week[day]?.morning || "—"}</td>
									<td>{data.week[day]?.afternoon || "—"}</td>
									<td>{data.week[day]?.night || "—"}</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>
			</section>

			<footer className="journal-statusbar">
				<span>
					<WillowJournalMark /> willow-journal
				</span>
				<span>
					<GitBranch size={12} /> main*
				</span>
				<span>
					tarefas {completedTasks}/{dayTasks.length}
				</span>
				<span>
					hábitos {completedToday}/{data.habits.length}
				</span>
				<span>sono {Number(data.sleep[dayKey] || 0).toFixed(1)}h</span>
				<i />
				<span>Ln {selectedDay}, Col 1</span>
				<span>UTF-8</span>
				<span>Markdown</span>
				<span>
					{saveState === "saved" ? "Salvo" : saveState === "saving" ? "Salvando" : "Erro"}
				</span>
			</footer>
		</div>
	);
}
