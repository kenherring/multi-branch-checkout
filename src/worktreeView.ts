import * as vscode from 'vscode'
import { basename } from 'path'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const git = require('@npmcli/git')

type WorktreeNode = WorktreeRoot | WorktreeFileGroup | WorktreeFile | EmptyFileGroup
const parents = new Map<string, WorktreeNode>()
const tree: WorktreeNode[] = []
const itemmap = new Map<string, WorktreeNode>()

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
	private _lockCommandDisposable: vscode.Disposable | undefined = undefined

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
		this._locked = isLocked
		console.log('500 isLocked=' + isLocked + '; ' + this._lockCommandDisposable)
		this._lockCommandDisposable?.dispose()
		console.log('501 isLocked=' + isLocked + '; ' + this._lockCommandDisposable)
		let lockAction = 'lock'
		if (isLocked) {
			lockAction = 'unlock'
		}




		if (! this._lockCommandDisposable) {
			// this._lockCommandDisposable = vscode.commands.registerCommand('multi-branch-checkout.' + lockAction + 'Worktree', () => {
			// 	// return this.setLocked(true)
			// 	return this.setLocked(!isLocked)
			// })
		}
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
	private _group: FileGroup
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

	constructor(uri: vscode.Uri, parent: WorktreeFileGroup, state: string) {
		super(basename(uri.fsPath), vscode.TreeItemCollapsibleState.None)
		this.label = basename(uri.fsPath)
		this.id = uri.fsPath + '#' + parent.group()
		this.contextValue = 'WorktreeFile' + parent.group()
		this.uri = uri
		// this.contextValue = "WorktreeFile"

		console.log('uri=' + uri.toString())
		this.resourceUri = uri
		// this.resourceUri = vscode.Uri.parse(uri.toString().replace('file:///', 'worktree:///'))
		this.tooltip = uri.fsPath
		this.state = state

		// console.log('state=' + state + '; id=' + this.id)

		if (this.state == 'D') {
			this.iconPath = new vscode.ThemeIcon('diff-removed')
			this.label = '~~' + this.label + '~~'
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
		this.tooltip = uri.fsPath

		parents.set(this.id, parent)
		parent.children.push(this)
	}

	getParent () {
		return parents.get(this.id ?? this.label!.toString())
	}

	getRepoUri () {
		const grandparent = this.getParent()?.getParent()
		if (grandparent?.uri) {
			return grandparent.uri
		}
		throw new WorktreeNotFoundError('Worktree root directory not found for ' + this.id + ' (label=' + this.label + '; uri=' + this.uri?.fsPath + ')')
	}
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
		console.log('500 element.id=' + element?.id)
		if (!element) {
			console.log('501')
			return tree
		}

		console.log('510')
		const c = element.children
		console.log('511 c.length=' + c.length)
		for (const child of element.children) {
			console.log('520 child.id=' + child.id)
			console.log('521 child.children.length=' + child.children.length)
			console.log('522 child.getParent().id=' + child.getParent()?.id)
			if (child.children.length === 0) {
				console.log('530')
			}
		}
		console.log('540 element.id=' + element.id + '; element.children.length=' + element.children.length)
		return element.children
	}

	getParent (element: WorktreeNode): WorktreeNode | undefined {
		return element.getParent()
	}

	updateTree () {
		console.log('updateTree ' + tree.length)
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

async function initWorktreeView() {
	emptyTree(tree)

	if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
		console.warn('No workspace folder found')
		return
	}

	await git.spawn(['worktree', 'list', '--porcelain', '-z'], {cwd: vscode.workspace.workspaceFolders[0].uri.fsPath })
		.then((r: any) => {
			console.log('110')
			const stdout = r.stdout as string
			const trees = stdout.split('\0\0')
			const proms: Promise<boolean>[] = []
			console.log('120')
			for (const t of trees) {
				console.log('130')
				const lines = t.trim().split('\0')
				if (lines.length < 3) {
					console.error('Invalid worktree=' + t)
					continue
				}
				console.log('131')
				// console.log('lines=' + JSON.stringify(lines,null,2));
				const worktreePath = lines[0].split(' ')[1]
				const uri = vscode.Uri.file(worktreePath)
				const worktree = vscode.workspace.asRelativePath(worktreePath)
				// const commit = lines[1].split(' ');
				const branch = lines[2].split(' ')[1]
				const wt = new WorktreeRoot(uri, branch)
				// wt.resourceUri = vscode.Uri.file(worktreePath)
				console.log('140 wt.label=' + wt.label + '; wt.id=' + wt.id)


				proms.push(gatherWorktreeFiles(wt))

				console.log('worktree=' + worktree)
				console.log('branch=' + branch)
			}
			return Promise.all(proms)
		}).then((r: boolean[]) => {
			return true
		})
}

