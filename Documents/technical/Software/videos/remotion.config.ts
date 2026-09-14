import path from "node:path";
import { Config } from "@remotion/cli/config";

Config.overrideWebpackConfig((currentConfiguration) => {
    const episodeDefinitionLoader = path.resolve(process.cwd(), "scripts/load-episode-definition.mjs");
    return {
        ...currentConfiguration,
        module: {
            ...currentConfiguration.module,
            rules: [
                {
                    test: /[\\/]episode\.json$/,
                    type: "javascript/auto",
                    use: episodeDefinitionLoader,
                },
                {
                    enforce: "post",
                    test: /[\\/]episode\.ts$/,
                    use: episodeDefinitionLoader,
                },
                ...(currentConfiguration.module?.rules ?? []),
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