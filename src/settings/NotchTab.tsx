import {
	PanelTop,
	MoveHorizontal,
	MoveVertical,
	MapPin,
	Calendar,
	BellRing,
	Music,
	Mic,
	Minimize2,
	LayoutList,
	Sparkles,
	Circle,
	CloudSun,
	X
} from "lucide-react";
import { SettingRow } from "./SettingRow";
import { StatusWidgetConfig } from "../components/StatusWidgetConfig";
import type { WidgetConfig } from "./types";
import type { WeatherCityResult } from "./useSettings";

interface NotchTabProps {
	notchMode: string;
	setNotchModeValue: (mode: string) => void;
	notchTriggerPosition: string;
	setNotchTriggerPositionValue: (position: string) => void;
	notchTriggerWidth: number;
	setNotchTriggerWidthValue: (width: number) => void;
	notchTriggerHeight: number;
	setNotchTriggerHeightValue: (height: number) => void;
	calendarEnabled: boolean;
	toggleCalendar: () => void;
	timerSoundEnabled: boolean;
	toggleTimerSound: () => void;
	musicModeEnabled: boolean;
	toggleMusicMode: () => void;
	privacyIndicatorsEnabled: boolean;
	togglePrivacyIndicators: () => void;
	musicCompactNotch: boolean;
	toggleMusicCompactNotch: () => void;
	mediaLayout: "classic" | "compact";
	toggleMediaLayout: (layout: "classic" | "compact") => void;
	mediaAmbienceEnabled: boolean;
	toggleAmbience: () => void;
	mediaCompactGlowEnabled: boolean;
	toggleCompactGlow: () => void;
	weatherEnabled: boolean;
	toggleWeather: () => void;
	tempUnitFahrenheit: boolean;
	toggleTempUnit: () => void;
	cityName: string;
	citySearch: string;
	setCitySearch: (name: string) => void;
	citySearchResults: WeatherCityResult[];
	citySearchStatus: "idle" | "searching" | "empty" | "error";
	showCityDropdown: boolean;
	setShowCityDropdown: (show: boolean) => void;
	selectCity: (city: WeatherCityResult) => void;
	handleCityClear: () => void;
	statusWidgets: WidgetConfig;
	handleWidgetsChange: (config: WidgetConfig) => void;
}