async function gatherWorktreeFiles (wt: WorktreeRoot) {
	console.log('600')
	if (!wt.uri) {
		return
	}

	console.log('---------- SPAWN ----------')
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
					// group = FileGroup.Untracked
					continue
				}

				console.log('stagedState="' + stagedState + '"; unstagedState=' + unstagedState + '; file="' + file + '"; wt.uri=' + wt.uri.fsPath)
				if (stagedState != '?' && stagedState != '') {
					console.log('stagedState=' + stagedState)
					const c = new WorktreeFile(vscode.Uri.joinPath(wt.uri, file), wt.getFileGroupNode(FileGroup.Staged), stagedState)
				}
				if (unstagedState != '') {
					let group = FileGroup.Changes
					if (unstagedState == 'A' || unstagedState == '?') {
						group = FileGroup.Untracked
					}
					console.log('unstagedState=' + unstagedState + '; group=' + group)
					const c = new WorktreeFile(vscode.Uri.joinPath(wt.uri, file), wt.getFileGroupNode(group), unstagedState)
				}
				console.log('end iterations loop')
			}
			console.log('end loop')
		})
	return p
}

function validateUri (node: WorktreeNode) {
	if (!node.uri) {
		throw new Error('Failed to unstage file - invalid filepath (uri=' + node.uri + ')')
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
			console.log('s=' + JSON.stringify(s,null,2))

			if (s.type == vscode.FileType.File) {
				throw new Error('File exists with the name ".worktrees", cannot create directory')
			}
			if (s.type == vscode.FileType.Directory) {
				console.log('worktrees directory exists')
				return Promise.resolve()
			}
			console.log('creating directory: ' + worktreesDir.fsPath)
			return vscode.workspace.fs.createDirectory(worktreesDir)
		}, (e) => {
			console.log('e.name=' + e.name)
			console.log('json=' + JSON.stringify(e,null,2))
			if (e.code == 'FileNotFound') {
				console.log('receieved FileNotFound as expected (e=' + e +')')
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
			console.log('e.name=' + e.name)
			console.log('json=' + JSON.stringify(e,null,2))
			if (e.code == 'FileNotFound') {
				console.log('receieved FileNotFound as expected (e=' + e +')')
			} else {
				throw e
			}
		})

	//create the worktree
	console.log('git worktree add -b ' + branchName + ' ' + worktreeUri.fsPath)
	await git.spawn(['worktree', 'add', '-b', branchName, worktreeUri.fsPath], { cwd: vscode.workspace.workspaceFolders[0].uri.fsPath })
		.then((r: any) => {
			console.log('r=' + JSON.stringify(r,null,2))
		}, (e: any) => {
			if (e.stderr) {
				console.error('Failed to create worktree: ' + e.stderr)
				vscode.window.showErrorMessage('Failed to create worktree: ' + e.stderr)
			} else {
				console.error('Failed to create worktree: ' + JSON.stringify(e))
			}
			throw e
		})
	console.log('worktree created for branch ' + branchName)
	return true
}

async function command_deleteWorktree (rootNode: WorktreeRoot) {
	// get count of files in the worktree
	let count = 0
	let count2 = 0
	console.log('command_deleteWorktree rootNode=' + rootNode.id + ' ' + rootNode.children.length)
	for (const child of rootNode.children) {
		console.log(child.id + ' ' + child.children.length)
		count2 += child.children.length
		for (const file of child.children) {
			console.log('file=' + file.label)
			count++
		}
	}
	console.log('count=' + count + '; count2=' + count2)

	if (count > 0) {
		await vscode.window.showInformationMessage('Worktree has modified files which have not been committed.  Delete anyway?', 'Yes', 'No')
			.then((r: 'Yes' | 'No' | undefined) => {
				if (r == "No") {
					throw new Error('User opted not to delete worktree with modified files')
				}
				if (!r) {
					throw new Error('Failed to delete worktree with modified files, no response from user')
				}
			})
	}
	console.log('removing worktree ')
	return await git.spawn(['worktree', 'remove', rootNode.uri.fsPath], { cwd: vscode.workspace.workspaceFolders![0].uri.fsPath })
		.then((r: any) => {
			console.log('r=' + JSON.stringify(r,null,2))
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
			console.log('r=' + JSON.stringify(r,null,2))
		}, (e) => {
			console.error('e=' + JSON.stringify(e,null,2))
			throw e
		})
}

function command_pushWorktree (node: WorktreeRoot) {
	validateUri(node)
	return vscode.commands.executeCommand('git.push', { uri: node.uri } )
		.then((r: any) => {
			console.log('r=' + JSON.stringify(r,null,2))
		}, (e) => {
			console.error('e=' + JSON.stringify(e,null,2))
			throw e
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
	const mergeBase = await git.spawn(['merge-base', 'HEAD', 'master'], { cwd: node.getRepoUri().fsPath })
	const mergeBaseCommit = mergeBase.stdout.trim()
	await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(mergeBaseCommit), node.uri)
}

async function command_moveToWorktree(node: WorktreeFile) {
	const targetWorktree = await vscode.window.showQuickPick(tree.map(wt => wt.label!.toString()), { placeHolder: 'Select target worktree' })
	if (!targetWorktree) {
		return
	}
	const targetUri = tree.find(wt => wt.label === targetWorktree)?.uri
	if (!targetUri) {
		throw new Error('Target worktree not found')
	}
	await git.spawn(['mv', node.uri!.fsPath, targetUri.fsPath], { cwd: node.getRepoUri().fsPath })
	vscode.window.showInformationMessage(`File ${node.label} moved to ${targetWorktree}.`)
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

		this.refresh().then(() => console.log('extension activated'))
	}

	refresh () {
		console.log('refresh-1')
		return initWorktreeView().then(() => { console.log('refresh-2'); return this.tdp.updateTree() })
	}
}
