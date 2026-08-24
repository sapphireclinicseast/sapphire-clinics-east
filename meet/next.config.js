const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The join app lives inside the Ops Hub monorepo; both dirs have a lockfile,
  // so pin the root to THIS folder or Next walks up and compiles the parent
  // app's instrumentation. Served at https://meet.sapphireclinicseast.org.
  turbopack: { root: __dirname },
  outputFileTracingRoot: path.join(__dirname),
}

module.exports = nextConfig
