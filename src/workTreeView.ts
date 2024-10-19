import * as vscode from 'vscode'
import { EventEmitter } from 'events'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const git = require('@npmcli/git')


const parents = new Map<string, worktreeItem>()
const tree: worktreeItem[] = []

class worktreeItem extends vscode.TreeItem {
	public children: worktreeItem[] = []

	constructor(label: string, id?: string, parent?: worktreeItem) {
		super(label, parent ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded)
		this.id = id ?? label
		console.log('300 this.id=' + this.id)
		parent?.children.push(this)
		if (parent) {
			console.log('301 parent.id=' + parent.id)
			parents.set(this.id, parent)
		}
	}

	getParent() {
		if (this.id) {
			return parents.get(this.id)
		}
		return undefined
	}
}

export class WorkTreeView {
	view: vscode.TreeView<vscode.TreeItem>
	// _onDidChangeTreeData = new vscode.EventEmitter();
	tdp = new tdp()

	constructor(context: vscode.ExtensionContext) {

		console.log('100')
		initWorktreeView()
			.then(() => {
				console.log('refrsh!')
				this.tdp.refresh()
			})
		console.log('101')

		this.view = vscode.window.createTreeView('worktreeView', { treeDataProvider: this.tdp, showCollapseAll: true })
		console.log('102')
		this.view.badge = { tooltip: 'Worktrees', value: 111 }
		console.log('103')
		context.subscriptions.push(this.view)
		console.log('104')

	}
}

class tdp implements vscode.TreeDataProvider<worktreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<worktreeItem| worktreeItem[] | undefined | null | void>

	constructor() {
		this._onDidChangeTreeData = new vscode.EventEmitter<worktreeItem | worktreeItem[] | undefined | null | void>()
	}

	get onDidChangeTreeData() {
		return this._onDidChangeTreeData.event
	}

	getTreeItem (element: worktreeItem): vscode.TreeItem {
		return element as vscode.TreeItem
	}

	getChildren (element: worktreeItem): worktreeItem[] {
		console.log('500 element.id=' + element?.id)
		if (element) {
			console.log('501')
			const c = element.children
			for (const child of element.children) {
				console.log('502 child.id=' + child.id +
						'; child.children.length=' + child.children.length +
						'; child.getParen().id=' + child.getParent()?.id)
				if (child.children.length === 0) {
					console.log('103')
				}
			}
			return element.children

		}
		console.log('102')
		return tree
	}

	getParent (element: worktreeItem): worktreeItem | undefined {
		return element.getParent()
	}

	refresh () {
		this._onDidChangeTreeData.fire()
	}
}


async function initWorktreeView() {

	console.log('100')
	tree.push(new worktreeItem('branch_1'))
	tree.push(new worktreeItem('branch_2'))
	console.log('101')
	new worktreeItem('file1', undefined, tree[1])
	console.log('102')

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
				const worktree = vscode.workspace.asRelativePath(worktreePath)
				// const commit = lines[1].split(' ');
				const branch = lines[2].split(' ')[1]
				const wt = new worktreeItem(worktree)
				// wt.resourceUri = vscode.Uri.file(worktreePath);
				wt.description = branch
				wt.contextValue = 'worktree'
				wt.resourceUri = vscode.Uri.file(worktreePath)
				console.log('140 wt.label=' + wt.label + '; wt.id=' + wt.id)
				tree.push(wt)


				refreshWorktreeFiles(wt)

				console.log('worktree=' + worktree)
				console.log('branch=' + branch)
			}
			return Promise.all(proms)
		}).then((r: boolean[]) => {
			console.log('r=' + r + '; tree=' + JSON.stringify(tree,null,2))
			return true
		})
}

async function refreshWorktreeFiles (wt: worktreeItem) {
	const proms: Promise<boolean>[] = []
	// const wt = new worktreeItem(worktree);
	// wt.resourceUri = vscode.Uri.file(worktreePath);
	// wt.description = branch;
	// tree.push(wt);
	console.log('600')
	const committed = new worktreeItem('Committed Changes', wt.id + '#committed', wt)
	const staged = new worktreeItem('Staged Changes', wt.id + '#staged', wt)
	const changes = new worktreeItem('Changes', wt.id + '#changes', wt)
	const untracked = new worktreeItem('Untracked Changes', wt.id + '#untracked', wt)
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
									const c = new worktreeItem(file, vscode.Uri.joinPath(wt.resourceUri, file).fsPath, changes)
									c.collapsibleState = vscode.TreeItemCollapsibleState.None
								}
							}
						}


						// new worktreeItem('untracked', , untracked)
						return true
					})
	proms.push(p)
	return await Promise.all(proms)



	// new worktreeItem('untracked', wt);
	// new worktreeItem('deleted', wt);
	// new worktreeItem('staged', wt);
}
