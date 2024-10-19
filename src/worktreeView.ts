import * as vscode from 'vscode'
import { basename } from 'path'
import { Uri } from 'vscode'
import { getMergeBaseGitUri } from './gitFunctions'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const git = require('@npmcli/git')

type WorktreeNode = WorktreeRoot | WorktreeFileGroup | WorktreeFile | EmptyFileGroup
const parents = new Map<string, WorktreeNode>()
const tree: WorktreeRoot[] = []
const fileMap = new Map<string, WorktreeNode>()

enum FileGroup {
	Untracked = 'Untracked',
	Changes = 'Changes',
	Staged = 'Staged',
	Committed = 'Committed',
}

class FileGroupError extends Error {
	constructor (message: string) {
		super(message)
		this.name = 'FileGroupError'
	}
}

class WorktreeNotFoundError extends Error {
	constructor (message: string) {
		super(message)
		this.name = 'WorktreeNotFoundError'
	}
}

export class WorktreeRoot extends vscode.TreeItem {
	private committed: WorktreeFileGroup
	private staged: WorktreeFileGroup
	private changes: WorktreeFileGroup
	private untracked: WorktreeFileGroup
	private _locked: boolean = false

	constructor(public readonly uri: vscode.Uri, branch: string) {
		super(basename(uri.fsPath), vscode.TreeItemCollapsibleState.Collapsed)
		this.label = basename(uri.fsPath)
		this.id = uri.fsPath
		this.contextValue = 'WorktreeRoot'
		this.description = branch
		this.resourceUri = uri
		if (vscode.workspace.workspaceFolders && this.uri.fsPath == vscode.workspace.workspaceFolders[0].uri.fsPath) {
			this.iconPath = new vscode.ThemeIcon('root-folder-opened')
			this.contextValue = 'WorktreePrimary'
		} else {
			this.iconPath = new vscode.ThemeIcon('repo')
		}
		this.committed = new WorktreeFileGroup(this, FileGroup.Committed)
		this.staged = new WorktreeFileGroup(this, FileGroup.Staged)
		this.changes = new WorktreeFileGroup(this, FileGroup.Changes)
		this.untracked = new WorktreeFileGroup(this, FileGroup.Untracked)
		this.setLocked(this._locked)

		tree.push(this)
	}

	getParent () {
		return undefined
	}

	get children () {
		const c: WorktreeNode[] = []
		if (this.committed.children.length > 0) {
			c.push(this.committed)
		}
		if (this.staged.children.length > 0) {
			c.push(this.staged)
		}
		if (this.changes.children.length > 0) {
			c.push(this.changes)
		}
		if (this.untracked.children.length > 0) {
			c.push(this.untracked)
		}
		if (c.length == 0) {
			c.push(new EmptyFileGroup(this))
		}
		return c
	}

	getFileGroupNode(state: FileGroup) {
		switch (state) {
			case FileGroup.Committed:
				return this.committed
			case FileGroup.Staged:
				return this.staged
			case FileGroup.Changes:
				return this.changes
			case FileGroup.Untracked:
				return this.untracked
		}
	}

	setLocked (isLocked = true) {
		if (this.contextValue == 'WorktreeRootPrimary') {
			return Promise.resolve()
		}
		this._locked = isLocked
		this.contextValue = 'WorktreeRoot' + (isLocked ? 'Locked' : 'Unlocked')
		const action = isLocked ? 'lock' : 'unlock'
		const emoji = isLocked ? '🔒' : '🔓'

		return git.spawn(['worktree', action, this.uri.fsPath], { cwd: this.uri.fsPath })
			.then(() => {
				console.log('successfully ' + action + 'ed ' + emoji + ' worktree: ' + this.uri.fsPath)
			}, (e: any) => {
				let errText = 'Failed to ' + action + ' worktree: ' + e
				if (e.stderr) {
					errText = 'Failed to ' + action + ' ' + emoji + ' worktree: ' + e.stderr
					return
				}
				console.error(errText)
				vscode.window.showErrorMessage(errText)
				throw e
			})
	}

	get locked () {
		return this._locked
	}

}

