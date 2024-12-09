import * as vscode from 'vscode'
import { git } from './gitFunctions'
import { log } from './channelLogger'
import { fileExists } from './utils'
import { MultiBranchCheckoutAPI } from './commands'
import { nodeMaps, WorktreeFile, WorktreeNode, WorktreeRoot } from './worktreeNodes'

export const api = new MultiBranchCheckoutAPI()

export async function activate(context: vscode.ExtensionContext) {
	log.info('250')
	const commands: vscode.Disposable[] = []

	if (vscode.workspace.workspaceFolders === undefined) {
		throw new Error('No workspace folder found')
	}

	log.info('activating multi-branch-checkout (version=' + context.extension.packageJSON.version + ')')
	api.tempDir = context.storageUri!
	log.info('251')
	await api.worktreeView.initTreeview()
	log.info('252')

	// ********** WorktreeView Refresh Events ********** //
	// context.subscriptions.push(api.worktreeView.onDidChangeTreeData((e) => {
	// 	// if (e.uri.fsPath == vscode.workspace.workspaceFolders![0].uri.fsPath) {
	// 	// 	return
	// 	// }
	// 	log.info('onDidChangeTreeData e=' + e?.id + ' ' + e)
	// 	// return worktreeView.refresh()
	// }))

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
		// vscode.commands.registerCommand('multi-branch-checkout.compareFileWithMergeBase', (node: WorktreeFile) => api.compare(node)),
	)

	// ********** NON-API commands ********** //
	commands.push(
		vscode.commands.registerCommand('multi-branch-checkout.openFile', (node: WorktreeFile) => {
			log.info('multi-branch-checkout.openFile')
			return api.openFile(node)
		}),
	)

	log.info('253')

	context.subscriptions.push(...commands)
	log.info('254')

	await filesExcludeWorktreesDir().then(() => {
		log.info('300 success')
	}, (e) => {
		log.error('301 ' + e)
	})
	log.info('255')
	await ignoreWorktreesDir()
	log.info('256')

	log.info('subscribe')
	context.subscriptions.push(api.worktreeView)
	log.info('register')
	vscode.window.registerTreeDataProvider('multi-branch-checkout.worktreeView', api.worktreeView)

	log.info('257')
	log.info('register filewatcher')
	const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], '**/*'), false, true, false)
	const watcherChange = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], '**/.git/index'), true, false, true)
	context.subscriptions.push(watcher)
	log.info('258')

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
	log.info('25')
	log.info('extension activation complete')
	return api

}

async function filesExcludeWorktreesDir () {
	const filesExclude = vscode.workspace.getConfiguration('files')
	log.info('197 ' + filesExclude.inspect)
	log.info('198 ' + JSON.stringify(filesExclude.inspect))
	log.info('199 ' + JSON.stringify(filesExclude.inspect('exclude'), null, 2))
	const insp = filesExclude.inspect('exclude')

	let  current: { [k: string]: boolean } = {}
	if (insp) {
		current = insp.workspaceValue as { [k: string]: boolean }
	}
	log.info('200 current=' + JSON.stringify(current))
	if (current) {
		log.info('200.1')
	}
	if (current?.['.worktrees/']) {
		log.info('201 current=' + JSON.stringify(current))
		log.info('Pattern \'.worktrees/\' already in files.exclude')
		return
	}
	if (!current) {
		current = {}
	}

	log.info('203 set current[.worktrees/] = true current=' + JSON.stringify(current))
	current['.worktrees/'] = true
	log.info('204')
	await vscode.workspace.getConfiguration('files').update('exclude', current, vscode.ConfigurationTarget.Workspace).then(() => {
			log.info('205')
		}, (e: unknown) => {
			log.error('206 Pattern \'.worktrees/\' not added to files.exclude: ' + e)
			throw e
		})
	log.info('Pattern \'.worktrees/\' added to files.exclude')
}

async function ignoreWorktreesDir () {
	const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, '.gitignore')
	if (!fileExists(uri)) {
		log.info('.gitignore not updated because it does not exist')
		return
	}

	const content = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))
	const lines = content.replace(/\\r/g,'').split('\n')
	for (let line of lines) {
		line = line.trim() // NOSONAR
		if (line === '.worktrees/') {
			log.info('Pattern \'.worktrees/\' already in .gitignore')
			return
		}
	}
	await vscode.workspace.fs.writeFile(uri, Uint8Array.from(Buffer.from(content + '\n## added by vscode extension \'kherring.multi-branch-checkout\'\n.worktrees/\n')))
}
