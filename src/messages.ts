export const workerRPCMethods = ["@@setup", "@@add-files"] as const;
export type WorkerRPCMethod = (typeof workerRPCMethods)[number];

type URI = string;
type FileContents = string;

type WorkerMessage<T extends WorkerRPCMethod> = {
	method: T;
	params: Record<URI, FileContents>;
};

type SetupMessage = WorkerMessage<"@@setup">;

type AddFilesMessage = WorkerMessage<"@@add-files">;

export type { WorkerMessage, SetupMessage, AddFilesMessage };