import * as vscode from 'vscode'
import * as fs from 'fs'
import { WorktreeNode } from './worktreeNodes'
import { log } from './channelLogger'

export function validateUri (node: WorktreeNode, throwError = true) {
	if (!node.uri) {
		if (throwError) {
			throw new Error('Uri is undefined for node.id:' + node.id)
		}
		return false
	}
	return true
}

export function dirExists (uri: vscode.Uri) {
	try {
		const r = fs.statSync(uri.fsPath)
		return r.isDirectory()
	} catch (e) {
		return false
	}
}

export function toUri (path: string) {
    const wsFolder = vscode.workspace.workspaceFolders?.[0].uri
    if (!wsFolder) {
        throw new Error('No workspace folder found')
    }
    return vscode.Uri.joinPath(wsFolder, path)
}

export function deleteFile(uri: vscode.Uri | string) {
	if (!(uri instanceof vscode.Uri)) {
		uri = toUri(uri)
	}
	log.info('Deleting ' + uri.fsPath)
	try {
		const r = fs.statSync(uri.fsPath)
		log.info('r=' + JSON.stringify(r))
	} catch (e) {
		log.info('File not found: ' + uri.fsPath)
		return false
	}
	log.info('found ' + uri.fsPath)
    fs.rmSync(uri.fsPath, { recursive: true })
	log.info('Deleted ' + uri.fsPath)
	return true
}
