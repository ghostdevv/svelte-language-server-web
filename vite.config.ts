import { defineConfig, Plugin as VitePlugin } from "vite";
import { Plugin, PluginBuild } from "esbuild";
import dts from "vite-plugin-dts";
import { readdirSync, readFileSync } from "fs";
import glob from "fast-glob";
import * as path from "path";
import { readFile } from "fs/promises";
import { createRequire } from "module";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const require = createRequire(import.meta.url);
const moduleShimmerName = "ModuleShimmer";

interface SourcemapExclude {
	excludeNodeModules?: boolean;
}

export function sourcemapExclude(opts?: SourcemapExclude): VitePlugin {
	return {
		name: "sourcemap-exclude",
		transform(code: string, id: string) {
			if (opts?.excludeNodeModules && id.includes("node_modules")) {
				return {
					code,
					// https://github.com/rollup/rollup/blob/master/docs/plugin-development/index.md#source-code-transformations
					map: { mappings: "" },
				};
			}
		},
	};
}
const __dirname = path.resolve(".");
const moduleShimmer: Plugin = {
	name: moduleShimmerName,
	setup(build: PluginBuild) {
		function escapeRegex(string) {
			return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
		}
		build.onLoad({ filter: /chokidar\/lib\/constants\.js/ }, (args) => {
			const contents = readFileSync(args.path, { encoding: "utf-8" }).replace(
				"os.type()",
				"null",
			);
			return {
				contents,
				loader: "ts",
				resolveDir: path.resolve("/node_modules/chokidar/lib/constants.js"),
			};
		});
		const moduleShims = Object.fromEntries(
			readdirSync(path.resolve(__dirname, "module_shims")).map((filename) => [
				filename.replace(".ts", ""),
				readFileSync(
					path.resolve(__dirname, "module_shims", filename),
				).toString(),
			]),
		);

		build.onLoad({ filter: /prettier\/standalone/ }, async (args) => {
			const contentsBuffer = await readFile(args.path);
			const contents = contentsBuffer
				.toString()
				.replace(/require\(\"/g, 'rekuire("');
			return { contents };
		});

		build.onResolve({ filter: /^typescript$/ }, async (_args) => {
			console.log("TS", _args.importer);
			if (
				_args.importer.includes("typescript.ts") ||
				_args.importer.includes("@typescript/vfs")
			)
				return {
					path: path.resolve(
						__dirname,
						"node_modules/typescript/lib/typescript.js",
					),
				};

			return {
				path: path.resolve(__dirname, "module_shims/typescript.ts"),
			};
		});

		// w/o this webCustomData.js included twice - as umd and as esm
		build.onResolve(
			{ filter: /.*vscode-html-languageservice.*webCustomData/ },
			(args) => {
				return {
					path: require.resolve(
						"vscode-html-languageservice/lib/esm/languageFacts/data/webCustomData.js",
					),
				};
			},
		);

		for (const mod of Object.keys(moduleShims)) {
			build.onResolve(
				{ filter: new RegExp("^" + escapeRegex(mod) + "$") },
				(args) => ({
					path: mod,
					namespace: moduleShimmerName,
				}),
			);
		}

		build.onLoad(
			{
				filter: /\/svelte-preprocess\/dist\/autoPreprocess\.js/,
			},
			async (args) => {
				const contents = await await readFile(
					path.resolve(
						__dirname,
						"node_modules/svelte-preprocess/dist/autoProcess.js",
					),
				).then((x) => x.toString());
				// .replace("synchronizeHostData()", "if (false)");
				return {
					contents,
					loader: "ts",
					resolveDir: path.resolve(
						__dirname,
						"node_modules/svelte-preprocess/dist/",
					),
				};
			},
		);

		build.onLoad({ filter: /.*/, namespace: moduleShimmerName }, (args) => {
			const contents = moduleShims[args.path];
			return { contents, loader: "ts", resolveDir: "node_modules" };
		});
	},
};

export default defineConfig({
	build: {
		reportCompressedSize: false,
		commonjsOptions: {
			sourceMap: false,
			transformMixedEsModules: true,
			requireReturnsDefault: "auto",
			ignoreDynamicRequires: true,
			dynamicRequireTargets: [
				"node_modules/svelte-language-server/dist/src/importPackage.js",
				"svelte/package.json",
			],
		},
		minify: "esbuild",
		// lib: {
		// 	formats: ["es"],
		// 	fileName: "svelte-language-server-web",
		// 	entry: "./src/main.ts",
		// },
		rollupOptions: {
			watch: false,
			output: {
				freeze: false,
			},
		},
	},
	worker: {
		plugins: [moduleShimmer],
		rollupOptions: { output: { freeze: false } },
	},
	resolve: {
		alias: [
			{
				find: /vscode.html.languageservice.lib.umd.*webCustomData/,
				replacement:
					"vscode-html-languageservice/lib/esm/languageFacts/data/webCustomData.js",
			},
			{
				find: "events",
				replacement: "events",
			},
			{
				find: /^fs$/,
				replacement: path.resolve("./module_shims/fs.ts"),
			},

			{
				find: /^path$/,
				replacement: path.resolve("./deps/path-deno.ts"),
			},

			{
				find: /^perf_hooks$/,
				replacement: path.resolve("./module_shims/perf_hooks.ts"),
			},
			{
				find: /^util$/,
				replacement: path.resolve("./module_shims/util.ts"),
			},
			{
				find: /^os$/,
				replacement: path.resolve("./module_shims/os.ts"),
			},
			{
				find: /^process$/,
				replacement: path.resolve("./module_shims/process.ts"),
			},
			{
				find: /^stylus$/,
				replacement: path.resolve("./module_shims/stylus.ts"),
			},
		],
	},
	plugins: [
		nodePolyfills({
			globals: { Buffer: true, global: true, process: true },
			exclude: [
				"_stream_duplex",
				"_stream_passthrough",
				"_stream_readable",
				"assert",
				"buffer",
				"child_process",
				"cluster",
				"zlib",
				"tls",
				"vm",
				"fs",
				"console",
				"util",
				"fs",
				"crypto",
				"dgram",
				"dns",
			],
			protocolImports: true,
		}),
		// dts({ clearPureImport: false, copyDtsFiles: true, rollupTypes: true }),
		moduleShimmer,
		sourcemapExclude({ excludeNodeModules: true }),
	],
	esbuild: {
		sourcemap: false,
		minifyWhitespace: true,
		minifyIdentifiers: true,
		minifySyntax: true,

		define: {
			global: "globalThis",
			__dirname: '""',
			_self: "globalThis",
			__filename: '""',
			define: "null",
			importScripts: "_importScripts",
			Buffer: "_Buffer",
			importSvelte: "_importSvelte",
			importSveltePreprocess: "_importSveltePreprocess",
			importPrettier: "_importPrettier",
			sorcery_1: "_sorceryShim",
			__importStar: "__importStar",
			__importDefault: "__importDefault",
		},

		platform: "browser",
	},
	optimizeDeps: {
		needsInterop: [
			"prettier",
			"url",
			"typescript",
			"./deps/svelte-language-server",
		],
		esbuildOptions: {
			plugins: [moduleShimmer],
			define: {
				global: "globalThis",
				__dirname: '""',
				_self: "globalThis",
				__filename: '""',
				define: "null",
				importScripts: "_importScripts",
				Buffer: "_Buffer",
				importSvelte: "_importSvelte",
				importSveltePreprocess: "_importSveltePreprocess",
				importPrettier: "_importPrettier",
				sorcery_1: "_sorceryShim",
				__importStar: "__importStar",
				__importDefault: "__importDefault",
			},
		},
		include: [
			...glob.sync("./src/**/*.ts", { absolute: true }),
			"svelte",
			"svelte-preprocess/dist/transformers/typescript.js",
		],
		exclude: ["svelte-language-sever > graceful-fs", "vscode-uri", "stylus"],
	},
});
