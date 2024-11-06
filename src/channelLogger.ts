/* eslint-disable no-console */
import { LogLevel, TestRun, window } from 'vscode'
import path from 'path'

enum NotificationType {
	Info = 'Info',
	Warn = 'Warn',
	Error = 'Error',
}

class Logger {
	private static instance: Logger

	private readonly logOutputChannel
	private readonly consoleLogLevel = LogLevel.Info
	private readonly testResultsLogLevel = LogLevel.Info
	private logLevel: number
	// private readonly consoleTimestamp = extMode === ExtensionMode.Development
	private readonly consoleTimestamp = true
	private testResultsTimestamp = false
	private readonly extensionCodeDir = path.normalize(__dirname + '/../..')
	notificationsEnabled = true

	private constructor (extCodeDir?: string) {
		this.logLevel = LogLevel.Info
		this.logOutputChannel = window.createOutputChannel('ABLUnit', { log: true })
		this.logOutputChannel.clear()
		this.info('ABLUnit output channel created (logLevel=' + this.logOutputChannel.logLevel + ')')
		this.logOutputChannel.onDidChangeLogLevel((e) => { this.setLogLevel(e) })
		if (extCodeDir) {
			this.extensionCodeDir = extCodeDir
		}
	}

	public static getInstance () {
		Logger.instance = new Logger()
		Logger.instance.clearOutputChannel()
		return Logger.instance
	}

	clearOutputChannel () {
		this.logOutputChannel.clear()
	}

	setLogLevel (e: LogLevel) {
		const message = 'ABLUnit ogLevel changed from ' + this.logLevel + ' to ' + e
		log.info(message)
		this.logOutputChannel.appendLine(message)
		this.logLevel = e
	}

	getLogLevel () {
		return this.logLevel
	}

	setTestResultsTimestamp (e: boolean) {
		this.testResultsTimestamp = e
	}

	trace (message: string, stackTrace = true) {
		this.writeMessage(LogLevel.Trace, message, stackTrace)
	}

	debug (message: string) {
		this.writeMessage(LogLevel.Debug, message)
	}

	info (message: string) {
		this.writeMessage(LogLevel.Info, message)
	}

	warn (message: string) {
		this.writeMessage(LogLevel.Warning, message)
	}

	error (message: string | Error) {
		if (message instanceof Error) {
			if (message.stack) {
				message = '[' + message.name + '] ' +  message.message + '\r\r' + message.stack
			} else {
				message = '[' + message.name + '] ' +  message.message
			}
		}
		this.writeMessage(LogLevel.Error, message)
	}

	notification (message: string, notificationType: NotificationType = NotificationType.Info) {
		const logMessage = 'NOTIFICATION: ' + message + ' (type=' + notificationType + ', enabled=' + this.notificationsEnabled + ')'
		switch (notificationType) {
			case NotificationType.Info:
				log.info(logMessage)
				if (this.notificationsEnabled) {
					void window.showInformationMessage(message)
				}
				void window.showInformationMessage(message)
				break
			case NotificationType.Warn:
				log.warn(logMessage)
				void window.showWarningMessage(message)
				break
			case NotificationType.Error:
				log.error(logMessage)
				void window.showErrorMessage(message)
				break
		}
	}

	notificationWarningSync (message: string) {
		log.warn(message)
		return window.showWarningMessage(message)
	}

	notificationWarning (message: string) {
		log.warn(message)
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const p = window.showWarningMessage(message).then(() => { return }, () => { return })
		return
	}

	notificationError (message: string) {
		log.error(message)
		return window.showErrorMessage(message)
	}

	private writeMessage (messageLevel: LogLevel, message: string, includeStack = false) {
		const datetime = new Date().toISOString()
		this.writeToChannel(messageLevel, message, includeStack)

		if (messageLevel >= this.consoleLogLevel) {
			this.writeToConsole(messageLevel, message, includeStack)
		}
	}

	private writeToChannel (messageLevel: LogLevel, message: string, includeStack: boolean) {
		message = '[' + this.getCallerSourceLine() + '] ' + message
		switch (messageLevel) {
			case LogLevel.Trace:
				if(includeStack) { this.logOutputChannel.debug('Trace: ' + message); break }
				else { this.logOutputChannel.trace(message); break }
			case LogLevel.Debug:	this.logOutputChannel.debug(message); break
			case LogLevel.Info:		this.logOutputChannel.info(message); break
			case LogLevel.Warning:	this.logOutputChannel.warn(message); break
			case LogLevel.Error:	this.logOutputChannel.error(message); break
			default:
				this.logOutputChannel.appendLine(message)
				throw new Error('invalid log level for message! level=' + messageLevel + ', message=' + message)
		}
	}

	private writeToConsole (messageLevel: LogLevel, message: string, includeStack: boolean) {
		message = this.decorateMessage(messageLevel, message, includeStack)
		if (this.consoleTimestamp) {
			message = '[' + new Date().toISOString() + '] ' + message
		}
		switch (messageLevel) {
			case LogLevel.Trace:
				if (includeStack) { console.trace(message) }
				else { console.debug('Trace: ' + message) }
				break
			case LogLevel.Debug:    console.debug(message); break
			case LogLevel.Info:     console.info(message); break
			case LogLevel.Warning:  log.warn(message); break
			case LogLevel.Error:    log.error(message); break
			default:                log.info(message); break
		}
	}

	private getCallerSourceLine () {
		const prepareStackTraceOrg = Error.prepareStackTrace
		const err = new Error()
		Error.prepareStackTrace = (_, stack) => stack
		const stack = err.stack as unknown as NodeJS.CallSite[]
		Error.prepareStackTrace = prepareStackTraceOrg

		for (const s of stack) {
			const filename = s.getFileName()
			if (filename && filename !== __filename && !filename.endsWith('extensionHostProcess.js')) {
				const funcname = s.getFunctionName()
				let ret = path.relative(this.extensionCodeDir, filename).replace(/\\/g, '/') + ':' + s.getLineNumber()
				if (funcname) {
					ret = ret + ' ' + funcname
				}
				return ret
			}
		}
	}

	private getLevelText (messageLevel: LogLevel) {
		switch (messageLevel) {
			case LogLevel.Off:		return 'Off  '
			case LogLevel.Trace:	return 'Trace'
			case LogLevel.Debug:	return 'Debug'
			case LogLevel.Info:		return 'Info '
			case LogLevel.Warning:	return 'Warn '
			case LogLevel.Error:	return 'Error'
		}
	}


	private decorateMessage (messageLevel: LogLevel, message: string, includeStack = false) {
		if (includeStack) {
			return '[' + this.getLevelText(messageLevel) + '] ' + message
		}
		return '[' + this.getLevelText(messageLevel) + '] [' + this.getCallerSourceLine() + '] '  + message
	}

}

export const log = Logger.getInstance()