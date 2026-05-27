const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = (env, argv) => {
  const isProd = argv.mode === "production";

  return {
    entry: "./src/index.tsx",
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: isProd ? "[name].[contenthash].js" : "[name].js",
      clean: true,
      publicPath: "",
    },
    resolve: {
      extensions: [".tsx", ".ts", ".jsx", ".js"],
    },
    module: {
      rules: [
        {
          test: /\.[jt]sx?$/,
          exclude: /node_modules/,
          use: "babel-loader",
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader"],
        },
        {
          // Import .jsonc (JSON-with-comments) timing files as a raw string;
          // parsed at runtime (see src/textalive/chorusTimings.ts).
          test: /\.jsonc$/,
          type: "asset/source",
        },
        {
          test: /\.(png|jpe?g|gif|svg|woff2?|ttf|otf)$/,
          type: "asset/resource",
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: "./src/index.html",
      }),
    ],
    devServer: {
      static: path.resolve(__dirname, "public"),
      port: process.env.PORT ? Number(process.env.PORT) : 1234,
      hot: true,
      open: true,
      client: {
        overlay: {
          errors: true,
          warnings: false,
          // Ignore benign media rejections from TextAlive priming its <audio>
          // (canceled fetch / interrupted play / autoplay blocked) in the overlay.
          runtimeErrors: (error) =>
            error?.name !== "AbortError" &&
            error?.name !== "NotAllowedError" &&
            !/aborted by the user agent|interrupted by a call to pause|not allowed by the user agent/i.test(
              error?.message ?? "",
            ),
        },
      },
    },
    devtool: isProd ? "source-map" : "eval-cheap-module-source-map",
    performance: { hints: false },
  };
};
