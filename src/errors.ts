

export class NotImplementedError extends Error {
    constructor(message: string = 'Not implemented') {
        super(message)
    }
}

export class FileGroupError extends Error {
	constructor (message: string) {
		super(message)
		this.name = 'FileGroupError'
	}
}

export class WorktreeNotFoundError extends Error {
	constructor (message: string) {
		super(message)
		this.name = 'WorktreeNotFoundError'
	}
}
