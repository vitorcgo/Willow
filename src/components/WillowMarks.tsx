import type { ImgHTMLAttributes } from "react";

type MarkProps = ImgHTMLAttributes<HTMLImageElement> & { title?: string };

export function WillowDuckMark({ title = "Willow", alt, ...props }: MarkProps) {
	return <img src="/willow-duck-white.png" alt={alt ?? title} title={title} {...props} />;
}

export function WillowJournalMark({ title = "Willow Journal", alt, ...props }: MarkProps) {
	return (
		<img
			src="/willow-journal-pixel.png"
			alt={alt ?? title}
			title={title}
			{...props}
		/>
	);
}
