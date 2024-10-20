import * as vscode from 'vscode'
import { WorktreeFile, WorktreeFileGroup, WorktreeRoot, WorktreeView } from './worktreeView'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const git = require('@npmcli/git')
const defaultBranch = 'main' //TODO

export function activate(context: vscode.ExtensionContext) {
	const rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined

	const worktreeView = new WorktreeView(context)

	// ********** WorktreeFile Commands ********** //
	vscode.commands.registerCommand('multi-branch-checkout.openFile', (node: WorktreeFile) => {
		return vscode.commands.executeCommand('vscode.open', node.uri)
	})
	vscode.commands.registerCommand('multi-branch-checkout.revertFile', (node: WorktreeFile) => {
		return vscode.window.showWarningMessage('not yet implemented')
	})
	vscode.commands.registerCommand('multi-branch-checkout.compareFileWithMergeBase', (node: WorktreeFile) => {
		return vscode.window.showWarningMessage('not yet implemented')
	})
	vscode.commands.registerCommand('multi-branch-checkout.copyToWorktree', async (node: WorktreeFile) => {
		const moveToUri = await command_copyToWorktree(node, worktreeView.getRootNodes(), false)
		console.log('--- refresh ---')
		await worktreeView.refresh()
		console.log('--- reveal ---')
		if (moveToUri) {
			await worktreeView.reveal(moveToUri, { select: false, focus: true })
			console.log('--- complete ---')
		} else {
			console.error('Copy did not return a Uri to reveal')
		}
	})
	vscode.commands.registerCommand('multi-branch-checkout.moveToWorktree', (node: WorktreeFile) => {
		// TODO
		// return command_copyToWorktree(node, worktreeView.getRootNodes(), true).then(() => { worktreeView.refresh() })
		return vscode.window.showWarningMessage('not yet implemented')

	})
	vscode.commands.registerCommand('multi-branch-checkout.stageFile', (node: WorktreeFile) => {
		return command_stageFiles(node, 'stage').then(() => { worktreeView.refresh() })
	})
	vscode.commands.registerCommand('multi-branch-checkout.unstageFile', (node: WorktreeFile) => {
		return command_stageFiles(node, 'unstage').then(() => { worktreeView.refresh() })
	})
}

function command_copyToWorktree(node: WorktreeFile, rootNodes: WorktreeRoot[], move = false) {
	validateUri(node)

	const rootNodeIds: vscode.QuickPickItem[] = []
	for (const n of rootNodes) {
		if (!n.label) {
			continue
		}
		if (n.uri === node.getRepoUri()) {
			continue
		}
		rootNodeIds.push({
			label: n.label?.toString(),
			description: "$(repo) path: " + n.uri.fsPath
		})
	}
	let moveTo: WorktreeRoot | undefined = undefined
	let moveToUri: vscode.Uri | undefined = undefined

	return vscode.window.showQuickPick(rootNodeIds, { placeHolder: 'Select target worktree' })
		.then((r) => {
			console.log('r1=' + JSON.stringify(r))
			moveTo = rootNodes.find(n => n.label?.toString() == r?.label)
			if (!moveTo) {
				throw new Error('Failed to find target worktree: ' + r?.label)
			}
			moveToUri = vscode.Uri.joinPath(moveTo!.uri, node.uri!.fsPath.replace(node.getRepoUri().fsPath, ''))
			console.log('moveToUri=' + moveToUri)
			if (!moveToUri) {
				throw new Error('Failed to create target file path: ' + moveToUri)
			}
			console.log('copying ' + node.uri?.fsPath + ' to ' + moveToUri.fsPath)
			// copy file
			return vscode.workspace.fs.copy(node.uri!, moveToUri, { overwrite: true })
		})
		.then((r: any) => {
			console.log('r2=' + JSON.stringify(r,null,2))
			console.log('successfully copied file')
			if (move) {
				// delete original file (move only)
				return git.spawn(['rm', node.uri?.fsPath], { cwd: node.getRepoUri().fsPath })
			}
			return Promise.resolve('copy only')
		}).then((r: any) => {
			console.log('r4=' + JSON.stringify(r,null,2))
			if (r == 'copy only') {
				return moveToUri
			}
			console.log('r=' + JSON.stringify(r,null,2))
			console.log('successfully moved ' + node.uri?.fsPath + ' to ' + moveTo!.uri.fsPath)
			return moveToUri
		}, (e: any) => {
			const moveType = move ? 'move' : 'copy'
			if (e.stderr) {
				console.error('error: ' + e.stderr)

				throw new Error('Failed to ' + moveType + ' file: ' + e.stderr)
			}
			console.error('error: ' + e.stderr)
			throw new Error('Failed to move ' + moveType + ' : ' + e.stderr)
		})
}

