const isStaticExport = process.env.NEXT_OUTPUT_MODE === "export";

/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  output: isStaticExport ? "export" : undefined,
  trailingSlash: isStaticExport,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
