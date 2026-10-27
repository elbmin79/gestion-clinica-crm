/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Prevent parallel output-directory creation races on Windows.
    cpus: 1,
  },
};

export default nextConfig;
