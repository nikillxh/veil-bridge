import { createRequire } from "module";

const require = createRequire(import.meta.url);

// Server-only secrets/config for the /api/relay route. These are referenced
// exclusively in server code, so listing them here inlines the build-time
// values into the server bundle only (never the client bundle). This makes the
// route robust to platforms that do not surface non-public env vars to the
// function runtime. Keys without a build-time value fall through to a normal
// runtime process.env lookup (e.g. local `next start`).
const serverEnv = {};
for (const key of ["RELAYER_PRIVATE_KEY", "SEPOLIA_RPC_URL", "QIE_RPC_URL"]) {
  if (process.env[key]) serverEnv[key] = process.env[key];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  env: serverEnv,
  webpack: (config, { webpack }) => {
    // snarkjs and circomlibjs reference Node builtins that do not exist in the
    // browser. Stub the missing ones and polyfill Buffer/process.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
      readline: false,
      os: false,
      stream: false,
      buffer: require.resolve("buffer/"),
      process: require.resolve("process/browser"),
    };
    config.plugins.push(
      new webpack.ProvidePlugin({
        Buffer: ["buffer", "Buffer"],
        process: "process/browser",
      }),
      // pino-pretty is an optional dev dependency of the walletconnect logger.
      new webpack.IgnorePlugin({ resourceRegExp: /^pino-pretty$/ }),
      // @metamask/sdk (pulled in by the wagmi connectors barrel) optionally
      // requires a React Native storage module that does not exist on web.
      new webpack.IgnorePlugin({ resourceRegExp: /^@react-native-async-storage\/async-storage$/ }),
    );
    config.experiments = { ...config.experiments, asyncWebAssembly: true, topLevelAwait: true };
    return config;
  },
};

export default nextConfig;
