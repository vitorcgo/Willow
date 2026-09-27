import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { AiUsageIsland } from "./components/AiUsageIsland";
import { initTheme } from "./theme";

function AiUsageRoot() {
	useEffect(() => initTheme(), []);
	return <AiUsageIsland />;
}

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<AiUsageRoot />
	</StrictMode>
);
