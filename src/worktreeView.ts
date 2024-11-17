import * as vscode from 'vscode'
import { git } from './gitFunctions'
import { log } from './channelLogger'
import { nodeMaps, WorktreeFile, WorktreeNode, WorktreeRoot } from './worktreeNodes'
import { api } from './extension'

let awaitingDidChangeTreeData = false

class tdp implements vscode.TreeDataProvider<WorktreeNode> {
	private _onDidChangeTreeData: vscode.EventEmitter<WorktreeNode| WorktreeNode[] | undefined | null | void> // NOSONAR

	constructor() {
		this._onDidChangeTreeData = new vscode.EventEmitter<WorktreeNode | WorktreeNode[] | undefined | null | void>()
	}

	get onDidChangeTreeData() {
		awaitingDidChangeTreeData = false
		return this._onDidChangeTreeData.event
	}

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
		awaitingDidChangeTreeData = true
		return this._onDidChangeTreeData.fire(node)
	}

	async awaitingDidChangeTreeData () {
		while (!awaitingDidChangeTreeData) {
			await new Promise((resolve) => setTimeout(resolve, 100))
		}
	}
}

async function listener_onDidChangeSelection (e: vscode.TreeViewSelectionChangeEvent<WorktreeNode>) {
	log.info('onDidChangeSelection')
	const selectedFiles = e.selection.filter((node) => { return node instanceof WorktreeFile })
	log.info('selectedFiles.length=' + selectedFiles.length)
	if (selectedFiles.length == 0) {
		return
	}
	if (selectedFiles.length > 1) {
		return
	}
	log.info('selectedFiles[0].uri=' + selectedFiles[0].uri)
	if (!selectedFiles[0].uri) {
		log.info('selected node uri not found: ' + selectedFiles[0].id)
		return
	}
	if (! (selectedFiles[0] instanceof WorktreeFile)) {
		// @ts-expect-error - this is valid, ts is ignoring the ! check
		console.warning('selected file is not a WorktreeFile (uri=' + selectedFiles[0].id + ')')
		return
	}

	// let compareUri = await getMergeBaseGitUri(selectedFiles[0])
	// if (selectedFiles[0].getFileGroup() == FileGroup.Untracked) {
	// 	// if also staged, compare to staged instead of head
	// 	const stagedUri = getNode(selectedFiles[0].uri, FileGroup.Staged)
	// 	if (stagedUri && stagedUri.length > 0 && stagedUri[0].uri) {
	// 		compareUri = git_toGitUri(stagedUri[0].uri)
	// 	}
	// }


	// let compareUri = await git.getMergeBaseGitUri(selectedFiles[0])
	// let selectedUri = git.toGitUri(selectedFiles[0].uri)
	// let versusText = '???'
	// if (selectedFiles[0].getFileGroup() == FileGroup.Untracked) {
	// 	compareUri = git.toGitUri(selectedFiles[0].uri, 'HEAD')
	// 	selectedUri = selectedFiles[0].uri
	// } else if (selectedFiles[0].getFileGroup() == FileGroup.Changes) {
	// 	// compareUri = git_toGitUri(selectedFiles[0].uri, 'HEAD')
	// 	// compareUri = git_toGitUri(selectedFiles[0].uri, '~')
	// 	compareUri = git.toGitUri(selectedFiles[0].uri, '~')
	// 	selectedUri = selectedFiles[0].uri
	// 	versusText = 'STAGED vs CHANGES'
	// } else if (selectedFiles[0].getFileGroup() == FileGroup.Staged) {
	// 	compareUri = git.toGitUri(selectedFiles[0].uri, 'HEAD')
	// 	selectedUri = git.toGitUri(selectedFiles[0].uri, '~')
	// 	versusText = 'HEAD vs STAGED'
	// }
	// log.info('compareUri=' + compareUri)
	// log.info('selectedUri=' + selectedUri)
	// log.info('selectedFiles[0]=' + selectedFiles[0].uri.fsPath)
	// const title = '[Worktree: ' + selectedFiles[0].getRepoNode().label + '] ' + selectedFiles[0].relativePath + ' (' + versusText + ')'
	// // repo.get(selectedFiles[0].uri, compareUri, title)
	// await vscode.commands.executeCommand('vscode.diff', compareUri, selectedUri, title)
	// return
}

export class WorktreeView extends tdp {
	view: vscode.TreeView<WorktreeNode>

	constructor() {
		super()
		this.view = vscode.window.createTreeView('multi-branch-checkout.worktreeView', { treeDataProvider: this, showCollapseAll: true, canSelectMany: true })
		// this.view.badge = { tooltip: 'Worktrees', value: 111 }
		this.view.badge = undefined
		this.view.title = 'Multi Branch Checkout (Worktrees)'
		this.view.message = '**Multi Branch Checkout**: use this to separate commits into multiple branches more easily'
		this.view.description = 'this is a description!'
		// vscode.window.registerFileDecorationProvider(new TreeItemDecorationProvider())

		this.view.onDidChangeSelection (async (e: vscode.TreeViewSelectionChangeEvent<WorktreeNode>) => listener_onDidChangeSelection(e))
	}

	public activateTreeview () {
		return this.initTreeview()
			.then(() => { return this.updateTree() })
			.then(() => { return this.awaitingDidChangeTreeData() })
			.then(() => {
				log.info('init and refresh complete')
			})
	}

	public async initTreeview() {
		for (let i=nodeMaps.tree.length - 1 ; i >= 0 ; i--) {
			nodeMaps.tree[i].dispose()
		}
		nodeMaps.tree = []
		// nodeMaps.allNodes = []

		if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
			console.warn('No workspace folder found')
			return
		}

		const trees = await api.getWorktrees()
		for (const t of trees) {
			if (t == '') {
				continue
			}
			const lines = t.trim().split('\0')

			if (lines.length < 3) {
				log.error('Invalid worktree=' + t)
				continue
			}

			const worktreePath = lines[0].split(' ')[1]
			const branch = lines[2].split(' ')[1]
			const locked = lines[3] === 'locked'

			const uri = vscode.Uri.file(worktreePath)

			// const worktree = vscode.workspace.asRelativePath(worktreePath)
			// const commit = lines[1].split(' ');
			let wt = nodeMaps.tree.find((n) => { return n.uri.fsPath === uri.fsPath })
			if (!wt) {
				wt = new WorktreeRoot(uri, branch)
			}
			wt.setLocked(locked)
			await git.status(wt)
		}
	}

	async refresh (node?: WorktreeNode) {
		if (!node) {
			await this.initTreeview()
		}
		if (node instanceof WorktreeRoot) {
			await git.status(node)
		}
		if (node instanceof WorktreeFile) {
			node.getParent().collapsibleState = vscode.TreeItemCollapsibleState.Expanded
		}
		this.updateTree(node)
		await this.awaitingDidChangeTreeData()
	}

	public getRootNodes() {
		return nodeMaps.tree
	}

	public reveal (nodeOrUri: WorktreeNode | vscode.Uri, options: { select: boolean, focus: boolean }) {
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
			}, (e: unknown) => {
				log.error('failed to reveal node.id=' + node.id + ' (e=' + e + ')')
				throw e
			})
	}

	dispose() {
		this.view.dispose()
	}
}
