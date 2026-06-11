import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            // Mirror tsconfig's `@/*` → repo root.
            "@": fileURLToPath(new URL(".", import.meta.url)),
            // `import "server-only"` throws outside a react-server build;
            // alias it to an empty stub so server libs are unit-testable.
            "server-only": fileURLToPath(
                new URL("./test/stubs/server-only.ts", import.meta.url),
            ),
        },
    },
    test: {
        include: ["**/*.test.ts"],
        exclude: ["node_modules/**", ".next/**"],
    },
});
