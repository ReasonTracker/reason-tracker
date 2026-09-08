import path from "node:path";
import { Config } from "@remotion/cli/config";

Config.overrideWebpackConfig((currentConfiguration) => {
    return {
        ...currentConfiguration,
        module: {
            ...currentConfiguration.module,
            rules: [
                ...(currentConfiguration.module?.rules ?? []),
                {
                    test: /[\\/]episode\.json$/,
                    type: "javascript/auto",
                    use: path.resolve(process.cwd(), "scripts/load-external-episode-json.mjs"),
                },
            ],
        },
        resolve: {
            ...currentConfiguration.resolve,
            alias: {
                ...(currentConfiguration.resolve?.alias ?? {}),
                "@app": path.resolve(process.cwd(), "../app/src"),
                "@debate-core": path.resolve(process.cwd(), "../app/src/debate-core"),
                "@planner": path.resolve(process.cwd(), "../app/src/planner"),
                "@website": path.resolve(process.cwd(), "../website/site"),
            },
        },
    };
});