import {
	Power,
	Download,
	Clock,
	BatteryWarning,
	RefreshCw,
	LogOut,
	Laptop,
	Monitor
} from "lucide-react";
import { SettingRow } from "./SettingRow";
import type { DeviceCapabilities } from "../deviceCapabilities";

interface GeneralTabProps {
	autostart: boolean;
	toggleAutostart: () => void;
	timeFormat24h: boolean;
	toggleTimeFormat24h: () => void;
	showUpdateIndicator: boolean;
	toggleUpdateIndicator: () => void;
	lowBatteryThreshold: number;
	handleThresholdChange: (val: number) => void;
	restartWillow: () => void;
	quitWillow: () => void;
	deviceCapabilities: DeviceCapabilities;
}

export function GeneralTab({
	autostart,
	toggleAutostart,
	timeFormat24h,
	toggleTimeFormat24h,
	showUpdateIndicator,
	toggleUpdateIndicator,
	lowBatteryThreshold,
	handleThresholdChange,
	restartWillow,
	quitWillow,
	deviceCapabilities
}: GeneralTabProps) {
	return (
		<>
			<div className="setting-group-label">SISTEMA</div>
			<div className="setting-group">
				<SettingRow icon={Power} label="Iniciar com o Windows" desc="Abre o Willow automaticamente">
					<label className="toggle-switch">
						<input type="checkbox" checked={autostart} onChange={toggleAutostart} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				{deviceCapabilities.hasBattery && (
					<SettingRow
						icon={Download}
						label="Indicador de atualização"
						desc="Mostra um ponto na cor do tema quando houver atualização"
					>
						<label className="toggle-switch">
							<input
								type="checkbox"
								checked={showUpdateIndicator}
								onChange={toggleUpdateIndicator}
							/>
							<span className="slider"></span>
						</label>
					</SettingRow>
				)}

				<SettingRow icon={Clock} label="Relógio de 24 horas" desc="Usa o formato de 24 horas">
					<label className="toggle-switch">
						<input type="checkbox" checked={timeFormat24h} onChange={toggleTimeFormat24h} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow
					icon={deviceCapabilities.isPortable ? Laptop : Monitor}
					label="Dispositivo detectado"
					desc={
						deviceCapabilities.isPortable
							? "Notebook: bateria e recursos portáteis ativos"
							: "Computador desktop: controles sem hardware são ocultados"
					}
				/>

				<SettingRow
					icon={BatteryWarning}
					label="Alerta de bateria fraca"
					desc={`Avisar em ${lowBatteryThreshold}%`}
					divider={false}
				>
					<input
						type="range"
						min="5"
						max="50"
						step="5"
						value={lowBatteryThreshold}
						onChange={(e) => handleThresholdChange(parseInt(e.target.value))}
						className="settings-slider"
					/>
				</SettingRow>
			</div>

			<div className="setting-group-label">APLICATIVO</div>
			<div className="setting-group">
				<SettingRow
					icon={RefreshCw}
					label="Reiniciar Willow"
					desc="Reinicia todos os componentes"
					action
					onClick={restartWillow}
				/>
				<SettingRow
					icon={LogOut}
					label="Sair do Willow"
					desc="Fecha completamente o aplicativo"
					action
					danger
					onClick={quitWillow}
					divider={false}
				/>
			</div>
		</>
	);
}
