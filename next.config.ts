import type {NextConfig} from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: [
    "192.168.0.118",
    "192.168.0.119"
  ],
};

export default nextConfig;
