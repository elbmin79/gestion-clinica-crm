/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() { return [{ source: '/sw.js', headers: [{key:'Cache-Control',value:'no-cache, no-store, must-revalidate'},{key:'Content-Security-Policy',value:"default-src 'self'; script-src 'self'"}] }]; },
  experimental: {
    // Prevent parallel output-directory creation races on Windows.
    cpus: 1,
  },
};

export default nextConfig;
