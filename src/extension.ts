import * as vscode from 'vscode'
import { WorktreeView } from './worktreeView'
import { command_launchWindowForWorktree, MultiBranchCheckoutAPI } from './commands'
import { log } from './channelLogger'
import { nodeMaps, WorktreeFile, WorktreeNode, WorktreeRoot } from './worktreeNodes'

export const worktreeView = new WorktreeView
const api = new MultiBranchCheckoutAPI()

export function activate(context: vscode.ExtensionContext) {

	log.info('activating multi-branch-checkout (version=' + vscode.extensions.getExtension('mikestead.multi-branch-checkout')?.packageJSON.version + ')')

	const rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined

	context.subscriptions.push(worktreeView)
	vscode.window.registerTreeDataProvider('multi-branch-checkout', worktreeView.tdp)

	// ********** WorktreeView Refresh Events ********** //
	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((d) => {
		log.info('onDidChangeTextDocument: ' + d.uri.fsPath)
		api.refresh(api.getNode(d.uri))
	}))
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((e) => {
		if (!e) {
			return
		}
		worktreeView.reveal(nodeMaps.getLastNode(e.document.uri),  { select: false, focus: true } )
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
