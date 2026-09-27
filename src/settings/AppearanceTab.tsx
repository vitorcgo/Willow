import { useEffect, useState } from "react";
import {
	Palette,
	Droplet,
	Contrast,
	Droplets,
	Sun,
	Square,
	Maximize2,
	Sparkles
} from "lucide-react";
import { SettingRow } from "./SettingRow";

interface AppearanceTabProps {
	themeMode: string;
	handleThemeModeChange: (mode: string) => void;
	themeColor: string;
	handleThemeColorChange: (color: string) => void;
	backgroundEffect: string;
	handleBackgroundEffectChange: (effect: string) => void;
	themeOpacity: number;
	handleOpacityChange: (val: number) => void;
	themeSaturation: number;
	handleSaturationChange: (val: number) => void;
	themeBrightness: number;
	handleBrightnessChange: (val: number) => void;
	cornersEnabled: boolean;
	toggleCorners: () => void;
	scale: number;
	handleScaleChange: (val: number) => void;
}

export function AppearanceTab({
	themeMode,
	handleThemeModeChange,
	themeColor,
	handleThemeColorChange,
	backgroundEffect,
	handleBackgroundEffectChange,
	themeOpacity,
	handleOpacityChange,
	themeSaturation,
	handleSaturationChange,
	themeBrightness,
	handleBrightnessChange,
	cornersEnabled,
	toggleCorners,
	scale,
	handleScaleChange
}: AppearanceTabProps) {
	const showCustomColor = themeMode === "custom";
	const showAdvancedSliders = themeMode === "custom" || themeMode === "adaptive";
	const [colorDraft, setColorDraft] = useState(themeColor.toUpperCase());
	const validColor = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(colorDraft);

	useEffect(() => setColorDraft(themeColor.toUpperCase()), [themeColor]);

	const commitColorDraft = () => {
		if (validColor) handleThemeColorChange(colorDraft.toLowerCase());
		else setColorDraft(themeColor.toUpperCase());
	};

	return (
		<>
			<div className="setting-group-label">TEMA UNIFICADO</div>
			<div className="setting-group">
				<SettingRow
					icon={Palette}
					label="Modo do tema"
					desc="Aplica o mesmo visual à ilha, ao dock, à IA e aos indicadores"
				>
					<select
						className="settings-select"
						value={themeMode}
						onChange={(e) => handleThemeModeChange(e.target.value)}
					>
						<option value="dark">Escuro translúcido</option>
						<option value="light">Claro translúcido</option>
						<option value="custom">Cor personalizada</option>
						<option value="adaptive">Cor adaptável</option>
					</select>
				</SettingRow>

				{showCustomColor && (
					<SettingRow
						icon={Droplet}
						label="Cor do tema"
						desc="Escolha uma cor para toda a interface"
					>
						<div className="color-picker-row">
							<input
								type="color"
								value={themeColor.slice(0, 7)}
								onChange={(e) =>
									handleThemeColorChange(`${e.target.value}${themeColor.slice(7, 9)}`)
								}
								className="color-picker-input"
							/>
							<input
								className={`color-hex-input ${validColor ? "" : "invalid"}`}
								value={colorDraft}
								onChange={(event) => setColorDraft(event.target.value)}
								onBlur={commitColorDraft}
								onKeyDown={(event) => {
									if (event.key === "Enter") event.currentTarget.blur();
								}}
								aria-label="Cor hexadecimal com alfa opcional"
								spellCheck={false}
							/>
						</div>
					</SettingRow>
				)}

				<SettingRow
					icon={Sparkles}
					label="Material do fundo"
					desc="Desfoque opcional preservando textos e ícones nítidos"
				>
					<select
						className="settings-select"
						value={backgroundEffect}
						onChange={(event) => handleBackgroundEffectChange(event.target.value)}
					>
						<option value="none">Transparente</option>
						<option value="blur">Desfoque</option>
						<option value="acrylic">Acrílico fosco</option>
					</select>
				</SettingRow>

				<SettingRow
					icon={Contrast}
					label="Opacidade do fundo"
					desc={`Ajuste a transparência do tema (${Math.round(themeOpacity * 100)}%)`}
					divider={showAdvancedSliders}
				>
					<input
						type="range"
						min="0.1"
						max="1.0"
						step="0.05"
						value={themeOpacity}
						onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
						className="settings-slider"
					/>
				</SettingRow>

				{showAdvancedSliders && (
					<>
						<SettingRow
							icon={Droplets}
							label="Saturação da cor"
							desc={`Ajuste a intensidade da cor (${Math.round(themeSaturation * 100)}%)`}
						>
							<input
								type="range"
								min="0.0"
								max="1.0"
								step="0.02"
								value={themeSaturation}
								onChange={(e) => handleSaturationChange(parseFloat(e.target.value))}
								className="settings-slider"
							/>
						</SettingRow>

						<SettingRow
							icon={Sun}
							label="Brilho do fundo"
							desc={`Ajuste a luminosidade do fundo (${Math.round(themeBrightness * 100)}%)`}
							divider={false}
						>
							<input
								type="range"
								min="0.0"
								max="1.0"
								step="0.02"
								value={themeBrightness}
								onChange={(e) => handleBrightnessChange(parseFloat(e.target.value))}
								className="settings-slider"
							/>
						</SettingRow>
					</>
				)}
			</div>

			<div className="setting-group-label">EXIBIÇÃO</div>
			<div className="setting-group">
				<SettingRow icon={Square} label="Cantos da tela" desc="Bordas superiores arredondadas">
					<label className="toggle-switch">
						<input type="checkbox" checked={cornersEnabled} onChange={toggleCorners} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow
					icon={Maximize2}
					label="Escala da interface e da fonte"
					desc={`Ajuste o tamanho da interface (${Math.round(scale * 100)}%)`}
					divider={false}
				>
					<div className="scale-button-container">
						<button
							onClick={() => handleScaleChange(Math.max(0.8, parseFloat((scale - 0.1).toFixed(1))))}
							disabled={scale <= 0.8}
							className="scale-adjust-btn"
							title="Diminuir escala"
						>
							−
						</button>
						<span className="scale-display-value">{Math.round(scale * 100)}%</span>
						<button
							onClick={() => handleScaleChange(Math.min(1.3, parseFloat((scale + 0.1).toFixed(1))))}
							disabled={scale >= 1.3}
							className="scale-adjust-btn"
							title="Aumentar escala"
						>
							+
						</button>
					</div>
				</SettingRow>
			</div>
		</>
	);
}
