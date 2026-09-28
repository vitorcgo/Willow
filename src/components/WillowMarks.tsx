import type { ImgHTMLAttributes, SVGProps } from "react";

type MarkProps = SVGProps<SVGSVGElement> & { title?: string };
type DuckMarkProps = ImgHTMLAttributes<HTMLImageElement> & { title?: string };

export function WillowDuckMark({ title = "Willow", alt, ...props }: DuckMarkProps) {
	return <img src="/willow-duck-white.png" alt={alt ?? title} title={title} {...props} />;
}

export function WillowJournalMark({ title, ...props }: MarkProps) {
	return (
		<svg
			viewBox="0 0 64 64"
			fill="none"
			aria-hidden={title ? undefined : true}
			{...props}
		>
			{title && <title>{title}</title>}
			<image
				href="/willow-duck-white.png"
				x="2"
				y="10"
				width="60"
				height="48"
				preserveAspectRatio="xMidYMid meet"
			/>
			<g stroke="#f8f8f2" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
				<path
					d="M27 34.5c3.8-1.8 7.3-1.2 9.2 1.2v13.1c-2-2.2-5.4-2.9-9.2-1.2Z"
					fill="#08090b"
				/>
				<path
					d="M45.4 34.5c-3.8-1.8-7.3-1.2-9.2 1.2v13.1c2-2.2 5.4-2.9 9.2-1.2Z"
					fill="#08090b"
				/>
				<path d="M36.2 36v12.3" />
			</g>
		</svg>
	);
}
