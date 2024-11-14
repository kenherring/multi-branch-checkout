import * as vscode from 'vscode'
import { WorktreeView } from './worktreeView'
import { MultiBranchCheckoutAPI } from './commands'
import { log } from './channelLogger'
import { nodeMaps, WorktreeFile, WorktreeNode, WorktreeRoot } from './worktreeNodes'

const api = new MultiBranchCheckoutAPI()
export const worktreeView = new WorktreeView(api)
worktreeView.activateTreeview()

export function activate(context: vscode.ExtensionContext) {

	log.info('activating multi-branch-checkout (version=' + vscode.extensions.getExtension('mikestead.multi-branch-checkout')?.packageJSON.version + ')')

	const rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined

	context.subscriptions.push(worktreeView)
	vscode.window.registerTreeDataProvider('multi-branch-checkout.worktreeView', worktreeView)

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
	vscode.commands.registerCommand('multi-branch-checkout.refreshView', () => {
		return api.refresh()
	})

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
	vscode.commands.registerCommand('multi-branch-checkout.swaporktrees', (node: WorktreeRoot) => {
		return api.swapWorktrees(node)
	})
	vscode.commands.registerCommand('multi-branch-checkout.unlockWorktree', (node: WorktreeRoot) => {
		return api.unlockWorktree(node)
	})

	// ********** WorktreeFile Commands ********** //
	vscode.commands.registerCommand('multi-branch-checkout.copyToWorktree', (node: WorktreeFile) => {
		log.info('100')
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
		return api.launchWindowForWorktree(node)
	})
	vscode.commands.registerCommand('multi-branch-checkout.openFile', (node: WorktreeFile) => {
		log.info('100 openFile ' + node.id)
		if (!node.uri) {
			throw new Error('Uri is undefined for node.id:' + node.id)
		}
		log.info('101 openFile ' + node.uri.fsPath + '\n\r' + JSON.stringify(node.uri, null, 2))
		log.info('102 ' + vscode.workspace.workspaceFolders?.length)
		// return vscode.workspace.openTextDocument(node.uri)
		// return vscode.workspace.openTextDocument(node.uri.fsPath).then((r) => {
		return vscode.commands.executeCommand('vscode.open', node.uri).then((r) => {
			log.info('open file successful')
			log.info('r=' + JSON.stringify(r, null, 2))
			return r
		}, (e) => {
			log.error('open file failed: ' + e)
		})
	})


	log.info('extension activation complete')
	return api
}
