import * as vscode from 'vscode'
import { WorktreeView } from './worktreeView'
import { git } from './gitFunctions'
import { MultiBranchCheckoutAPI } from './commands'
import { log } from './channelLogger'
import { WorktreeFile, WorktreeNode, WorktreeRoot } from './worktreeNodes'

const api = new MultiBranchCheckoutAPI()
export const worktreeView = new WorktreeView(api)

async function ignoreWorktreesDir () {
	const content = vscode.workspace.getConfiguration('files.exclude').get('**/.worktrees')
	if (content === undefined) {
		await vscode.workspace.getConfiguration('files').update('exclude', {'**/.worktrees': true })
	}

	const ignoredFiles = await git.statusIgnored()
	if (ignoredFiles.includes('.worktrees/')) {
		log.info('.gitignore already contains ".worktrees/"')
	} else {
		log.info('adding ".worktrees/" to .gitignore')
		const gitignore = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, '.gitignore')
		const content = await vscode.workspace.fs.readFile(gitignore)
		const lines = new TextDecoder().decode(content).split('\n')
		lines.push('.worktrees/')
		await vscode.workspace.fs.writeFile(gitignore, Buffer.from(lines.join('\n')))
		log.info('added ".worktrees/" to .gitignore')
	}
	return true

}

export function activate(context: vscode.ExtensionContext) {
	if (vscode.workspace.workspaceFolders === undefined) {
		throw new Error('No workspace folder found')
	}

	log.info('activating multi-branch-checkout (version=' + context.extension.packageJSON.version + ')')

	// ********** WorktreeView Refresh Events ********** //

	const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], '**/*'), false, false, false)

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
		if (!node.uri) {
			throw new Error('Uri is undefined for node.id:' + node.id)
		}
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

	return ignoreWorktreesDir().then((r) => {
		return worktreeView.activateTreeview()
	}).then((r) => {
		context.subscriptions.push(worktreeView)
		vscode.window.registerTreeDataProvider('multi-branch-checkout.worktreeView', worktreeView)
		log.info('extension activation complete')

		watcher.onDidChange((e) => {
			if (e.scheme !== 'file') { return }
			if (api.lastRefresh + 50 > Date.now()) {
				// avoid multiple refreshes in quick succession, especially during workspace startup
				return
			}
			log.info('onDidChange: ' + e.fsPath)
			return api.refreshUri(e)
		})
		watcher.onDidCreate((e) => {
			if (e.scheme !== 'file') { return }
			log.info('onDidCreate: ' + e.fsPath)
			return api.refreshUri(e)
		})
		watcher.onDidDelete((e) => {
			if (e.scheme !== 'file') { return }
			log.info('onDidDelete: ' + e.fsPath)
			return api.refreshUri(e)
		})

		return api
	})
}
