import { context } from "esbuild";

const ctx = await context({
    entryPoints: ["./src/index.ts"],
    outfile: "dist/index.js",
    bundle: true,
    minify: true,
    legalComments: "none",
    sourcemap: "inline",
    target: "esnext",
    platform: "node",
    allowOverwrite: true,
    tsconfig: "tsconfig.json",
    format: "esm",
    banner: {
        js: `import { createRequire } from 'module';const require = createRequire(import.meta.url);`
    }
});
await ctx.rebuild();
process.exit(0);