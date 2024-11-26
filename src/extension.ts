import * as vscode from 'vscode'
import { WorktreeView } from './worktreeView'
import { git } from './gitFunctions'
import { MultiBranchCheckoutAPI } from './commands'
import { log } from './channelLogger'
import { nodeMaps, WorktreeFile, WorktreeNode, WorktreeRoot } from './worktreeNodes'
import { NotImplementedError } from './errors'

export const worktreeView = new WorktreeView()
export const api = new MultiBranchCheckoutAPI(worktreeView)

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

	context.subscriptions.push(worktreeView.onDidChangeTreeData((e) => {
		// if (e.uri.fsPath == vscode.workspace.workspaceFolders![0].uri.fsPath) {
		// 	return
		// }
		log.info('onDidChangeTreeData e=' + e?.id + ' ' + e)
		// return worktreeView.refresh()
	}))

	const commands: vscode.Disposable[] = []

	// ********** WorktreeView Commands ********** //
	commands.push(vscode.commands.registerCommand('multi-branch-checkout.refreshView', () => {
		return api.refresh()
	}))

	// ********** WorktreeRoot Commands ********** //
	commands.push(
		vscode.commands.registerCommand('multi-branch-checkout.refresh', (node?: WorktreeNode) => {
			if (node) {
				return api.refresh(node)
			}
			return api.refresh()
		}),
		vscode.commands.registerCommand('multi-branch-checkout.createWorktree', () => {
			return api.createWorktree(vscode.workspace.workspaceFolders![0])
		}),
		vscode.commands.registerCommand('multi-branch-checkout.deleteWorktree', (node: WorktreeRoot) => {
			return api.deleteWorktree(node)
		}),
		vscode.commands.registerCommand('multi-branch-checkout.lockWorktree', (node: WorktreeRoot) => {
			return api.lockWorktree(node)
		}),
		vscode.commands.registerCommand('multi-branch-checkout.swapWorktrees', (node: WorktreeRoot) => {
			return api.swapWorktrees(node)
		}),
		vscode.commands.registerCommand('multi-branch-checkout.unlockWorktree', (node: WorktreeRoot) => {
			return api.unlockWorktree(node)
		}),
		vscode.commands.registerCommand('multi-branch-checkout.launchWindowForWorktree', (node: WorktreeRoot) => {
			return api.launchWindowForWorktree(node)
		}),
	)

	// ********** WorktreeFile Commands ********** //
	commands.push(
		vscode.commands.registerCommand('multi-branch-checkout.selectFileNode', (id: string) => {
			return api.selectFileTreeItem(id, context.storageUri!)
		}),
		vscode.commands.registerCommand('multi-branch-checkout.copyToWorktree', (node: WorktreeFile) => {
			return api.copyToWorktree(node)
		}),
		vscode.commands.registerCommand('multi-branch-checkout.moveToWorktree', (node: WorktreeFile) => {
			return api.moveToWorktree(node)
		}),
		// vscode.commands.registerCommand('multi-branch-checkout.patchToWorktree', (node: WorktreeFile) => {
		// 	return api.patchToWorktree(node)
		// })
		vscode.commands.registerCommand('multi-branch-checkout.stageNode', (node: WorktreeNode) => {
			return api.stage(node)
		}),
		vscode.commands.registerCommand('multi-branch-checkout.unstageNode', (node: WorktreeNode) => {
			return api.unstage(node)
		}),
		vscode.commands.registerCommand('multi-branch-checkout.discardChanges', (node: WorktreeFile) => {
			return api.discardChanges(node)
		}),
		vscode.commands.registerCommand('multi-branch-checkout.compareFileWithMergeBase', (node: WorktreeFile) => {
			return api.compare(node)
		}),
	)

	// ********** NON-API commands ********** //
	commands.push(
		vscode.commands.registerCommand('multi-branch-checkout.openFile', (node: WorktreeFile) => {
			log.info('multi-branch-checkout.openFile')
			return api.openFile(node, context.storageUri!)
		}),
	)

	log.info('ignoreWorktreesDir')
	return ignoreWorktreesDir().then((r) => {
		log.info('activateTreeview')
		return worktreeView.activateTreeview()
	}).then((r) => {
		log.info('subscribe')
		context.subscriptions.push(worktreeView)
		log.info('register')
		vscode.window.registerTreeDataProvider('multi-branch-checkout.worktreeView', worktreeView)

		log.info('register filewatcher')
		const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.workspace.workspaceFolders![0], '**/*'), false, true, false)
		const watcherChange = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.workspace.workspaceFolders![0], '**/.git/index'), true, false, true)
		context.subscriptions.push(watcher)



		watcherChange.onDidChange(async (e) => {
			if (e.scheme !== 'file') {
				return
			}
			const stat = await vscode.workspace.fs.stat(e).then((s) => { return s}, (e) => { return undefined })
			if (!stat) {
				return
			}
			if (stat.type == vscode.FileType.Directory) {
				return
			}
			if (git.ignoreCache.includes(e.fsPath)) {
				return
			}

			// if (api.lastRefresh + 100 > Date.now()) {
			// 	// avoid multiple refreshes in quick succession, especially during workspace startup
			// 	return
			// }
			log.info('onDidChange: ' + e.fsPath + ' ' + stat.type)
			const repoNode = nodeMaps.getWorktreeForUri(e)
			return api.refresh(repoNode)
			// return api.refreshUri(e)
		})
		watcher.onDidCreate((e) => {
			if (e.scheme !== 'file') { return }
			log.info('onDidCreate: ' + e.fsPath)
			return api.refreshUri(e)
		})
		watcher.onDidDelete(async (e) => {
			if (e.scheme !== 'file') { return }
			const ignore = await git.checkIgnore(e.fsPath)
			if (ignore) {
				return
			}
			// const topLevel = git.revParse(e, true)
			const repoNode = nodeMaps.getWorktreeForUri(e)
			// if (!repoNode) {
			// 	log.warn('No worktree found for uri=' + e.fsPath)
			// 	return
			// }
			log.info('onDidDelete: ' + e.fsPath)
			return await api.refresh(repoNode)
		})

		log.info('extension activation complete')
		return api
	})
}
