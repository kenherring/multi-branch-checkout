import * as vscode from 'vscode'
import { Uri, workspace } from 'vscode'
import { WorktreeNode } from './worktreeNodes'
import { log } from './channelLogger'

export function toUri (path: string) {
    const wsFolder = vscode.workspace.workspaceFolders?.[0].uri
    if (!wsFolder) {
        throw new Error('No workspace folder found')
    }
    return vscode.Uri.joinPath(wsFolder, path)
}

export function validateUri (node: WorktreeNode) {
	if (!node.uri) {
		throw new Error('Failed to unstage file - filepath not set (uri=' + node.uri + ')')
	}
	return true
}

export async function deleteFile(uri: vscode.Uri | string) {
	if (typeof uri == 'string') {
		uri = toUri(uri)
	}
	log.info('Deleting ' + uri.fsPath)
	const r = vscode.workspace.fs.stat(uri)
	log.info('r=' + r)
    const r2 = await r.then((z) => { log.info('101'); return z }, (e) => { log.error('102 e=' + e); throw e })
	log.info('r2=' + JSON.stringify(r2))
	if (!r2) {
		return false
	}
	log.info('found ' + uri.fsPath + ' (r=' + r + ')')
	await vscode.workspace.fs.delete(uri)
	log.info('Deleted ' + uri.fsPath)
	return true
}