function command_patchToWorktree(node: WorktreeFile, rootNodes: WorktreeRoot[], move = false) {
	validateUri(node)

	// first, select a target worktree via a prompt
	// second, create a patch file against merge-base
	// third, apply the patch to the target worktree
	// fourth, (move only) remove the original file from the source worktree

	const rootNodeIds: vscode.QuickPickItem[] = []
	for (const n of rootNodes) {
		if (!n.label) {
			continue
		}
		if (n.uri === node.getRepoUri()) {
			continue
		}
		rootNodeIds.push({
			label: n.label?.toString(),
			description: "$(repo) path: " + n.uri.fsPath
		})
	}
	let moveTo: WorktreeRoot | undefined = undefined

	// first, select a target worktree via a prompt
	return vscode.window.showQuickPick(rootNodeIds, { placeHolder: 'Select target worktree' })
		.then((r) => {
			console.log('r1=' + JSON.stringify(r))
			moveTo = rootNodes.find(n => n.label?.toString() == r?.label)
			if (!moveTo) {
				throw new Error('Failed to find target worktree: ' + r?.label)
			}
			// create patch
			return git.spawn(['diff', '-p', '--merge-base', defaultBranch, '--', node.uri?.fsPath], { cwd: node.getRepoUri().fsPath })
		})
		.then((r: any) => {
			console.log('r2=' + JSON.stringify(r,null,2))
			// apply patch
			return git.spawn(['apply', '-'], { cwd: moveTo!.uri.fsPath, stdin: r.stdout })
		}).then((r: any) => {
			console.log('r3=' + JSON.stringify(r,null,2))
			console.log('successfully applied patch')
			if (move) {
				// delete original file (move only)
				return git.spawn(['rm', node.uri?.fsPath], { cwd: node.getRepoUri().fsPath })
			}
			return Promise.resolve('copy only')
		}).then((r: any) => {
			console.log('r4=' + JSON.stringify(r,null,2))
			if (r == 'copy only') {
				return
			}
			console.log('r=' + JSON.stringify(r,null,2))
			console.log('successfully moved ' + node.uri?.fsPath + ' to ' + moveTo!.uri.fsPath)
		}, (e: any) => {

			if (e.stderr) {
				console.error('error: ' + e.stderr)
				throw new Error('Failed to move file: ' + e.stderr)
			}
		})
		// .then((r: any) => {
		// 	console.log('r=' + JSON.stringify(r,null,2))
		// 	return vscode.workspace.fs.writeFile(patchFile, Buffer.from(r.stdout))
		// })
		// .then(() => {
		// 	return git.spawn(['apply', patchFile.fsPath], { cwd: node.getRepoUri().fsPath })
		// })
		// .then((r: any) => {
		// 	console.log('r=' + JSON.stringify(r,null,2))
		// 	return vscode.workspace.fs.delete(patchFile)
		// })
}

function command_stageFiles (node: WorktreeFile | WorktreeFileGroup, action: 'stage' | 'unstage') {
	validateUri(node)
	if (!node.uri) {
		throw new Error('Failed to stage file - invalid filepath (uri=' + node.uri + ')')
	}
	const addList: string[] = []
	if (node instanceof WorktreeFile) {
		addList.push(node.uri.fsPath)
	} else {
		for (const child of node.children) {
			if (child instanceof WorktreeFile && child.uri) {
				addList.push(child.uri.fsPath)
			}
		}
	}

	let gitAction = 'add'
	if (action == 'unstage') {
		gitAction = 'reset'
	}
	return git.spawn([gitAction, ...addList], { cwd: node.getRepoUri().fsPath })
}

function validateUri(node: WorktreeFile | WorktreeFileGroup) {
	if (node.uri) {
		return true
	}
	throw new Error('Uri is undefined for node.id:' + node.id)
}
