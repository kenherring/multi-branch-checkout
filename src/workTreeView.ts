import * as vscode from 'vscode'
import { EventEmitter } from 'events'
import { basename, dirname } from 'path'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const git = require('@npmcli/git')

type WorktreeNode = WorktreeRoot | WorktreeFileGroup | WorktreeFile
const parents = new Map<string, WorktreeNode>()
const tree: WorktreeNode[] = []

enum FileGroup {
	Untracked = 'Untracked Changes',
	Changes = 'Changes',
	Staged = 'Staged Changes',
	Committed = 'Committed Changes',
}

class FileGroupError extends Error {
	constructor (message: string) {
		super(message)
		this.name = 'FileGroupError'
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
		this.description = branch
		this.resourceUri = uri
		this.contextValue = 'WorktreeRoot'
		this.iconPath = new vscode.ThemeIcon('repo')

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

	getFileGroup(state: FileGroup) {
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
	constructor(parent: WorktreeRoot, public readonly state: FileGroup) {
		super(state, vscode.TreeItemCollapsibleState.Collapsed)
		this.id =  parent.id + '#' + state
		parents.set(this.id, parent)
	}

	getParent () {
		return parents.get(this.id ?? this.label!.toString())
	}
}

class WorktreeFile extends vscode.TreeItem {
	// public children: WorktreeNode[] = []
	public children: WorktreeNode[] = []
	public uri: vscode.Uri | undefined = undefined
	constructor(uri: vscode.Uri, parent: WorktreeFileGroup) {
		super(basename(uri.fsPath), vscode.TreeItemCollapsibleState.None)
		this.label = basename(uri.fsPath)
		this.id = uri.fsPath
		this.uri = uri
		this.resourceUri = uri
		this.tooltip = uri.fsPath

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

	refresh () {
		console.log('refresh!')
		this._onDidChangeTreeData.fire()
	}
}

async function initWorktreeView() {

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


				proms.push(refreshWorktreeFiles(wt))

				console.log('worktree=' + worktree)
				console.log('branch=' + branch)
			}
			return Promise.all(proms)
		}).then((r: boolean[]) => {
			console.log('r=' + r + '; tree=' + JSON.stringify(tree,null,2))
			return true
		})
}

async function refreshWorktreeFiles (wt: WorktreeRoot) {
	console.log('600')
	if (!wt.uri) {
		return
	}
	const p = await git.spawn(['diff-files', '--name-status', '-z'], {cwd: wt.uri.fsPath})
		.then((r: any) => {
			// console.log('r=' + JSON.stringify(r,null,2))

			const stdout = r.stdout as string
			console.log('stdout=' + stdout)
			const responses = stdout.split('\0')
			while(responses.length > 0) {
				if (responses.length < 2) {
					break
				}
				const status = responses.shift()
				const file = responses.shift()
				if (!file) {
					throw new Error('Invalid diff-files response')
				}
				console.log('650 ' + status + '; file=' + file)
				let state: FileGroup | undefined = undefined
				state = FileGroup.Changes
				if (!state) {
					throw new FileGroupError('Invalid file status')
				}
				const c = new WorktreeFile(vscode.Uri.joinPath(wt.uri, file), wt.getFileGroup(state))
				c.collapsibleState = vscode.TreeItemCollapsibleState.None
			}
			return true
		})
	return p
}

export class WorkTreeView {
	view: vscode.TreeView<WorktreeNode>
	// _onDidChangeTreeData = new vscode.EventEmitter();
	tdp = new tdp()

	constructor(context: vscode.ExtensionContext) {

		this.view = vscode.window.createTreeView('worktreeView', { treeDataProvider: this.tdp, showCollapseAll: true })
		// this.view.badge = { tooltip: 'Worktrees', value: 111 }
		this.view.badge = undefined
		this.view.title = 'Worktrees: Multi-Checkout'
		this.view.message = 'Worktrees: Multi-Checkout... use this to separate commits into multiple branches more easily'
		this.view.description = 'this is a description!'
		context.subscriptions.push(this.view)

		initWorktreeView().then(() => { this.tdp.refresh() })

	}
}