class EmptyFileGroup extends vscode.TreeItem {
	public readonly uri: vscode.Uri | undefined = undefined
	public readonly children: WorktreeNode[] = []
	constructor (parent: WorktreeRoot) {
		super('')
		this.description = 'No modified files detected'
		this.collapsibleState = vscode.TreeItemCollapsibleState.None
		this.id = parent.id + '#empty'
		this.contextValue = 'WorktreeFileGroupEmpty'
		parents.set(this.id, parent)
	}

	getParent () {
		return parents.get(this.id ?? this.label!.toString())
	}
}

export class WorktreeFileGroup extends vscode.TreeItem {
	public children: WorktreeNode[] = []
	public uri: vscode.Uri | undefined = undefined
	private readonly _group: FileGroup
	constructor(parent: WorktreeRoot, group: FileGroup) {
		super(group, vscode.TreeItemCollapsibleState.Collapsed)
		this._group = group
		this.label = this.groupLabel(group)
		this.id =  parent.id + '#' + group
		this.contextValue = 'WorktreeFileGroup' + group
		parents.set(this.id, parent)
	}

	getParent () {
		return parents.get(this.id ?? this.label!.toString())
	}

	private groupLabel (group: FileGroup) {
		switch (group) {
			case FileGroup.Committed:
				return 'Committed Changes'
			case FileGroup.Staged:
				return 'Staged Changes'
			case FileGroup.Changes:
				return 'Changes'
			case FileGroup.Untracked:
				return 'Untracked Changes'
		}
	}

	group = () => {
		return this._group
	}

	getRepoUri () {
		const parent = this.getParent()
		if (parent?.uri) {
			return parent.uri
		}
		throw new WorktreeNotFoundError('Worktree root directory not found for ' + this.id + ' (label=' + this.label + '; uri=' + this.uri?.fsPath + ')')
	}
}

export class WorktreeFile extends vscode.TreeItem {
	// public children: WorktreeNode[] = []
	public children: WorktreeNode[] = []
	public uri: vscode.Uri | undefined = undefined
	public state: string | undefined = undefined
	public relativePath: string

	constructor(uri: vscode.Uri, parent: WorktreeFileGroup, state: string) {
		super(basename(uri.fsPath), vscode.TreeItemCollapsibleState.None)
		this.label = basename(uri.fsPath)
		this.id = uri.fsPath + '#' + parent.group()
		this.contextValue = 'WorktreeFile' + parent.group()
		this.uri = uri
		this.resourceUri = uri
		console.log('filemap.set uri=' + uri.fsPath + '; id=' + this.id)
		fileMap.set(this.resourceUri.fsPath, this)
		this.relativePath = uri.fsPath.replace(parent.getRepoUri().fsPath, '').substring(1)
		// this.resourceUri = vscode.Uri.parse(uri.toString().replace('file:///', 'worktree:///'))
		this.tooltip = uri.fsPath
		this.state = state
		if (this.state == 'D') {
			this.label = '~~~' + this.label + '~~~'
		}

		const wt = parent.getParent()
		if (wt?.uri) {
			this.description = uri.fsPath
			if (this.description.startsWith(wt.uri.fsPath)) {
				this.description = this.description.substring(wt.uri.fsPath.length)
			}
			if (this.description.endsWith(this.label)) {
				this.description = this.description.substring(0, this.description.length - this.label.length)
			}
			if (this.description.startsWith('/') || this.description.startsWith('\\')) {
				this.description = this.description.substring(1)
			}
			if (this.description.endsWith('/') || this.description.endsWith('\\')) {
				this.description = this.description.substring(0, this.description.length - 1)
			}
		}
		parents.set(this.id, parent)
		parent.children.push(this)
	}

	getParent () {
		return parents.get(this.id ?? this.label!.toString())
	}

	getRepoUri () {
		const grandparent = this.getRepoNode()
		if (grandparent?.uri) {
			return grandparent.uri
		}
		throw new WorktreeNotFoundError('Worktree root directory not found for ' + this.id + ' (label=' + this.label + '; uri=' + this.uri?.fsPath + ')')
	}

	getRepoNode () {
		const grandparent = this.getParent()?.getParent()
		if (grandparent) {
			return grandparent
		}
		throw new WorktreeNotFoundError('Worktree root directory not found for ' + this.id + ' (label=' + this.label + '; uri=' + this.uri?.fsPath + ')')
	}
}

export function getNode () {

}

