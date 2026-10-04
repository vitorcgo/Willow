import {
	Monitor,
	Eye,
	EyeOff,
	Circle,
	Maximize2,
	Keyboard,
	HardDrive,
	Download,
	FileText,
	Images,
	Trash2,
	MonitorDown,
	MoveHorizontal
} from "lucide-react";
import type { ComponentType } from "react";
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
	dockSystemSectionEnabled: boolean;
	toggleDockSystemSection: () => void;
	dockSystemSectionSide: string;
	setDockSystemSectionSideValue: (side: string) => void;
	dockSystemDrives: boolean;
	dockSystemDownloads: boolean;
	dockSystemDocuments: boolean;
	dockSystemPictures: boolean;
	dockSystemRecycleBin: boolean;
	dockSystemShowDesktop: boolean;
	toggleDockSystemItem: (item: string) => void;
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
	toggleDockWinNumber,
	dockSystemSectionEnabled,
	toggleDockSystemSection,
	dockSystemSectionSide,
	setDockSystemSectionSideValue,
	dockSystemDrives,
	dockSystemDownloads,
	dockSystemDocuments,
	dockSystemPictures,
	dockSystemRecycleBin,
	dockSystemShowDesktop,
	toggleDockSystemItem
}: DockTabProps) {
	return (
		<>
			<div className="setting-group-label">DOCK</div>
			<div className="setting-group">
				<SettingRow
					icon={Monitor}
					label="Willow Dock"
					desc="Substitui a barra de tarefas do Windows"
				>
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

						<SettingRow
							icon={Eye}
							label="Mostrar prévias dos aplicativos"
							desc="Mostra miniaturas ao passar o mouse"
						>
							<label className="toggle-switch">
								<input type="checkbox" checked={dockPreviewEnabled} onChange={toggleDockPreview} />
								<span className="slider"></span>
							</label>
						</SettingRow>

						<SettingRow
							icon={Circle}
							label="Somente ícones"
							desc="Remove o fundo e o espaçamento dos ícones"
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

			{dockEnabled && (
				<>
					<div className="setting-group-label">SEÇÃO DO SISTEMA</div>
					<div className="setting-group">
						<SettingRow
							icon={HardDrive}
							label="Atalhos do sistema"
							desc="Separa unidades, pastas e Lixeira dos aplicativos"
						>
							<label className="toggle-switch">
								<input
									type="checkbox"
									checked={dockSystemSectionEnabled}
									onChange={toggleDockSystemSection}
								/>
								<span className="slider"></span>
							</label>
						</SettingRow>

						{dockSystemSectionEnabled && (
							<>
								<SettingRow
									icon={MoveHorizontal}
									label="Posição da seção"
									desc="Escolha de qual lado ficam os atalhos"
								>
									<select
										className="settings-select"
										value={dockSystemSectionSide}
										onChange={(event) => setDockSystemSectionSideValue(event.target.value)}
									>
										<option value="left">Esquerda</option>
										<option value="right">Direita</option>
									</select>
								</SettingRow>

								<SystemItemRow
									icon={HardDrive}
									label="Unidades conectadas"
									desc="Discos locais, USB, rede e mídia removível"
									checked={dockSystemDrives}
									onChange={() => toggleDockSystemItem("drives")}
								/>
								<SystemItemRow
									icon={Download}
									label="Downloads"
									desc="Abre sua pasta de downloads"
									checked={dockSystemDownloads}
									onChange={() => toggleDockSystemItem("downloads")}
								/>
								<SystemItemRow
									icon={FileText}
									label="Documentos"
									desc="Abre sua pasta de documentos"
									checked={dockSystemDocuments}
									onChange={() => toggleDockSystemItem("documents")}
								/>
								<SystemItemRow
									icon={Images}
									label="Imagens"
									desc="Abre sua pasta de imagens"
									checked={dockSystemPictures}
									onChange={() => toggleDockSystemItem("pictures")}
								/>
								<SystemItemRow
									icon={Trash2}
									label="Lixeira"
									desc="Abre a Lixeira do Windows"
									checked={dockSystemRecycleBin}
									onChange={() => toggleDockSystemItem("recycle-bin")}
								/>
								<SystemItemRow
									icon={MonitorDown}
									label="Mostrar área de trabalho"
									desc="Minimiza tudo; clique novamente para restaurar"
									checked={dockSystemShowDesktop}
									onChange={() => toggleDockSystemItem("show-desktop")}
									divider={false}
								/>
							</>
						)}
					</div>
				</>
			)}
		</>
	);
}

function SystemItemRow({
	icon,
	label,
	desc,
	checked,
	onChange,
	divider = true
}: {
	icon: ComponentType<{ size?: number; strokeWidth?: number }>;
	label: string;
	desc: string;
	checked: boolean;
	onChange: () => void;
	divider?: boolean;
}) {
	return (
		<SettingRow icon={icon} label={label} desc={desc} divider={divider}>
			<label className="toggle-switch">
				<input type="checkbox" checked={checked} onChange={onChange} />
				<span className="slider"></span>
			</label>
		</SettingRow>
	);
}
