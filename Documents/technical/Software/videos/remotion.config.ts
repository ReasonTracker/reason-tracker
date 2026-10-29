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
    };
});