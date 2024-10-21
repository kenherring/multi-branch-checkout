import * as vscode from 'vscode'
import { WorktreeFile, WorktreeFileGroup, WorktreeNode, WorktreeRoot } from "./worktreeView"


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
