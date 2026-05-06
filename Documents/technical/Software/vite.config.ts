import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vite-plus";

export default defineConfig({
    plugins: [tsconfigPaths()],
});