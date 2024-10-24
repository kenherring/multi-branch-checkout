

class NotImplementedError extends Error {
    constructor(message: string = 'Not implemented') {
        super(message)
    }
}

class FileGroupError extends Error {
	constructor (message: string) {
		super(message)
		this.name = 'FileGroupError'
	}
}

class WorktreeNotFoundError extends Error {
	constructor (message: string) {
		super(message)
		this.name = 'WorktreeNotFoundError'
	}
}
