import * as vscode from 'vscode'
import { workerData } from "worker_threads"
import { WorktreeFile, WorktreeFileGroup, WorktreeNode, WorktreeRoot } from "./worktreeView"


export function commands_discardChanges(node: WorktreeNode) {
	if (node instanceof WorktreeFile) {
		vscode.commands.executeCommand('git.clean', { uri: node.uri })
	} else if (node instanceof WorktreeFileGroup) {
		vscode.window.showWarningMessage('Not yet implemented')
	} else if (node instanceof WorktreeRoot) {
		vscode.window.showWarningMessage('Not yet implemented')
	} else {
		throw new Error('Unknown node type: ' + node)
	}
}
