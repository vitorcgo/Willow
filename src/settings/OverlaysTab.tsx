import { Volume2, Sun, ArrowLeftToLine, ArrowRightToLine } from "lucide-react";
import { SettingRow } from "./SettingRow";
import type { DeviceCapabilities } from "../deviceCapabilities";

interface OverlaysTabProps {
	volumeOverlayEnabled: boolean;
	toggleVolumeOverlay: () => void;
	volumeEdgeEnabled: boolean;
	toggleVolumeEdge: () => void;
	brightnessOverlayEnabled: boolean;
	toggleBrightnessOverlay: () => void;
	brightnessEdgeEnabled: boolean;
	toggleBrightnessEdge: () => void;
	deviceCapabilities: DeviceCapabilities;
}

export function OverlaysTab({
	volumeOverlayEnabled,
	toggleVolumeOverlay,
	volumeEdgeEnabled,
	toggleVolumeEdge,
	brightnessOverlayEnabled,
	toggleBrightnessOverlay,
	brightnessEdgeEnabled,
	toggleBrightnessEdge,
	deviceCapabilities
}: OverlaysTabProps) {
	return (
		<>
			<div className="setting-group-label">PAINÉIS</div>
			<div className="setting-group">
				<SettingRow icon={Volume2} label="Painel de volume" desc="Controle de volume do Willow">
					<label className="toggle-switch">
						<input type="checkbox" checked={volumeOverlayEnabled} onChange={toggleVolumeOverlay} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				{volumeOverlayEnabled && (
					<SettingRow
						icon={ArrowLeftToLine}
						label="Mostrar ao tocar a borda"
						desc="Abre pela borda esquerda"
					>
						<label className="toggle-switch">
							<input type="checkbox" checked={volumeEdgeEnabled} onChange={toggleVolumeEdge} />
							<span className="slider"></span>
						</label>
					</SettingRow>
				)}

				{deviceCapabilities.hasBrightness && (
					<SettingRow icon={Sun} label="Painel de brilho" desc="Controle de brilho do Willow">
						<label className="toggle-switch">
							<input
								type="checkbox"
								checked={brightnessOverlayEnabled}
								onChange={toggleBrightnessOverlay}
							/>
							<span className="slider"></span>
						</label>
					</SettingRow>
				)}

				{deviceCapabilities.hasBrightness && brightnessOverlayEnabled && (
					<SettingRow
						icon={ArrowRightToLine}
						label="Mostrar ao tocar a borda"
						desc="Abre pela borda direita"
						divider={false}
					>
						<label className="toggle-switch">
							<input
								type="checkbox"
								checked={brightnessEdgeEnabled}
								onChange={toggleBrightnessEdge}
							/>
							<span className="slider"></span>
						</label>
					</SettingRow>
				)}
			</div>
		</>
	);
}