class tdp implements vscode.TreeDataProvider<WorktreeNode> {
	private _onDidChangeTreeData: vscode.EventEmitter<WorktreeNode| WorktreeNode[] | undefined | null | void>

	constructor() {
		this._onDidChangeTreeData = new vscode.EventEmitter<WorktreeNode | WorktreeNode[] | undefined | null | void>()
	}

	get onDidChangeTreeData() {
		return this._onDidChangeTreeData.event
	}

	getTreeItem (element: WorktreeNode): vscode.TreeItem {
		return element as vscode.TreeItem
	}

	getChildren (element: WorktreeNode): WorktreeNode[] {
		if (!element) {
			return tree
		}
		return element.children
	}

	getParent (element: WorktreeNode): WorktreeNode | undefined {
		return element.getParent()
	}

	updateTree () {
		return this._onDidChangeTreeData.fire()
	}
}

function emptyTree(children: WorktreeNode[]) {
	while (children.length > 0) {
		const c = children.pop()
		if (c) {
			emptyTree(c.children)
		}
	}
}

async function initWorktree() {
	emptyTree(tree)

	if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
		console.warn('No workspace folder found')
		return
	}

	const trees: string[] = await git.spawn(['worktree', 'list', '--porcelain', '-z'], {cwd: vscode.workspace.workspaceFolders[0].uri.fsPath })
		.then((r: any) => {
			const stdout = r.stdout as string
			const trees = stdout.split('\0\0')
			return trees
		}, (e: any) => {
			console.error('e=' + JSON.stringify(e,null,2))
			throw e
		})

	for (const t of trees) {
		if (t == '') {
			continue
		}
		const lines = t.trim().split('\0')
		if (lines.length < 3) {
			console.error('Invalid worktree=' + t)
			continue
		}

		const worktreePath = lines[0].split(' ')[1]
		const branch = lines[2].split(' ')[1]
		const locked = lines[3] === 'locked'

		const uri = vscode.Uri.file(worktreePath)

		const dirExist = await vscode.workspace.fs.stat(uri)
			.then((s: vscode.FileStat) => {
				if (!s) {
					return false
					console.error('worktree not found: ' + uri.fsPath)
				}
				if (s.type != vscode.FileType.Directory) {
					console.error('worktree not a directory: ' + uri.fsPath)
					return false
				}
				return true
			}, (e: unknown) => {
				console.error('worktree not found: ' + uri.fsPath + ' (e=' + e + ')')
				return false
			})
		if (!dirExist) {
			continue
		}

		const worktree = vscode.workspace.asRelativePath(worktreePath)
		// const commit = lines[1].split(' ');
		const wt = new WorktreeRoot(uri, branch)
		// wt.resourceUri = vscode.Uri.file(worktreePath)
		await gatherWorktreeFiles(wt).then(() => wt.setLocked(locked))
	}
}

async function gatherWorktreeFiles (wt: WorktreeRoot) {
	if (!wt.uri) {
		return Promise.resolve()
	}

	console.log('git status --porcelain -z (in ' + wt.uri.fsPath + ')')
	const p = await git.spawn(['status', '--porcelain', '-z'], {cwd: wt.uri.fsPath})
		.then((r: any) => {
			const responses = r.stdout.split('\0')

			for (let i = 0; i < responses.length; i++) {
				let response = responses[i]
				if (i == 0 && response.substring(2,3) != ' ') {
					response = ' ' + response
				}
				const stagedState = response.substring(0, 1).trim()
				const unstagedState = response.substring(1, 2).trim()
				const file = response.substring(3)
				if (file == '') {
					continue
				}

				if (stagedState != '?' && stagedState != '') {
					const c = new WorktreeFile(vscode.Uri.joinPath(wt.uri, file), wt.getFileGroupNode(FileGroup.Staged), stagedState)
				}
				if (unstagedState != '') {
					let group = FileGroup.Changes
					if (unstagedState == 'A' || unstagedState == '?') {
						group = FileGroup.Untracked
					}
					const c = new WorktreeFile(vscode.Uri.joinPath(wt.uri, file), wt.getFileGroupNode(group), unstagedState)
				}
			}
			return true
		}, (e: any) => {
			console.error('uri=' + wt.uri.fsPath + '; e=' + JSON.stringify(e,null,2))
			throw e
		})
	console.log('end gatherWorktreeFiles (p=' + p + ')')
	return p
}

