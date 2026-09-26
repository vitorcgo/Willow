import { Monitor, Eye, EyeOff, Circle, Maximize2, Keyboard } from "lucide-react";
import { SettingRow } from "./SettingRow";

interface DockTabProps {
	dockEnabled: boolean;
	toggleDock: () => void;
	dockMode: string;
	setDockModeValue: (mode: string) => void;
	dockPreviewEnabled: boolean;
	toggleDockPreview: () => void;
	dockIconOnly: boolean;
	toggleDockIconOnly: () => void;
	dockAdaptive: boolean;
	toggleDockAdaptive: () => void;
	dockWinNumberEnabled: boolean;
	toggleDockWinNumber: () => void;
}

export function DockTab({
	dockEnabled,
	toggleDock,
	dockMode,
	setDockModeValue,
	dockPreviewEnabled,
	toggleDockPreview,
	dockIconOnly,
	toggleDockIconOnly,
	dockAdaptive,
	toggleDockAdaptive,
	dockWinNumberEnabled,
	toggleDockWinNumber
}: DockTabProps) {
	return (
		<>
			<div className="setting-group-label">DOCK</div>
			<div className="setting-group">
				<SettingRow icon={Monitor} label="Willow Dock" desc="Substitui a barra de tarefas do Windows">
					<label className="toggle-switch">
						<input type="checkbox" checked={dockEnabled} onChange={toggleDock} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				{dockEnabled && (
					<>
						<SettingRow
							icon={dockMode === "fixed" ? EyeOff : Eye}
							label="Comportamento"
							desc="Escolha como o dock aparece"
						>
							<select
								className="settings-select"
								value={dockMode}
								onChange={(e) => setDockModeValue(e.target.value)}
							>
								<option value="fixed">Fixo</option>
								<option value="smart">Inteligente</option>
								<option value="peek">Espiar</option>
							</select>
						</SettingRow>

						<SettingRow icon={Eye} label="Mostrar prévias dos aplicativos" desc="Mostra miniaturas ao passar o mouse">
							<label className="toggle-switch">
								<input type="checkbox" checked={dockPreviewEnabled} onChange={toggleDockPreview} />
								<span className="slider"></span>
							</label>
						</SettingRow>

						<SettingRow
							icon={Circle}
							label="Somente ícones"
							desc="Remove o fundo e o espaçamento dos ícones"
							divider={false}
						>
							<label className="toggle-switch">
								<input type="checkbox" checked={dockIconOnly} onChange={toggleDockIconOnly} />
								<span className="slider"></span>
							</label>
						</SettingRow>

						<SettingRow
							icon={Keyboard}
							label="Atalhos Win mais número"
							desc="Abre aplicativos fixados com Win mais 1 até Win mais 9"
							divider={dockMode === "fixed"}
						>
							<label className="toggle-switch">
								<input
									type="checkbox"
									checked={dockWinNumberEnabled}
									onChange={toggleDockWinNumber}
								/>
								<span className="slider"></span>
							</label>
						</SettingRow>

						{dockMode === "fixed" && (
							<SettingRow
								icon={Maximize2}
								label="Modo adaptável"
								desc="Ocupa a largura toda quando uma janela está maximizada"
								divider={false}
							>
								<label className="toggle-switch">
									<input type="checkbox" checked={dockAdaptive} onChange={toggleDockAdaptive} />
									<span className="slider"></span>
								</label>
							</SettingRow>
						)}
					</>
				)}
			</div>
		</>
	);
}
