import * as vscode from 'vscode'
import { getMergeBaseGitUri, getStatus, git_toGitUri } from './gitFunctions'
import { log } from './channelLogger'
import { FileGroup, nodeMaps, WorktreeFile, WorktreeFileGroup, WorktreeNode, WorktreeRoot } from './worktreeNodes'
import { command_getWorktrees, MultiBranchCheckoutAPI } from './commands'

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
			return nodeMaps.tree
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



	let compareUri = await getMergeBaseGitUri(selectedFiles[0])
	let selectedUri = git_toGitUri(selectedFiles[0].uri)
	let versusText = '???'
	if (selectedFiles[0].getFileGroup() == FileGroup.Untracked) {
		compareUri = git_toGitUri(selectedFiles[0].uri, 'HEAD')
		selectedUri = selectedFiles[0].uri
	} else if (selectedFiles[0].getFileGroup() == FileGroup.Changes) {
		// compareUri = git_toGitUri(selectedFiles[0].uri, 'HEAD')
		// compareUri = git_toGitUri(selectedFiles[0].uri, '~')
		compareUri = git_toGitUri(selectedFiles[0].uri, '~')
		selectedUri = selectedFiles[0].uri
		versusText = 'STAGED vs CHANGES'
	} else if (selectedFiles[0].getFileGroup() == FileGroup.Staged) {
		compareUri = git_toGitUri(selectedFiles[0].uri, 'HEAD')
		selectedUri = git_toGitUri(selectedFiles[0].uri, '~')
		versusText = 'HEAD vs STAGED'
	}
	log.info('compareUri=' + compareUri)
	log.info('selectedUri=' + selectedUri)
	log.info('selectedFiles[0]=' + selectedFiles[0].uri.fsPath)
	const title = '[Worktree: ' + selectedFiles[0].getRepoNode().label + '] ' + selectedFiles[0].relativePath + ' (' + versusText + ')'
	// repo.get(selectedFiles[0].uri, compareUri, title)
	await vscode.commands.executeCommand('vscode.diff', compareUri, selectedUri, title)
	return
}

export class WorktreeView {
	view: vscode.TreeView<WorktreeNode>
	tdp = new tdp()

	constructor(private api: MultiBranchCheckoutAPI) {

		this.view = vscode.window.createTreeView('multi-branch-checkout.worktreeView', { treeDataProvider: this.tdp, showCollapseAll: true, canSelectMany: true })
		// this.view.badge = { tooltip: 'Worktrees', value: 111 }
		this.view.badge = undefined
		this.view.title = 'Multi Branch Checkout (Worktrees)'
		this.view.message = '**Multi Branch Checkout**: use this to separate commits into multiple branches more easily'
		this.view.description = 'this is a description!'
		// vscode.window.registerFileDecorationProvider(new TreeItemDecorationProvider())

		this.view.onDidChangeSelection (async (e: vscode.TreeViewSelectionChangeEvent<WorktreeNode>) => listener_onDidChangeSelection(e))

		this.refresh().then(() => log.info('extension activated!'))
	}

	private async initTreeview() {
		nodeMaps.emptyTree(nodeMaps.tree)

		if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
			console.warn('No workspace folder found')
			return
		}

		const trees = await this.api.getWorktrees()
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

			const worktree = vscode.workspace.asRelativePath(worktreePath)
			// const commit = lines[1].split(' ');
			const wt = new WorktreeRoot(uri, branch)
			wt.setLocked(locked)
			await getStatus(wt)
		}
	}


	refresh (uriOrNode?: vscode.Uri | WorktreeNode) {
		let uri: vscode.Uri | undefined
		if (uriOrNode instanceof WorktreeFile || uriOrNode instanceof WorktreeFileGroup || uriOrNode instanceof WorktreeRoot) {
			uri = uriOrNode.uri
		} else if (uriOrNode instanceof vscode.Uri) {
			uri = uriOrNode
		}

		if (uri && nodeMaps.tree.length > 0) {
			//update doc only
			const map = nodeMaps.fileMap.get(uri.fsPath)
			if (map) {
				for (const node of map) {
					if (node instanceof WorktreeFile) {
						node.getParent()?.removeChild(node)
					}
				}
			}
			const wt = nodeMaps.getWorktreeForUri(uri)
			getStatus(wt)
			// gatherWorktreeFiles(wt, uri)
		}
		return this.initTreeview()
			.then(() => {
				return this.tdp.updateTree()
			}).then(() => {
				log.info('init and refresh complete')
			}, (e) => {
				log.error('failed to init worktree view, attempting to display anyway (e=' + e + ')')
				this.tdp.updateTree()
				throw e
			})
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
