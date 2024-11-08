import { Uri, workspace } from 'vscode'
import { WorktreeNode } from './worktreeNodes'
import { log } from './channelLogger'

export function toUri (path: string) {
    return Uri.joinPath(workspace.workspaceFolders![0].uri, path)
}

export function validateUri (node: WorktreeNode) {
	if (!node.uri) {
		throw new Error('Failed to unstage file - filepath not set (uri=' + node.uri + ')')
	}
	return true
}

export function deleteFile(uri: Uri | string) {
	if (typeof uri === 'string') {
		uri = toUri(uri)
	}
	return workspace.fs.delete(uri)
		.then(() => {
			log.info('Deleted ' + uri.fsPath)
			return true
		}, (e: unknown) => {
			log.error('Failed to delete ' + uri.fsPath + ' (e=' + e + ')')
			return false
		})
}