function validateUri (node: WorktreeNode) {
	if (!node.uri) {
		throw new Error('Failed to unstage file - filepath not set (uri=' + node.uri + ')')
	}
	return true
}

async function command_createWorktree () {
	//display an input dialog to get the branch name
	const branchName = await vscode.window.showInputBox({ prompt: 'Enter the branch name' })
	if (!branchName) {
		return
	}
	if (!vscode.workspace.workspaceFolders) {
		throw new Error('No workspace folder open')
	}

	const worktreesDir = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, '.worktrees')
	await vscode.workspace.fs.stat(worktreesDir)
		.then((s: vscode.FileStat) => {

			if (s.type == vscode.FileType.File) {
				throw new Error('File exists with the name ".worktrees", cannot create directory')
			}
			if (s.type == vscode.FileType.Directory) {
				return Promise.resolve()
			}
			return vscode.workspace.fs.createDirectory(worktreesDir)
		}, (e) => {
			if (e.code == 'FileNotFound') {
				return vscode.workspace.fs.createDirectory(worktreesDir)
			} else {
				throw e
			}
		})

	const worktreeUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, '.worktrees', branchName)
	console.log('checking if worktree exists: ' + worktreeUri.fsPath)
	// throw an error if this directory already exists
	await vscode.workspace.fs.stat(worktreeUri)
		.then((s: vscode.FileStat) => {
			if (s.type == vscode.FileType.Directory) {
				throw new Error('Directory already exists')
			}
			if (s.type == vscode.FileType.File) {
				throw new Error('File already exists')
			}
		}, (e) => {
			if (e.code == 'FileNotFound') {
				console.error('receieved FileNotFound as expected (e=' + e +')')
			} else {
				throw e
			}
		})

	//create the worktree
	console.log('git worktree add -b ' + branchName + ' ' + worktreeUri.fsPath)
	await git.spawn(['worktree', 'add', '-b', branchName, worktreeUri.fsPath], { cwd: vscode.workspace.workspaceFolders[0].uri.fsPath })
		.then((r: any) => {
			console.log('worktree created for branch: ' + branchName)
		}, (e: any) => {
			if (e.stderr) {
				console.error('Failed to create worktree: ' + e.stderr)
				vscode.window.showErrorMessage('Failed to create worktree: ' + e.stderr)
			} else {
				console.error('Failed to create worktree: ' + JSON.stringify(e))
			}
			throw e
		})
	return true
}

async function command_deleteWorktree (rootNode: WorktreeRoot) {
	if (rootNode.locked) {
		await vscode.window.showWarningMessage('Worktree is locked and cannot be deleted')
	}

	// get count of files in the worktree
	let count = 0
	console.log('command_deleteWorktree rootNode=' + rootNode.id + ' ' + rootNode.children.length)
	for (const child of rootNode.children) {
		count += child.children.length
	}

	if (count > 0) {
		const proceed = await vscode.window.showWarningMessage('Worktree has modified files which have not been committed.  Delete anyway?', 'Yes', 'No')
			.then((r: 'Yes' | 'No' | undefined) => {
				if (r == "No") {
					console.log('User opted not to delete worktree with modified files')
					return false
				}
				if (!r) {
					throw new Error('Failed to delete worktree with modified files, no response from user')
				}
				return true
			})
		if (!proceed) {
			return Promise.resolve()
		}
	}
	console.log('removing worktree ' + rootNode.id)
	return await git.spawn(['worktree', 'remove', rootNode.uri.fsPath], { cwd: vscode.workspace.workspaceFolders![0].uri.fsPath })
		.then((r: any) => {
			console.log('Worktree removed successfully: ' + rootNode.uri.fsPath)
			vscode.window.showInformationMessage('Worktree removed successfully: ' + rootNode.uri.fsPath)
		}, (e: any) => {
			console.error('e=' + JSON.stringify(e, null, 2))
			if (e.stderr) {
				vscode.window.showErrorMessage('Failed to remove worktree: ' + e.stderr)
				// TODO - delete with `--force`
				return
			}
			vscode.window.showErrorMessage('Failed to remove worktree: ' + e)
			throw e
		})
}

