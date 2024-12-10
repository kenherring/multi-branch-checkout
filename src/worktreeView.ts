import * as vscode from 'vscode'
import { git } from './gitFunctions'
import { log } from './channelLogger'
import { nodeMaps, WorktreeFile, WorktreeNode, WorktreeRoot } from './worktreeNodes'

let awaitingDidChangeTreeData = false

class tdp implements vscode.TreeDataProvider<WorktreeNode> {

	private readonly _onDidChangeTreeData: vscode.EventEmitter<WorktreeNode | undefined> = new vscode.EventEmitter<WorktreeNode | undefined>()
	readonly onDidChangeTreeData: vscode.Event<WorktreeNode | undefined> = this._onDidChangeTreeData.event

	private readonly d: vscode.Disposable[] = []

	getTreeItem (element: WorktreeNode): vscode.TreeItem {
		return element as vscode.TreeItem
	}

	getChildren (element: WorktreeNode): WorktreeNode[] {
		if (!element) {
			return nodeMaps.tree
		}
		return element.children
	}

	getParent (element: WorktreeNode): WorktreeNode | undefined {
		return element.getParent()
	}

	updateTree (node?: WorktreeNode) {
		log.info('700 START updateTree')
		log.info('updateNode node=' + node)
		awaitingDidChangeTreeData = true
		const waitObj = this.waitForDidChangeTreeData(node)
		this._onDidChangeTreeData.fire(node)
		return waitObj
	}

	private waitForDidChangeTreeData (node?: WorktreeNode) {
		log.info('awaitingDidChangeTreeData=' + awaitingDidChangeTreeData)
		if (!awaitingDidChangeTreeData) {
			log.warn('not awaiting change')
			return Promise.resolve(true)
		}

		while(this.d.length > 0) {
			const disposeMe = this.d.pop()
			if (disposeMe) {
				disposeMe.dispose()
			}
		}

		const prom =  new Promise<boolean>((resolve, reject) => {
			const listener = this.onDidChangeTreeData((e) => {
				log.info('waitForDidChangeTreeData event=' + e)
				resolve(true)
			})
			this.d.push(listener)
			setTimeout(() => reject(new Error('Timeout after 2000ms waiting for DidTreeDataChange event')), 2000)
		})

		log.info('returning promise for onDidChangeTreeData')
		return prom
	}

	dispose() {
		log.info('tdp.dispose()')
		for (let cnt = this.d.length - 1 ; cnt >= 0 ; cnt--) {
			log.info('dispose listener (cnt=' + cnt + ')')
			this.d[cnt].dispose()
		}
	}

	// onDidChangeSelection = ((e: vscode.TreeViewSelectionChangeEvent<WorktreeNode>) => {
	// 	log.info('onDidChangeSelection e=' + JSON.stringify(e.selection))
	// 	if (e.selection.length == 0) {
	// 		log.info('no selection')
	// 		return
	// 	}
	// 	if (e.selection.length > 1) {
	// 		log.info('multiple selections')
	// 		return
	// 	}

	// 	return listener_onDidChangeSelection(e)
	// })
}

export class WorktreeView extends tdp {
	view: vscode.TreeView<WorktreeNode>

	constructor() {
		super()
		this.view = vscode.window.createTreeView('multi-branch-checkout.worktreeView', { treeDataProvider: this, showCollapseAll: true, canSelectMany: true })
		this.view.title = 'Multi Branch Checkout (Worktrees)'
		// this.view.message = '**Multi Branch Checkout**: use this to separate commits into multiple branches more easily'
		// this.view.badge = { tooltip: 'Worktrees', value: 111 }
		// this.view.description = 'this is a description!'
	}

	public async initTreeview() {
		for (let i=nodeMaps.tree.length - 1 ; i >= 0 ; i--) {
			nodeMaps.tree[i].dispose()
		}
		nodeMaps.tree = []

		if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
			console.warn('No workspace folder found')
			return
		}

		const trees = await git.worktree.list()
		if (trees.length == 0) {
			throw new Error('git returned no worktrees')
		}
		if (trees[0].uri.fsPath != vscode.workspace.workspaceFolders[0].uri.fsPath) {
			log.error('worktree path does not match workspace path')
			log.error('    path: ' + trees[0].path)
			log.error('  wsPath: ' + vscode.workspace.workspaceFolders[0].uri.fsPath)
			return
		}
		for (const t of trees) {
			const uri = vscode.Uri.file(t.path)

			let wt = nodeMaps.tree.find((n) => { return n.uri.fsPath === uri.fsPath })
			if (!wt) {
				wt = new WorktreeRoot(uri, t.branch, t.locked ? '🔒' : '🔓')
				if (t.branch != await git.defaultBranch()) {
					await wt.createCommittedFiles()
					await this.refresh(wt)
				}
				log.info('309.1')
			}
			log.info('309.2')
		}
		if (nodeMaps.tree.length == 1) {
			nodeMaps.tree.pop()
		}
	}

	async refresh (node?: WorktreeNode) {
		log.info('refresh node=' + node)
		if (!node) {
			await this.initTreeview()
		}

		if (node instanceof WorktreeRoot) {
			const newNodes = await git.status(node)
			if (newNodes.length == 0) {
				log.info('no new nodes found')
				// return Promise.resolve()
			}
			for (const newNode of newNodes) {
				await this.updateTree(newNode)
			}
		}
		if (node instanceof WorktreeFile) {
			node.getParent().collapsibleState = vscode.TreeItemCollapsibleState.Expanded
		}
		await this.updateTree(node)
		log.info('worktreeView.refresh complete')
	}

	public reveal (nodeOrUri: WorktreeNode | vscode.Uri, options: { select: boolean, focus: boolean }) {
		log.info('WorktreeView.reveal nodeOrUri=' + nodeOrUri)
		let node: WorktreeNode | undefined = undefined
		if (nodeOrUri instanceof vscode.Uri) {
			log.info('nodeOrUri.fsPath=' + nodeOrUri.fsPath)
			const node = nodeMaps.getLastNode(nodeOrUri)
			log.info('node.id=' + node?.id)
		} else {
			node = nodeOrUri
		}
		if (!node) {
			if (nodeOrUri instanceof vscode.Uri) {
				log.error('node not found for uri=' + nodeOrUri.fsPath)
				throw new Error('node not found for uri=' + nodeOrUri.fsPath)
			} else {
				log.error('node not found for node.id=' + nodeOrUri.id)
				throw new Error('node not found for node.id=' + nodeOrUri)
			}
		}
		return this.view.reveal(node, options)
			.then(() => {
				log.info('revealed node.id=' + node.id)
				return
			}, (e: unknown) => {
				log.error('failed to reveal node=' + node.id)
				return
			})
	}

	override dispose() {
		log.info('WorktreeView.dispose()')
		this.view.dispose()
	}

}
