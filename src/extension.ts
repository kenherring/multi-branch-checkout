import * as vscode from 'vscode'
import { WorktreeFile, WorktreeFileGroup, WorktreeNode, WorktreeRoot, WorktreeView } from './worktreeView'
import { command_createWorktree, command_discardChanges, command_patchToWorktree, command_stageNode } from './commands'
import { log } from './channelLogger'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const git = require('@npmcli/git')

export function activate(context: vscode.ExtensionContext) {

	log.info('activating multi-branch-checkout (version=' + vscode.extensions.getExtension('mikestead.multi-branch-checkout')?.packageJSON.version + ')')

	const rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined

	const worktreeView = new WorktreeView(context)

	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((d) => {
		log.info('onDidChangeTextDocument: ' + d.uri.fsPath)
		worktreeView.refresh(d.uri)
	}))
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((e) => {
		if (!e) {
			return
		}
		worktreeView.reveal(worktreeView.getNode(e.document.uri),  { select: false, focus: true } )
	}))


	// ********** Any node type ********** //
	// registerCommand('discardChanges', command_discardChanges)
	vscode.commands.registerCommand('multi-branch-checkout.discardChanges', (node: WorktreeFile) => {
		return command_discardChanges(node)
			.then(() => { return worktreeView.refresh(node) })
	})

	// ********** WorktreeFile Commands ********** //
	vscode.commands.registerCommand('multi-branch-checkout.openFile', (node: WorktreeFile) => {
		return vscode.commands.executeCommand('vscode.open', node.uri)
	})
	vscode.commands.registerCommand('multi-branch-checkout.compareFileWithMergeBase', (node: WorktreeFile) => {
		return vscode.window.showWarningMessage('not yet implemented')
	})

	vscode.commands.registerCommand('multi-branch-checkout.patchToWorktree', (node: WorktreeFile) => {
		return command_patchToWorktree(node, worktreeView.getRootNodes())
	})
	vscode.commands.registerCommand('multi-branch-checkout.copyToWorktree', async (node: WorktreeFile) => {
		const moveToUri = await command_copyToWorktree(node, worktreeView.getRootNodes(), false)
		log.info('--- refresh ---')
		await worktreeView.refresh()
		log.info('--- reveal ---')
		if (moveToUri) {
			await worktreeView.reveal(moveToUri, { select: false, focus: true })
			log.info('--- complete ---')
		} else {
			log.error('Copy did not return a Uri to reveal')
		}
	})
	vscode.commands.registerCommand('multi-branch-checkout.moveToWorktree', (node: WorktreeFile) => {
		// TODO
		// return command_copyToWorktree(node, worktreeView.getRootNodes(), true).then(() => { worktreeView.refresh() })
		return vscode.window.showWarningMessage('not yet implemented')

	})
	vscode.commands.registerCommand('multi-branch-checkout.stageNode', (node: WorktreeNode) => {
		return command_stageNode(node, 'stage').then(() => { return worktreeView.refresh(node) })
	})
	vscode.commands.registerCommand('multi-branch-checkout.unstageNode', (node: WorktreeNode) => {
		return command_stageNode(node, 'unstage').then(() => { return worktreeView.refresh(node) })
	})

	const api = {
		getWorktreeView () {
			return worktreeView
		},
		createWorktree(branchName?: string) {
			log.info('600 command_createWorktree branchName="' + branchName + '"')
			return command_createWorktree(branchName)
				.then(() => { return worktreeView.refresh() })
		}
	}

	vscode.commands.registerCommand('multi-branch-checkout.createWorktree', () => {
		return api.createWorktree()
	})

	log.info('extension activation complete')
	return api
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
			log.info('r1=' + JSON.stringify(r))
			moveTo = rootNodes.find(n => n.label?.toString() == r?.label)
			if (!moveTo) {
				throw new Error('Failed to find target worktree: ' + r?.label)
			}
			moveToUri = vscode.Uri.joinPath(moveTo.uri, node.uri!.fsPath.replace(node.getRepoUri().fsPath, ''))
			log.info('moveToUri=' + moveToUri)
			if (!moveToUri) {
				throw new Error('Failed to create target file path: ' + moveToUri)
			}
			log.info('copying ' + node.uri?.fsPath + ' to ' + moveToUri.fsPath)
			// copy file
			return vscode.workspace.fs.copy(node.uri!, moveToUri, { overwrite: true })
		})
		.then((r: any) => {
			log.info('r2=' + JSON.stringify(r,null,2))
			log.info('successfully copied file')
			if (move) {
				// delete original file (move only)
				return git.spawn(['rm', node.uri?.fsPath], { cwd: node.getRepoUri().fsPath })
			}
			return Promise.resolve('copy only')
		}).then((r: any) => {
			log.info('r4=' + JSON.stringify(r,null,2))
			if (r == 'copy only') {
				return moveToUri
			}
			log.info('r=' + JSON.stringify(r,null,2))
			log.info('successfully moved ' + node.uri?.fsPath + ' to ' + moveTo!.uri.fsPath)
			return moveToUri
		}, (e: any) => {
			const moveType = move ? 'move' : 'copy'
			if (e.stderr) {
				log.error('error: ' + e.stderr)

				throw new Error('Failed to ' + moveType + ' file: ' + e.stderr)
			}
			log.error('error: ' + e.stderr)
			throw new Error('Failed to move ' + moveType + ' : ' + e.stderr)
		})
}

function validateUri(node: WorktreeFile | WorktreeFileGroup) {
	if (node.uri) {
		return true
	}
	throw new Error('Uri is undefined for node.id:' + node.id)
}
