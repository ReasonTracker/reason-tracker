import path from "node:path";
import { Config } from "@remotion/cli/config";

Config.overrideWebpackConfig((currentConfiguration) => {
    return {
        ...currentConfiguration,
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