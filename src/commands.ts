import * as vscode from 'vscode'
import { WorktreeFile, WorktreeFileGroup, WorktreeNode, WorktreeRoot } from "./worktreeView"

export function registerCommand(command: string, callback: (node: WorktreeNode) => any) {
	return vscode.commands.registerCommand('multi-branch-commit.' + command, (node: WorktreeNode) => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
		let p = callback(node)
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		if (!p.then) {
			p = Promise.resolve(p)
		}


		// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
		return p.then((r: any) => {
			console.log('command completed successfully: ' + command + '(r=' + r + ')')
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return r
		}, (e: any) => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			let msgtxt = e.toString()
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			if (e.stderr) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
				msgtxt = e.stderr
			}
			return vscode.window.showWarningMessage('Command ' + command + 'failed!\n' + msgtxt)
				.then(() => { throw e })
		})
	})
}

export function commands_discardChanges(node: WorktreeNode) {
	if (node instanceof WorktreeFile) {
		return vscode.commands.executeCommand('git.clean', { uri: node.uri })
	} else if (node instanceof WorktreeFileGroup) {
		return vscode.window.showWarningMessage('Not yet implemented')
	} else if (node instanceof WorktreeRoot) {
		return vscode.window.showWarningMessage('Not yet implemented')
	} else {
		throw new Error('Discard changes not supported for node type (node.id=' + node.id + ')')
	}
}
