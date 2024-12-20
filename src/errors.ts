

export class NotImplementedError extends Error {
    constructor(message: string = 'Not implemented') {
        super(message)
		this.name = 'NotImplemtentedError'
    }
}

export class FileGroupError extends Error {
	constructor (message: string) {
		super(message)
		this.name = 'FileGroupError'
	}
}

export class GitError extends Error {
	constructor (message: string, public readonly code: number) {
		super(message)
		this.name = 'GitError'
	}
}

export class WorktreeParentError extends Error {
	constructor (message: string) {
		super(message)
		this.name = 'WorktreeParentError'
	}
}

export class WorktreeNotFoundError extends Error {
	constructor (message: string) {
		super(message)
		this.name = 'WorktreeNotFoundError'
	}
}

export class UpdateTreeError extends Error {
	constructor (message: string) {
		super(message)
		this.name = 'UpdateTreeError'
	}
}
