import { Download, RefreshCw, FileDown, Upload } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { WillowDuckMark } from "../components/WillowMarks";

interface AboutTabProps {
	appVersion: string;
	autoUpdate: boolean;
	toggleAutoUpdate: () => void;
	updateStatus: string;
	updateVersion: string;
	checkForUpdates: () => void;
	installUpdate: () => void;
	exportStatus: string;
	importStatus: string;
	handleExportSettings: () => void;
	handleImportSettings: () => void;
}

export function AboutTab({
	appVersion,
	autoUpdate,
	toggleAutoUpdate,
	updateStatus,
	updateVersion,
	checkForUpdates,
	installUpdate,
	exportStatus,
	importStatus,
	handleExportSettings,
	handleImportSettings
}: AboutTabProps) {
	const getUpdateLabel = () => {
		switch (updateStatus) {
			case "checking":
				return "Verificando...";
			case "available":
				return `Atualização disponível (v${updateVersion})`;
			case "uptodate":
				return "O Willow está atualizado";
			case "downloading":
				return "Baixando atualização...";
			case "installing":
				return "Instalando...";
			case "error":
				return "Nenhuma atualização encontrada";
			default:
				return "Verificar atualizações";
		}
	};

	const getUpdateDesc = () =>
		updateStatus === "available"
			? "Clique para abrir o download oficial"
			: `Versão em uso v${appVersion}`;

	const getExportLabel = () => {
		if (exportStatus === "exporting") return "Exportando...";
		if (exportStatus === "success") return "Exportado!";
		return "Exportar configurações";
	};

	const getImportLabel = () => {
		if (importStatus === "importing") return "Importando...";
		if (importStatus === "success") return "Importado!";
		return "Importar configurações";
	};

	return (
		<div className="about-tab-container">
			<div className="about-header">
				<WillowDuckMark className="about-logo" title="Willow" />
				<h1 className="about-title">Willow</h1>
				<p className="about-version">Versão {appVersion}</p>
			</div>

			<div className="setting-group-label">Atualizações</div>
			<div className="setting-group">
				<SettingRow
					icon={Download}
					label="Verificação automática"
					desc="Verifica ao iniciar e a cada quatro horas"
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={autoUpdate} onChange={toggleAutoUpdate} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow
					icon={RefreshCw}
					label={getUpdateLabel()}
					desc={getUpdateDesc()}
					action
					divider={false}
					onClick={() => (updateStatus === "available" ? installUpdate() : checkForUpdates())}
				/>
			</div>

			<div className="setting-group-label setting-group-label--spaced">DADOS</div>
			<div className="setting-group">
				<SettingRow
					icon={FileDown}
					label={getExportLabel()}
					desc="Salva as configurações em um arquivo"
					action
					onClick={handleExportSettings}
				/>
				<SettingRow
					icon={Upload}
					label={getImportLabel()}
					desc="Carrega as configurações de um arquivo"
					action
					divider={false}
					onClick={handleImportSettings}
				/>
			</div>

			<div className="about-footer">
				<p>Feito com cuidado para o Willow</p>
			</div>
		</div>
	);
}