export function NotchTab({
	notchMode,
	setNotchModeValue,
	notchTriggerPosition,
	setNotchTriggerPositionValue,
	notchTriggerWidth,
	setNotchTriggerWidthValue,
	notchTriggerHeight,
	setNotchTriggerHeightValue,
	calendarEnabled,
	toggleCalendar,
	timerSoundEnabled,
	toggleTimerSound,
	musicModeEnabled,
	toggleMusicMode,
	privacyIndicatorsEnabled,
	togglePrivacyIndicators,
	musicCompactNotch,
	toggleMusicCompactNotch,
	mediaLayout,
	toggleMediaLayout,
	mediaAmbienceEnabled,
	toggleAmbience,
	mediaCompactGlowEnabled,
	toggleCompactGlow,
	weatherEnabled,
	toggleWeather,
	tempUnitFahrenheit,
	toggleTempUnit,
	cityName,
	citySearch,
	setCitySearch,
	citySearchResults,
	citySearchStatus,
	showCityDropdown,
	setShowCityDropdown,
	selectCity,
	handleCityClear,
	statusWidgets,
	handleWidgetsChange
}: NotchTabProps) {
	return (
		<>
			<div className="setting-group-label">ILHA</div>
			<div className="setting-group">
				<SettingRow
					icon={PanelTop}
					label="Comportamento da ilha"
					desc="Escolha como a ilha aparece"
				>
					<select
						className="settings-select"
						value={notchMode}
						onChange={(e) => setNotchModeValue(e.target.value)}
					>
						<option value="fixed">Fixo</option>
						<option value="smart">Inteligente</option>
						<option value="peek">Espiar</option>
					</select>
				</SettingRow>

				{notchMode !== "fixed" && (
					<>
						<SettingRow
							icon={MapPin}
							label="Posição do gatilho"
							desc="Escolha onde a borda superior revela a ilha"
						>
							<select
								className="settings-select"
								value={notchTriggerPosition}
								onChange={(event) => setNotchTriggerPositionValue(event.target.value)}
							>
								<option value="left">Esquerda</option>
								<option value="center">Centro</option>
								<option value="right">Direita</option>
								<option value="disabled">Desativado</option>
							</select>
						</SettingRow>

						{notchTriggerPosition !== "disabled" && (
							<>
								<SettingRow
									icon={MoveHorizontal}
									label="Largura do gatilho"
									desc={`${notchTriggerWidth}% da largura da tela`}
								>
									<div className="settings-slider-with-value">
										<input
											type="range"
											min="5"
											max="50"
											step="5"
											value={notchTriggerWidth}
											onChange={(event) => setNotchTriggerWidthValue(parseInt(event.target.value))}
											className="settings-slider"
										/>
										<span>{notchTriggerWidth}%</span>
									</div>
								</SettingRow>

								<SettingRow
									icon={MoveVertical}
									label="Altura sensível"
									desc={`${notchTriggerHeight}px a partir da borda superior`}
								>
									<div className="settings-slider-with-value">
										<input
											type="range"
											min="2"
											max="16"
											step="2"
											value={notchTriggerHeight}
											onChange={(event) => setNotchTriggerHeightValue(parseInt(event.target.value))}
											className="settings-slider"
										/>
										<span>{notchTriggerHeight}px</span>
									</div>
								</SettingRow>
							</>
						)}
					</>
				)}

				<SettingRow
					icon={Mic}
					label="Indicadores de privacidade"
					desc="Mostra quando microfone ou câmera estão em uso"
				>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={privacyIndicatorsEnabled}
							onChange={togglePrivacyIndicators}
						/>
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow
					icon={Calendar}
					label="Calendário e temporizador"
					desc="Ativa a visão dividida de produtividade"
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={calendarEnabled} onChange={toggleCalendar} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				{calendarEnabled && (
					<SettingRow
						icon={BellRing}
						label="Som do temporizador"
						desc="Toca um aviso quando o tempo terminar"
					>
						<label className="toggle-switch">
							<input type="checkbox" checked={timerSoundEnabled} onChange={toggleTimerSound} />
							<span className="slider"></span>
						</label>
					</SettingRow>
				)}

				<SettingRow icon={Music} label="Modo de música" desc="Controle interativo de música">
					<label className="toggle-switch">
						<input type="checkbox" checked={musicModeEnabled} onChange={toggleMusicMode} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				{musicModeEnabled && (
					<>
						<SettingRow
							icon={Minimize2}
							label="Modo compacto"
							desc="Mostra visualizador e capa quando recolhido"
						>
							<label className="toggle-switch">
								<input
									type="checkbox"
									checked={musicCompactNotch}
									onChange={toggleMusicCompactNotch}
								/>
								<span className="slider"></span>
							</label>
						</SettingRow>

						<SettingRow
							icon={LayoutList}
							label="Layout de mídia"
							desc="Escolha o estilo do reprodutor expandido"
						>
							<div className="unit-toggle-minimal wide">
								<button
									type="button"
									className={mediaLayout === "classic" ? "active" : ""}
									onClick={() => toggleMediaLayout("classic")}
									aria-pressed={mediaLayout === "classic"}
								>
									Clássico
								</button>
								<button
									type="button"
									className={mediaLayout === "compact" ? "active" : ""}
									onClick={() => toggleMediaLayout("compact")}
									aria-pressed={mediaLayout === "compact"}
								>
									Compacto
								</button>
							</div>
						</SettingRow>

						<SettingRow
							icon={Sparkles}
							label="Brilho ambiente"
							desc="Brilho colorido atrás da capa expandida"
						>
							<label className="toggle-switch">
								<input type="checkbox" checked={mediaAmbienceEnabled} onChange={toggleAmbience} />
								<span className="slider"></span>
							</label>
						</SettingRow>

						<SettingRow
							icon={Circle}
							label="Brilho compacto"
							desc="Brilho ao redor da miniatura recolhida"
							divider={false}
						>
							<label className="toggle-switch">
								<input
									type="checkbox"
									checked={mediaCompactGlowEnabled}
									onChange={toggleCompactGlow}
								/>
								<span className="slider"></span>
							</label>
						</SettingRow>
					</>
				)}
			</div>

			<div className="setting-group-label">CLIMA</div>
			<div className="setting-group">
				<SettingRow
					icon={CloudSun}
					label="Clima"
					desc={cityName || "Detectar localização automaticamente"}
				>
					<div className="weather-controls">
						<div className="unit-toggle-minimal" onClick={toggleTempUnit}>
							<span className={!tempUnitFahrenheit ? "active" : ""}>C</span>
							<span className={tempUnitFahrenheit ? "active" : ""}>F</span>
						</div>
						<label className="toggle-switch">
							<input type="checkbox" checked={weatherEnabled} onChange={toggleWeather} />
							<span className="slider"></span>
						</label>
					</div>
				</SettingRow>

				{weatherEnabled && (
					<div className="manual-city-input">
						<div className="city-input-row">
							<input
								type="text"
								placeholder="Cidade, estado, país"
								value={citySearch}
								onChange={(e) => setCitySearch(e.target.value)}
								onFocus={() => citySearchResults.length > 0 && setShowCityDropdown(true)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && citySearchResults.length > 0) {
										e.preventDefault();
										selectCity(citySearchResults[0]);
									}
									if (e.key === "Escape") {
										setShowCityDropdown(false);
									}
								}}
								onBlur={() => setTimeout(() => setShowCityDropdown(false), 150)}
							/>
							{citySearchStatus === "searching" && <span className="searching-spinner" />}
							{citySearch && citySearchStatus !== "searching" && (
								<button
									className="city-clear-btn"
									onMouseDown={(e) => {
										e.preventDefault();
										handleCityClear();
									}}
									title="Limpar cidade"
								>
									<X size={10} strokeWidth={2.5} />
								</button>
							)}
						</div>
						{showCityDropdown && citySearchResults.length > 0 && (
							<div className="city-dropdown">
								{citySearchResults.map((city) => (
									<button
										key={`${city.name}-${city.latitude}-${city.longitude}`}
										className="city-dropdown-item"
										onMouseDown={(e) => {
											e.preventDefault();
											selectCity(city);
										}}
									>
										<span className="city-dropdown-name">{city.name}</span>
										<span className="city-dropdown-country">
											{[city.admin1, city.country].filter(Boolean).join(", ")}
										</span>
									</button>
								))}
							</div>
						)}
						{citySearchStatus === "empty" && (
							<div className="city-search-message">
								Local não encontrado. Use cidade, estado, país.
							</div>
						)}
						{citySearchStatus === "error" && (
							<div className="city-search-message error">
								Não foi possível consultar os locais agora.
							</div>
						)}
					</div>
				)}
			</div>

			<div className="setting-group-label">INDICADORES</div>
			<div className="setting-group">
				<StatusWidgetConfig value={statusWidgets} onChange={handleWidgetsChange} />
			</div>
		</>
	);
}
