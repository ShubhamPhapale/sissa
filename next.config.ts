import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	turbopack: {
		root: __dirname,
	},
	serverExternalPackages: ["stockfish"],
	eslint: {
		ignoreDuringBuilds: true,
	},
};

export default nextConfig;
