import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // Pre-staged for the Magistrate install, which is not wired up yet.
      //
      // @FO-Enablement-Vivint/magistrate >= 1.0.6 imports "next/navigation.js".
      // The explicit .js skips Next's server build of that module, so inside an
      // API route Turbopack loads the browser version and fails ("Could not
      // parse module … app-route/vendored/contexts/app-router-context.js").
      // Pointing it back at the normal entry makes Next pick the right build.
      // Carried over from shx-lead-tracker, where this was found the hard way.
      'next/navigation.js': 'next/navigation',
    },
  },
};

export default nextConfig;