function command_launchWindowForWorktree (node: WorktreeRoot) {
	validateUri(node)
	return vscode.commands.executeCommand('vscode.openFolder', node.uri, { forceNewWindow: true })
}

function command_pullWorktree (node: WorktreeRoot) {
	validateUri(node)
	return vscode.commands.executeCommand('git.pull', { uri: node.uri } )
		.then((r: any) => {
			console.log('git pull successful')
		})
}

function command_pushWorktree (node: WorktreeRoot) {
	validateUri(node)
	return vscode.commands.executeCommand('git.push', { uri: node.uri } )
		.then((r: any) => {
			console.log('git push successful')
		})
}

async function command_commit(node: WorktreeFileGroup) {
	const message = await vscode.window.showInputBox({ prompt: 'Enter commit message' })
	if (!message) {
		return
	}
	await git.spawn(['commit', '-m', message], { cwd: node.getRepoUri().fsPath })
	vscode.window.showInformationMessage('Changes committed.')
}

async function command_revertChanges(node: WorktreeFileGroup) {
	await git.spawn(['checkout', '--', '.'], { cwd: node.getRepoUri().fsPath })
	vscode.window.showInformationMessage('Changes reverted.')
}

async function command_revertUntracked(node: WorktreeFileGroup) {
	await git.spawn(['clean', '-fd'], { cwd: node.getRepoUri().fsPath })
	vscode.window.showInformationMessage('Untracked files reverted.')
}

async function command_revertFile(node: WorktreeFile) {
	validateUri(node)
	await git.spawn(['checkout', '--', node.uri!.fsPath], { cwd: node.getRepoUri().fsPath })
	vscode.window.showInformationMessage(`File ${node.label} reverted.`)
}

async function command_compareFileWithMergeBase(node: WorktreeFile) {
	console.log('command_compareFileWithMergeBase node.id=' + node.id)
	const mergeBaseGitUri = getMergeBaseGitUri(node)
	console.log('mergeBaseGitUri=' + mergeBaseGitUri)
	await vscode.commands.executeCommand('vscode.diff', mergeBaseGitUri, node.uri)
	console.log('command_compareFileWithMergeBase done')
}

export class WorktreeView {
	view: vscode.TreeView<WorktreeNode>
	// _onDidChangeTreeData = new vscode.EventEmitter();
	tdp = new tdp()

