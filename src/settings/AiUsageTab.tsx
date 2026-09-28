import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PanelRight, RefreshCw, ShieldCheck } from "lucide-react";
import type { ProviderUsage } from "../types/aiUsage";
import { SettingRow } from "./SettingRow";

interface AiUsageTabProps {
	aiMode: string;
	setAiModeValue: (mode: string) => void;
}

export function AiUsageTab({ aiMode, setAiModeValue }: AiUsageTabProps) {
	const enabled = aiMode !== "hidden";
	const [providers, setProviders] = useState<ProviderUsage[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const refresh = async () => {
		setLoading(true);
		setError("");
		try {
			setProviders(await invoke<ProviderUsage[]>("get_ai_usage"));
		} catch {
			setProviders([]);
			setError("Não foi possível consultar as contas agora.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (enabled) refresh();
	}, [enabled]);

	return (
		<>
			<div className="setting-group-label">ILHA DE IA</div>
			<div className="setting-group">
				<SettingRow
					icon={PanelRight}
					label="Painel de uso de IA"
					desc="Desligado por padrão; não consulta contas enquanto estiver inativo"
					divider={!enabled}
				>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={enabled}
							onChange={() => setAiModeValue(enabled ? "hidden" : "smart")}
						/>
						<span className="slider"></span>
					</label>
				</SettingRow>

				{enabled && (
					<SettingRow
						icon={PanelRight}
						label="Comportamento"
						desc="Controle quando o painel lateral aparece"
						divider={false}
					>
						<select
							className="settings-select"
							value={aiMode}
							onChange={(event) => setAiModeValue(event.target.value)}
						>
							<option value="smart">Inteligente</option>
							<option value="fixed">Fixo</option>
						</select>
					</SettingRow>
				)}
			</div>

			{enabled && (
				<>
					<div className="setting-group-label">MONITORAMENTO</div>
					<div className="setting-group">
						<SettingRow
							icon={RefreshCw}
							label={loading ? "Atualizando..." : "Atualizar limites"}
							desc="Consulta novamente as contas encontradas"
							action
							onClick={refresh}
						/>
						<SettingRow
							icon={ShieldCheck}
							label="Credenciais protegidas"
							desc="O Willow apenas lê sessões locais e nunca mostra tokens na interface"
							divider={false}
						/>
					</div>

					<div className="setting-group-label setting-group-label--spaced">CONTAS ENCONTRADAS</div>
					<div className="setting-group">
						{error ? (
							<SettingRow
								icon={ShieldCheck}
								label="Consulta indisponível"
								desc={error}
								divider={false}
							/>
						) : providers.length === 0 ? (
							<SettingRow
								icon={ShieldCheck}
								label="Nenhuma conta encontrada"
								desc="Entre em um assistente compatível e atualize esta página"
								divider={false}
							/>
						) : (
							providers.map((provider, index) => (
								<SettingRow
									key={provider.id}
									icon={ShieldCheck}
									label={provider.name}
									desc={
										provider.note ||
										(provider.windows.length ? "Limites disponíveis" : "Conta detectada")
									}
									divider={index !== providers.length - 1}
								>
									<span className={`provider-state provider-state--${provider.status}`}>
										{provider.working
											? "Trabalhando"
											: provider.status === "ok"
												? "Pronto"
												: "Atenção"}
									</span>
								</SettingRow>
							))
						)}
					</div>
				</>
			)}
		</>
	);
}
