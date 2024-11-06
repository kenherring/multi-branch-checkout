import * as vscode from 'vscode'
import { WorktreeFile, WorktreeNode, WorktreeRoot, WorktreeView } from './worktreeView'
import { command_copyToWorktree, command_createWorktree, command_deleteWorktree, command_discardChanges, command_launchWindowForWorktree, command_lockWorktree, command_patchToWorktree, command_stageNode } from './commands'
import { log } from './channelLogger'

let worktreeView: WorktreeView
const api = {
	getWorktreeView () {
		return worktreeView
	},
	refresh(node?: WorktreeNode) {
		return worktreeView.refresh(node)
	},

	// ********** WorktreeRoot Commands ********** //
	createWorktree(branchName?: string) {
		log.info('600 command_createWorktree branchName="' + branchName + '"')
		return command_createWorktree(branchName)
			.then(() => { return worktreeView.refresh() })
	},
	deleteWorktree(node: WorktreeRoot) {
		return command_deleteWorktree(node)
			.then(() => { return worktreeView.refresh() })
	},
	lockWorktree(node: WorktreeRoot) {
		return command_lockWorktree(node, true)
			.then(() => { return worktreeView.refresh(node) })
	},
	unlockWorktree(node: WorktreeRoot) {
		return command_lockWorktree(node, false)
			.then(() => { return worktreeView.refresh(node) })
	},

	// ********** WorktreeFile Commands ********** //
	copyToWorktree(node: WorktreeFile) {
		return command_copyToWorktree(node, worktreeView.getRootNodes(), false)
			.then(() => { return worktreeView.refresh() })
	},
	moveToWorktree(node: WorktreeFile) {
		return command_copyToWorktree(node, worktreeView.getRootNodes(), true)
			.then(() => { return worktreeView.refresh() })
	},
	patchToWorktree(node: WorktreeFile) {
		return command_patchToWorktree(node, worktreeView.getRootNodes())
			.then(() => { return worktreeView.refresh() })
	},
	stageNode(node: WorktreeNode) {
		return command_stageNode(node, 'stage')
			.then(() => { return worktreeView.refresh(node) })
	},
	unstageNode(node: WorktreeNode) {
		return command_stageNode(node, 'unstage')
			.then(() => { return worktreeView.refresh(node) })
	},
	discardChanges(node: WorktreeFile) {
		const parent = node.getParent()
		return command_discardChanges(node)
			.then(() => { return worktreeView.refresh(parent) })
	},
	compareWithMergeBase(node: WorktreeNode) {
		vscode.window.showWarningMessage('not yet implemented')
	},
}

export function activate(context: vscode.ExtensionContext) {

	log.info('activating multi-branch-checkout (version=' + vscode.extensions.getExtension('mikestead.multi-branch-checkout')?.packageJSON.version + ')')

	const rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined

	worktreeView = new WorktreeView()


	context.subscriptions.push(worktreeView)
	vscode.window.registerTreeDataProvider('multi-branch-checkout', worktreeView.tdp)

	// ********** WorktreeView Refresh Events ********** //
	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((d) => {
		log.info('onDidChangeTextDocument: ' + d.uri.fsPath)
		worktreeView.refresh(d.uri)
	}))
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((e) => {
		if (!e) {
			return
		}
		worktreeView.reveal(worktreeView.getLastNode(e.document.uri),  { select: false, focus: true } )
	}))


	// ********** WorktreeRoot Commands ********** //
	vscode.commands.registerCommand('multi-branch-checkout.refresh', (node?: WorktreeNode) => {
		return api.refresh(node)
	})
	vscode.commands.registerCommand('multi-branch-checkout.createWorktree', () => {
		return api.createWorktree()
	})
	vscode.commands.registerCommand('multi-branch-checkout.deleteWorktree', (node: WorktreeRoot) => {
		return api.deleteWorktree(node)
	})
	vscode.commands.registerCommand('multi-branch-checkout.lockWorktree', (node: WorktreeRoot) => {
		return api.lockWorktree(node)
	})
	vscode.commands.registerCommand('multi-branch-checkout.unlockWorktree', (node: WorktreeRoot) => {
		return api.unlockWorktree(node)
	})

	// ********** WorktreeFile Commands ********** //
	vscode.commands.registerCommand('multi-branch-checkout.copyToWorktree', (node: WorktreeFile) => {
		return api.copyToWorktree(node)
	})
	vscode.commands.registerCommand('multi-branch-checkout.moveToWorktree', (node: WorktreeFile) => {
		return api.moveToWorktree(node)
	})
	vscode.commands.registerCommand('multi-branch-checkout.patchToWorktree', (node: WorktreeFile) => {
		return api.patchToWorktree(node)
	})
	vscode.commands.registerCommand('multi-branch-checkout.stageNode', (node: WorktreeNode) => {
		return api.stageNode(node)
	})
	vscode.commands.registerCommand('multi-branch-checkout.unstageNode', (node: WorktreeNode) => {
		return api.unstageNode(node)
	})
	vscode.commands.registerCommand('multi-branch-checkout.discardChanges', (node: WorktreeFile) => {
		return api.discardChanges(node)
	})
	vscode.commands.registerCommand('multi-branch-checkout.compareFileWithMergeBase', (node: WorktreeFile) => {
		return api.compareWithMergeBase(node)
	})

	// ********** NON-API commands ********** //
	vscode.commands.registerCommand('multi-branch-checkout.launchWindowForWorktree', (node: WorktreeRoot) => {
		return command_launchWindowForWorktree(node)
	})
	vscode.commands.registerCommand('multi-branch-checkout.openFile', (node: WorktreeFile) => {
		if (!node.uri) {
			throw new Error('Uri is undefined for node.id:' + node.id)
		}
		return vscode.workspace.openTextDocument(node.uri)
	})


	log.info('extension activation complete')
	return api
}
