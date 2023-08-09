import { FSWatcher, watch } from "chokidar";
// console.log(chokidar);
import { debounce } from "lodash-es";
import { join, posix } from "path";
import {
	DidChangeWatchedFilesParams,
	FileChangeType,
	FileEvent,
} from "vscode-languageserver/browser";
import { pathToUrl } from "../utils";

type DidChangeHandler = (para: DidChangeWatchedFilesParams) => void;

const DELAY = 50;
export class FallbackWatcher {
	private readonly watcher: ReturnType<typeof watch>;
	private readonly callbacks: DidChangeHandler[] = [];

	private undeliveredFileEvents: FileEvent[] = [];

	constructor(glob: string, workspacePaths: string[]) {
		const gitOrNodeModules = /\.git|node_modules/;
		this.watcher = watch(
			workspacePaths.map((workspacePath) => join(workspacePath, glob)),
			{
				ignored: (path: string) =>
					gitOrNodeModules.test(path) &&
					// Handle Sapper's alias mapping
					!path.includes("src/node_modules") &&
					!path.includes("src\\node_modules"),

				// typescript would scan the project files on init.
				// We only need to know what got updated.
				ignoreInitial: true,
				ignorePermissionErrors: true,
			},
		);
		console.log(this.watcher);
		this.watcher
			.on("add", (path) => this.onFSEvent(path, FileChangeType.Created))
			.on("unlink", (path) => this.onFSEvent(path, FileChangeType.Deleted))
			.on("change", (path) => this.onFSEvent(path, FileChangeType.Changed));
	}

	private convert(path: string, type: FileChangeType): FileEvent {
		return {
			type,
			uri: posix.toFileUrl(path).toString(),
		};
	}

	private onFSEvent(path: string, type: FileChangeType) {
		const fileEvent = this.convert(path, type);
		console.log({ path, type, fileEvent });
		this.undeliveredFileEvents.push(fileEvent);
		this.scheduleTrigger();
	}

	private readonly scheduleTrigger = debounce(() => {
		const para: DidChangeWatchedFilesParams = {
			changes: this.undeliveredFileEvents,
		};
		this.undeliveredFileEvents = [];

		this.callbacks.forEach((callback) => callback(para));
	}, DELAY);

	onDidChangeWatchedFiles(callback: DidChangeHandler) {
		this.callbacks.push(callback);
	}

	dispose() {
		this.watcher.close();
	}
}
