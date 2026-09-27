export interface DeviceCapabilities {
	hasBattery: boolean;
	hasBrightness: boolean;
	isPortable: boolean;
}

export const DEFAULT_DEVICE_CAPABILITIES: DeviceCapabilities = {
	hasBattery: true,
	hasBrightness: true,
	isPortable: true
};
