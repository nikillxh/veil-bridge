import { createRequire } from "module";

const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
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