	constructor(context: vscode.ExtensionContext) {

		this.view = vscode.window.createTreeView('multi-branch-checkout.worktreeView', { treeDataProvider: this.tdp, showCollapseAll: true, canSelectMany: true })
		// this.view.badge = { tooltip: 'Worktrees', value: 111 }
		this.view.badge = undefined
		this.view.title = 'Multi Branch Checkout (Worktrees)'
		this.view.message = '**Multi Branch Checkout**: use this to separate commits into multiple branches more easily'
		this.view.description = 'this is a description!'
		context.subscriptions.push(this.view)

		// ********** WorktreeView Commands ********** //
		vscode.commands.registerCommand('multi-branch-checkout.refresh', () => { return this.refresh() })
		vscode.commands.registerCommand('multi-branch-checkout.createWorktree', () => {
			return command_createWorktree()
				.then(() => { return this.refresh() })
		})

		// ********** WorktreeRoot Commands ********** //
		vscode.commands.registerCommand('multi-branch-checkout.deleteWorktree', (node: WorktreeRoot) => {
			return command_deleteWorktree(node)
				.then(() => { return this.refresh() })
		})
		vscode.commands.registerCommand('multi-branch-checkout.launchWindowForWorktree', (node: WorktreeRoot) => {
			return command_launchWindowForWorktree(node)
		})
		vscode.commands.registerCommand('multi-branch-checkout.pullWorktree', (node: WorktreeRoot) => {
			return command_pullWorktree(node)
		})
		vscode.commands.registerCommand('multi-branch-checkout.pushWorktree', (node: WorktreeRoot) => {
			return command_pushWorktree(node)
		})
		vscode.commands.registerCommand('multi-branch-checkout.lockWorktree', (node: WorktreeRoot) => {
			return node.setLocked(true)
				.then(this.tdp.updateTree())
		})
		vscode.commands.registerCommand('multi-branch-checkout.unlockWorktree', (node: WorktreeRoot) => {
			return node.setLocked(false)
				.then(this.tdp.updateTree())
		})

		// ********** WorktreeFileGroup Commands ********** //
		// vscode.commands.registerCommand("multi-branch-checkout.commit", (node: WorktreeFileGroup) => {
		// 	return command_commit(node)
		// })
		// vscode.commands.registerCommand("multi-branch-checkout.revertChanges", (node: WorktreeFileGroup) => {
		// 	return command_revertChanges(node)
		// })
		// vscode.commands.registerCommand("multi-branch-checkout.revertUntracked", (node: WorktreeFileGroup) => {
		// 	return command_revertUntracked(node)
		// })
		// vscode.commands.registerCommand('multi-branch-checkout.revertFile', (node: WorktreeFile) => {
		// 	return command_revertFile(node)
		// })
		// vscode.commands.registerCommand('multi-branch-checkout.compareFileWithMergeBase', (node: WorktreeFile) => {
		// 	return command_compareFileWithMergeBase(node)
		// })
		// vscode.commands.registerCommand('multi-branch-checkout.moveToWorktree', (node: WorktreeFile) => {
		// 	return command_moveToWorktree(node)
		// })
		// vscode.commands.registerCommand("multi-branch-checkout.stageChanges", (node: WorktreeFileGroup) => {
		// 	return command_stageFiles(node, 'stage').then(() => { this.refresh() })
		// })
		// vscode.commands.registerCommand("multi-branch-checkout.unstageGroup", (node: WorktreeFileGroup) => {
		// 	return command_stageFiles(node, 'unstage').then(() => { this.refresh() })
		// })
		// vscode.commands.registerCommand("multi-branch-checkout.revertChanges", (node: WorktreeFileGroup) => {
		// 	return vscode.window.showWarningMessage('not yet implemented')
		// })
		// vscode.commands.registerCommand("multi-branch-checkout.revertUntracked", (node: WorktreeFileGroup) => {
		// 	return vscode.window.showWarningMessage('not yet implemented')
		// })

		// vscode.window.registerFileDecorationProvider(new TreeItemDecorationProvider())

		this.view.onDidChangeSelection (async (e: vscode.TreeViewSelectionChangeEvent<WorktreeNode>) => {
			const selectedFiles = e.selection.filter((node) => { return node instanceof WorktreeFile })
			if (e.selection.length == 0) {
				return
			}
			if (e.selection.length == 1) {
				if (!e.selection[0].uri) {
					return
				}
				if (!(e.selection[0] instanceof WorktreeFile)) {
					return
				}
				const compareUri = await getMergeBaseGitUri(e.selection[0])
				console.log('compareUri=' + compareUri + '; selectedUri=' + e.selection[0].uri)
				const title = '[Worktree: ' + e.selection[0].getRepoNode().label + '] ' + e.selection[0].relativePath + ' vs merge-base'
				await vscode.commands.executeCommand('vscode.diff', compareUri, e.selection[0].uri, title)
				return
			}
		})

		this.refresh().then(() => console.log('extension activated!'))
	}

	refresh () {
		return initWorktree()
			.then(() => {
				return this.tdp.updateTree()
			}, (e) => {
				console.error('failed to init worktree view, attempting to display anyway (e=' + e + ')')
				this.tdp.updateTree()
				throw e
			})
	}

	public getRootNodes() {
		return tree
	}

	public getNode (uri: vscode.Uri) {
		console.log('fileMap.get uri=' + uri.fsPath)
		return fileMap.get(uri.fsPath)
	}

	public reveal (nodeOrUri: WorktreeNode | Uri, options: { select: boolean, focus: boolean }) {
		let node: WorktreeNode | undefined = undefined
		if (nodeOrUri instanceof Uri) {
			console.log('nodeOrUri.fsPath=' + nodeOrUri.fsPath)
			node = this.getNode(nodeOrUri)
			console.log('node.id=' + node?.id)
			if (!node) {
				console.error('node not found for uri=' + nodeOrUri.fsPath)
				throw new Error('node not found for uri=' + nodeOrUri.fsPath)
			}
		} else {
			node = nodeOrUri
		}
		return this.view.reveal(node, options)
			.then(() => {
				console.log('revealed node.id=' + node.id)
			}, (e: unknown) => {
				console.error('failed to reveal node.id=' + node.id + ' (e=' + e + ')')
				throw e
			})
	}
}
