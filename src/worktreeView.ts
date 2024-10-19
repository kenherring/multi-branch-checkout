import * as vscode from 'vscode'
import { EventEmitter } from 'events'
import { basename, dirname } from 'path'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const git = require('@npmcli/git')

type WorktreeNode = WorktreeRoot | WorktreeFileGroup | WorktreeFile
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

class WorktreeRoot extends vscode.TreeItem {
	private committed: WorktreeFileGroup
	private staged: WorktreeFileGroup
	private changes: WorktreeFileGroup
	private untracked: WorktreeFileGroup

	constructor(public readonly uri: vscode.Uri, branch: string) {
		super(basename(uri.fsPath), vscode.TreeItemCollapsibleState.Collapsed)
		this.label = basename(uri.fsPath)
		this.id = uri.fsPath
		this.contextValue = 'WorktreeRoot'
		this.description = branch
		this.resourceUri = uri
		this.contextValue = 'WorktreeRoot'
		if (vscode.workspace.workspaceFolders && this.uri.fsPath == vscode.workspace.workspaceFolders[0].uri.fsPath) {
			this.iconPath = new vscode.ThemeIcon('root-folder-opened')
		} else {
			this.iconPath = new vscode.ThemeIcon('repo')
		}
		this.committed = new WorktreeFileGroup(this, FileGroup.Committed)
		this.staged = new WorktreeFileGroup(this, FileGroup.Staged)
		this.changes = new WorktreeFileGroup(this, FileGroup.Changes)
		this.untracked = new WorktreeFileGroup(this, FileGroup.Untracked)

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
}

class WorktreeFileGroup extends vscode.TreeItem {
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
}

class WorktreeFile extends vscode.TreeItem {
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
		throw new WorktreeNotFoundError('Worktree root direcotry not found for ' + this.id + ' (label=' + this.label + '; uri=' + this.uri?.fsPath + ')')
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
				if (lines.length != 3) {
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
					const c = new WorktreeFile(vscode.Uri.joinPath(wt.uri, file), wt.getFileGroupNode(FileGroup.Staged), unstagedState.trim())
				}
				if (unstagedState != '?' && unstagedState != '') {
					let group = FileGroup.Changes
					if (unstagedState == 'A') {
						group = FileGroup.Untracked
					}
					console.log('unstagedState=' + unstagedState + '; group=' + group)
					const c = new WorktreeFile(vscode.Uri.joinPath(wt.uri, file), wt.getFileGroupNode(group), unstagedState.trim())
					console.log('c=' + JSON.stringify(c,null,2))
				}
				console.log('end iterations loop')
			}
			console.log('end loop')
		})
	return p
}

export class WorktreeView {
	view: vscode.TreeView<WorktreeNode>
	// _onDidChangeTreeData = new vscode.EventEmitter();
	tdp = new tdp()

	constructor(context: vscode.ExtensionContext) {

		this.view = vscode.window.createTreeView('multi-branch-checkout.worktreeView', { treeDataProvider: this.tdp, showCollapseAll: true })
		// this.view.badge = { tooltip: 'Worktrees', value: 111 }
		this.view.badge = undefined
		this.view.title = 'Worktrees: Multi-Checkout'
		this.view.message = 'Worktrees: Multi-Checkout... use this to separate commits into multiple branches more easily'
		this.view.description = 'this is a description!'
		context.subscriptions.push(this.view)
		vscode.commands.registerCommand('multi-branch-checkout.refresh', () => { return this.refresh() })
		vscode.commands.registerCommand('multi-branch-checkout.stageFile', (node: WorktreeFile) => {
			if (!node.uri) {
				throw new Error('Failed to stage file (uri=' + node.uri + ')')
			}
			git.spawn(['add', node.uri.fsPath], { cwd: node.getRepoUri().fsPath })
				.then((r: any) => {	this.refresh() })
		})
		vscode.commands.registerCommand('multi-branch-checkout.unstageFile', (node: WorktreeFile) => {
			if (!node.uri) {
				throw new Error('Failed to unstage file (uri=' + node.uri + ')')
			}
			git.spawn(['reset', node.uri.fsPath], { cwd: node.getRepoUri().fsPath })
				.then((r: any) => { this.refresh() })
		})
		// vscode.window.registerFileDecorationProvider(new TreeItemDecorationProvider())

		this.refresh().then(() => {
			console.log('extension activated')
		})
	}

	refresh () {
		console.log('refresh-1')
		return initWorktreeView().then(() => { console.log('refresh-2'); return this.tdp.updateTree() })
	}
}
