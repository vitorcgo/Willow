import { Bot, Folder, GitBranch, Globe2, Grid2X2, MessageCircle, NotebookPen, Settings } from "lucide-react";
import "./BrowserDockPreview.css";

const items = [
	{ label: "Iniciar", icon: Grid2X2, active: false },
	{ label: "Arquivos", icon: Folder, active: true },
	{ label: "Navegador", icon: Globe2, active: true },
	{ label: "Notas", icon: NotebookPen, active: false },
	{ label: "Mensagens", icon: MessageCircle, active: true },
	{ label: "Assistente", icon: Bot, active: true },
	{ label: "Configurações", icon: Settings, active: true },
	{ label: "GitHub", icon: GitBranch, active: true }
];

export function BrowserDockPreview() {
	return (
		<div className="browser-dock" aria-label="Prévia do dock do Willow">
			{items.map(({ label, icon: Icon, active }) => (
				<button key={label} title={label}>
					<Icon size={25} strokeWidth={1.8} />
					{active && <i />}
				</button>
			))}
		</div>
	);
}
