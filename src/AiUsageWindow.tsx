import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AiUsageIsland } from "./components/AiUsageIsland";

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<AiUsageIsland />
	</StrictMode>
);
