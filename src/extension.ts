import * as vscode from 'vscode'
import { WorktreeView } from './worktreeView'
import { MultiBranchCheckoutAPI } from './commands'
import { log } from './channelLogger'
import { WorktreeFile, WorktreeNode, WorktreeRoot } from './worktreeNodes'

const api = new MultiBranchCheckoutAPI()
export const worktreeView = new WorktreeView(api)
worktreeView.activateTreeview()

async function ignoreWorktreesDir () {
	log.info('900')
	const content = vscode.workspace.getConfiguration('files.exclude').get('**/.worktrees')
	log.info('901')
	if (content === undefined) {
		log.info('902')
		await vscode.workspace.getConfiguration('files').update('exclude', {'**/.worktrees': true })
		log.info('903')
	}
	log.info('904')
}

export function activate(context: vscode.ExtensionContext) {
	if (vscode.workspace.workspaceFolders === undefined) {
		throw new Error('No workspace folder found')
	}

	log.info('activating multi-branch-checkout (version=' + vscode.extensions.getExtension('mikestead.multi-branch-checkout')?.packageJSON.version + ')')

	const rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined

	context.subscriptions.push(worktreeView)
	vscode.window.registerTreeDataProvider('multi-branch-checkout.worktreeView', worktreeView)

	// ********** WorktreeView Refresh Events ********** //

	const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], '**/*'), false, false, false)

	watcher.onDidChange((e) => {
		if (e.scheme !== 'file') {
			return
		}
		if (api.lastRefresh + 100 > Date.now()) {
			// avoid multiple refreshes in quick succession, especially during workspace startup
			return
		}
		log.info('onDidChange: ' + e.fsPath)
		return api.refreshUri(e)
	})
	watcher.onDidCreate((e) => {
		log.info('onDidCreate: ' + e.fsPath)
		return api.refreshUri(e)
	})
	watcher.onDidDelete((e) => {
		log.info('onDidDelete: ' + e.fsPath)
		return api.refreshUri(e)
	})
	context.subscriptions.push(watcher)

	vscode.commands.registerCommand('multi-branch-checkout.refreshView', () => {
		return api.refresh()
	})

	// ********** WorktreeRoot Commands ********** //
	vscode.commands.registerCommand('multi-branch-checkout.refresh', (node?: WorktreeNode) => {
		if (node) {
			return api.refresh(node)
		}
		return api.refresh()
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
		return api.stage(node)
	})
	vscode.commands.registerCommand('multi-branch-checkout.unstageNode', (node: WorktreeNode) => {
		return api.unstage(node)
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

	return ignoreWorktreesDir().then(() => {
		log.info('extension activation complete')
		return api
	})
}
