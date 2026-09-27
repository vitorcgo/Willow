import {
	Bot,
	Folder,
	GitBranch,
	Globe2,
	Grid2X2,
	MessageCircle,
	Music2,
	NotebookPen
} from "lucide-react";
import "./BrowserDockPreview.css";

const items = [
	{ label: "Iniciar", icon: Grid2X2, active: false },
	{ label: "Arquivos", icon: Folder, active: true },
	{ label: "Navegador", icon: Globe2, active: true },
	{ label: "Notas", icon: NotebookPen, active: false },
	{ label: "Mensagens", icon: MessageCircle, active: true },
	{ label: "Assistente", icon: Bot, active: true },
	{ label: "Música", icon: Music2, active: true },
	{ label: "GitHub", icon: GitBranch, active: true }
];

export function BrowserDockPreview({ onOpenSettings }: { onOpenSettings: () => void }) {
	const renderItem = ({ label, icon: Icon, active }: (typeof items)[number]) => (
		<button key={label} title={label}>
			<Icon size={25} strokeWidth={1.8} />
			{active && <i />}
		</button>
	);

	return (
		<div className="browser-dock" aria-label="Prévia do dock do Willow">
			{items.slice(0, 4).map(renderItem)}
			<button
				className="browser-dock-willow"
				title="Configurações do Willow"
				onClick={onOpenSettings}
			>
				<img src="/willow.png" alt="Willow" />
			</button>
			{items.slice(4).map(renderItem)}
		</div>
	);
}
