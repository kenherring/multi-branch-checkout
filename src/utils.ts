import { Uri, workspace } from 'vscode'
import { WorktreeNode } from './worktreeNodes'

export function toUri (path: string) {
    return Uri.joinPath(workspace.workspaceFolders![0].uri, path)
}

export function validateUri (node: WorktreeNode) {
	if (!node.uri) {
		throw new Error('Failed to unstage file - filepath not set (uri=' + node.uri + ')')
	}
	return true
}
