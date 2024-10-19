import * as vscode from 'vscode'
import { EventEmitter } from 'events'
import { basename } from 'path'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const git = require('@npmcli/git')


// type WorktreeNode = WorktreeRoot | WorktreeFileGroup | WorktreeFile
// type WorktreeNode = WorktreeRoot | WorktreeFileGroup
type WorktreeNode = WorktreeRoot
const parents = new Map<string, WorktreeNode>()
const tree: WorktreeRoot[] = []


// class worktreeItem extends vscode.TreeItem {
// 	public children: worktreeItem[] = []

// 	constructor(label: string | vscode.TreeItemLabel, id?: string, parent?: worktreeItem) {
// 		super(label, parent ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded)
// 		this.id = id ?? label.toString()
// 		console.log('300 this.id=' + this.id)
// 		parent?.children.push(this)
// 		if (parent) {
// 			console.log('301 parent.id=' + parent.id)
// 			parents.set(this.id, parent)
// 		}
// 	}

// 	getParent() {
// 		if (this.id) {
// 			return parents.get(this.id)
// 		}
// 		return undefined
// 	}
// }

enum FileState {
	Untracked = 'Untracked Changes',
	Modified = 'Changes',
	Staged = 'Staged Changes',
	Committed = 'Committed Changes',
}

class WorktreeRoot extends vscode.TreeItem {
	// private committed = new WorktreeFileGroup(this, FileState.Committed)
	// private staged = new WorktreeFileGroup(this, FileState.Staged)
	// private changes = new WorktreeFileGroup(this, FileState.Modified)
	// private untracked = new WorktreeFileGroup(this, FileState.Untracked)

	constructor(uri: vscode.Uri) {
		// super(uri, vscode.TreeItemCollapsibleState.Collapsed)
		console.log('100')
		super(basename(uri.fsPath), vscode.TreeItemCollapsibleState.Collapsed)
		console.log('101 this.label=' + this.label)
		this.label = basename(uri.fsPath)
		this.id = uri.fsPath
		console.log('102 this.label=' + this.label)
		tree.push(this)
		console.log('103')
	}

	// getChildren = () => [this.committed, this.staged, this.changes, this.untracked]
	getChildren () {
		return []
	}
}

class WorktreeFileGroup extends vscode.TreeItem {
	private children: WorktreeFile[] = []
	constructor(parent: WorktreeRoot, public readonly state: FileState) {
		super(state)
		this.id =  parent.id + '#' + state
		parents.set(this.id, parent)
	}

	getChildren = () => this.children
}

class WorktreeFile extends vscode.TreeItem {
	constructor(uri: vscode.Uri, parent: WorktreeFileGroup, public state: FileState) {
		super(basename(uri.fsPath))
		// this.resourceUri = uri
		if (!this.id) {
			this.id = uri.fsPath
		}
		// parents.set(this.id, parent)
	}

	getChildren = () => []
}

class tdp implements vscode.TreeDataProvider<WorktreeNode> {
	private _onDidChangeTreeData: vscode.EventEmitter<WorktreeNode | WorktreeNode[] | undefined | null | void>

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
		if (element instanceof WorktreeFile) {
			console.log('502')
			return []
		}
		console.log('503')
		return element.getChildren()
	}

	getParent (element: WorktreeNode): WorktreeNode | undefined {
		if (element.id) {
			return parents.get(element.id)
		}
		return undefined
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
			const trees = (r.stdout as string).split('\0\0')
			const proms: Promise<boolean>[] = []

			console.log('120')
			for (const t of trees) {
				if (t == '') {
					continue
				}
				console.log('130')
				const lines = t.trim().split('\0')
				console.log('131')
				if (lines.length != 3) {
					console.log('132')
					console.error('Invalid worktree=' + t)
					continue
				}
				console.log('133')
				const worktreePath = lines[0].split(' ')[1]
				const uri = vscode.Uri.file(worktreePath)
				// const commit = lines[1].split(' ');
				const branch = lines[2].split(' ')[1]

				const wt = tree.find(wt => wt.label === basename(worktreePath)) ??
							new WorktreeRoot(uri)

				wt.description = branch
				// wt.contextValue = 'worktree'
				console.log('140 wt.label=' + wt.label + '; wt.id=' + wt.id)


				// refreshWorktreeFiles(wt)

				console.log('worktree=' + wt.label + '; branch=' + branch)
			}
			console.log('150')
			return Promise.all(proms)
		}).then((r: boolean[]) => {
			console.log('r=' + r + '; tree=' + JSON.stringify(tree,null,2))
			return true
		})
	return true
}

async function refreshWorktreeFiles (wt: WorktreeRoot) {
	const proms: Promise<boolean>[] = []
	// const wt = new worktreeItem(worktree);
	// wt.resourceUri = vscode.Uri.file(worktreePath);
	// wt.description = branch;
	// tree.push(wt);
	console.log('600')
	console.log('602')

	if (!wt.resourceUri) {
		return
	}
	const p = git.spawn(['diff-files', '--name-status', '-z'], {cwd: wt.resourceUri.fsPath})
		.then((r: any) => {
			// console.log('r=' + JSON.stringify(r,null,2))

			const stdout = r.stdout as string
			console.log('stdout=' + stdout)
			const responses = stdout.split('\0')
			while(responses.length > 0) {
				const status = responses.shift()
				const file = responses.shift()
				if (!file) {
					throw new Error('Invalid diff-files response')
				}
				console.log('650 ' + status + '; file=' + file)
				if (status == 'M') {
					if (wt.resourceUri) {
						// const c = new WorktreeFile(file, vscode.Uri.joinPath(wt.resourceUri, file).fsPath, changes)
						// c.collapsibleState = vscode.TreeItemCollapsibleState.None
					}
				}
			}


			// new worktreeItem('untracked', , untracked)
			return true
		})
	proms.push(p)
	return await Promise.all(proms)
}

export class WorktreeView2 {
	view: vscode.TreeView<WorktreeNode>
	// _onDidChangeTreeData = new vscode.EventEmitter();
	tdp = new tdp()

	constructor(context: vscode.ExtensionContext) {
		this.view = vscode.window.createTreeView('WorktreeView', { treeDataProvider: this.tdp, showCollapseAll: true })
		this.view.badge = { tooltip: 'Worktrees', value: 111 }
		context.subscriptions.push(this.view)

		initWorktreeView()
			.then(() => {
				console.log('starting refresh...')
				this.tdp.refresh()
				console.log('refresh complete!')
			})

	}
}
