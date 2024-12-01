import * as vscode from 'vscode'
import { WorktreeView } from './worktreeView'
import { git } from './gitFunctions'
import { MultiBranchCheckoutAPI } from './commands'
import { log } from './channelLogger'
import { nodeMaps, WorktreeFile, WorktreeNode, WorktreeRoot } from './worktreeNodes'

export const worktreeView = new WorktreeView()
export const api = new MultiBranchCheckoutAPI(worktreeView)

async function ignoreWorktreesDir () {
	log.info('100')
	const content = vscode.workspace.getConfiguration('files.exclude').get('**/.worktrees')
	log.info('101')
	if (content === undefined) {
		log.info('102')
		await vscode.workspace.getConfiguration('files').update('exclude', {'**/.worktrees': true })
	}
	log.info('103')
	const ignoredFiles = await git.statusIgnored()
	log.info('104')
	if (ignoredFiles.includes('.worktrees/')) {
		log.info('105')
		log.info('.gitignore already contains ".worktrees/"')
	} else {
		log.info('105')
		log.info('adding ".worktrees/" to .gitignore')
		const gitignore = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, '.gitignore')
		const content = await vscode.workspace.fs.readFile(gitignore).then((b) => { return b }, (e) => { return Buffer.from('') })
		const lines = new TextDecoder().decode(content).split('\n')
		lines.push('.worktrees/')
		await vscode.workspace.fs.writeFile(gitignore, Buffer.from(lines.join('\n')))
		log.info('added ".worktrees/" to .gitignore')
	}
	return true

}

export async function activate(context: vscode.ExtensionContext) {
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

	api.setTempDir(context.storageUri!)

	const commands: vscode.Disposable[] = []

	// ********** WorktreeView Commands ********** //
	commands.push(vscode.commands.registerCommand('multi-branch-checkout.refreshView', () => api.refresh()))

	// ********** WorktreeRoot Commands ********** //
	commands.push(
		vscode.commands.registerCommand('multi-branch-checkout.refresh', (node?: WorktreeNode) => api.refresh(node)),
		vscode.commands.registerCommand('multi-branch-checkout.createWorktree', () => api.createWorktree(vscode.workspace.workspaceFolders![0])),
		vscode.commands.registerCommand('multi-branch-checkout.deleteWorktree', (node: WorktreeRoot) => api.deleteWorktree(node)),
		vscode.commands.registerCommand('multi-branch-checkout.lockWorktree', (node: WorktreeRoot) => api.lockWorktree(node)),
		vscode.commands.registerCommand('multi-branch-checkout.swapWorktrees', (node: WorktreeRoot) => api.swapWorktrees(node)),
		vscode.commands.registerCommand('multi-branch-checkout.unlockWorktree', (node: WorktreeRoot) => api.unlockWorktree(node)),
		vscode.commands.registerCommand('multi-branch-checkout.launchWindowForWorktree', (node: WorktreeRoot) => api.launchWindowForWorktree(node))
	)

	// ********** WorktreeFile Commands ********** //
	commands.push(
		vscode.commands.registerCommand('multi-branch-checkout.selectFileNode', (id: string) => api.selectWorktreeFile(id)),
		vscode.commands.registerCommand('multi-branch-checkout.copyToWorktree', (node: WorktreeFile) => api.copyToWorktree(node)),
		vscode.commands.registerCommand('multi-branch-checkout.moveToWorktree', (node: WorktreeFile) => api.moveToWorktree(node)),
		// vscode.commands.registerCommand('multi-branch-checkout.patchToWorktree', (node: WorktreeFile) => api.patchToWorktree(node)),
		vscode.commands.registerCommand('multi-branch-checkout.stageNode', (node: WorktreeNode) => api.stage(node)),
		vscode.commands.registerCommand('multi-branch-checkout.unstageNode', (node: WorktreeNode) => api.unstage(node)),
		vscode.commands.registerCommand('multi-branch-checkout.discardChanges', (node: WorktreeFile) => api.discardChanges(node)),
		vscode.commands.registerCommand('multi-branch-checkout.compareFileWithMergeBase', (node: WorktreeFile) => api.compare(node)),
	)

	// ********** NON-API commands ********** //
	commands.push(
		vscode.commands.registerCommand('multi-branch-checkout.openFile', (node: WorktreeFile) => {
			log.info('multi-branch-checkout.openFile')
			return api.openFile(node)
		}),
	)

	context.subscriptions.push(...commands)

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
			log.info('onDidChange: ' + e.fsPath + ' ' + stat.type)
			const repoNode = nodeMaps.getWorktreeForUri(e)
			return api.refresh(repoNode)
		})
		watcher.onDidCreate((e) => {
			if (e.scheme !== 'file') { return }
			log.info('onDidCreate: ' + e.fsPath)

			const match = RegExp(/.git\/worktrees\/([^/]*)\/locked/).exec(e.fsPath)
			if (match) {
				log.info('onDidCreate: worktree ' + match[1] + ' locked detected')
				// const node = worktreeView.getRootNode(match[1])
				// if (node) {
				// 	return api.refresh(node)
				// }
				// log.warn('could not find root node for ' + match[1])
			}
			return api.refreshUri(e)
		})
		watcher.onDidDelete(async (e) => {
			if (e.scheme !== 'file') { return }
			const ignore = await git.checkIgnore(e.fsPath)
			if (ignore) {
				return
			}
			const repoNode = nodeMaps.getWorktreeForUri(e)
			log.info('onDidDelete: ' + e.fsPath)
			return api.refresh(repoNode)
		})
		log.info('extension activation complete')
		return api
	})

}
