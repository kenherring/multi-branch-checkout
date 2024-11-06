import * as vscode from 'vscode'
import { basename } from 'path'
import { Uri } from 'vscode'
import { getMergeBaseGitUri, getStatus, git_toGitUri } from './gitFunctions'
import { log } from './channelLogger'
import { API } from './api/git';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const gitcli = require('@npmcli/git')

export type WorktreeNode = WorktreeRoot | WorktreeFileGroup | WorktreeFile | EmptyFileGroup
const parents = new Map<string, WorktreeNode>()
const tree: WorktreeRoot[] = []
const fileMap = new Map<string, WorktreeNode[]>()

export enum FileGroup {
	Merge = 'Merge',
	Untracked = 'Untracked',
	Changes = 'Changes',
	Staged = 'Staged',
	Committed = 'Committed',
}

export class WorktreeRoot extends vscode.TreeItem {
	private committed: WorktreeFileGroup
	private staged: WorktreeFileGroup
	private changes: WorktreeFileGroup
	private untracked: WorktreeFileGroup
	private merge: WorktreeFileGroup
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
		this.merge = new WorktreeFileGroup(this, FileGroup.Merge)
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

	removeChild () {
		log.warn('WorktreeRoot.removeChild not yet implemented')
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
			case FileGroup.Merge:
				return this.merge
		}
	}

	getRepoUri () {
		return this.uri
	}

	setLocked (isLocked = true) {
		if (this.contextValue == 'WorktreeRootPrimary') {
			return Promise.resolve()
		}
		this._locked = isLocked
		this.contextValue = 'WorktreeRoot' + (isLocked ? 'Locked' : 'Unlocked')
		const action = isLocked ? 'lock' : 'unlock'
		const emoji = isLocked ? '🔒' : '🔓'

		return gitcli.spawn(['worktree', action, this.uri.fsPath], { cwd: this.uri.fsPath })
			.then(() => {
				log.info('successfully ' + action + 'ed ' + emoji + ' worktree: ' + this.uri.fsPath)
			}, (e: any) => {
				let errText = 'Failed to ' + action + ' worktree: ' + e
				if (e.stderr) {
					errText = 'Failed to ' + action + ' ' + emoji + ' worktree: ' + e.stderr
					return
				}
				log.error(errText)
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

	removeChild () {}
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

	removeChild (child: WorktreeFile) {
		const idx = this.children.findIndex((node) => node.id = child.id)
		this.children.splice(idx, 1)
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
		// log.info('filemap.set uri=' + uri.fsPath + '; id=' + this.id)
		const map = fileMap.get(this.id)
		if (map) {
			map.push(this)
			fileMap.set(this.resourceUri.fsPath, map)
		} else {
			fileMap.set(this.resourceUri.fsPath, [ this ])
		}
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

	getFileGroup () {
		const n = this.getParent()
		if (n instanceof WorktreeFileGroup) {
			return n.group()
		}
		throw new Error('Failed to get file group for ' + this.id)
	}

	removeChild () {}
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

	const trees: string[] = await gitcli.spawn(['worktree', 'list', '--porcelain', '-z'], {cwd: vscode.workspace.workspaceFolders[0].uri.fsPath })
		.then((r: any) => {
			const stdout = r.stdout as string
			const trees = stdout.split('\0\0')
			return trees
		}, (e: any) => {
			log.error('e=' + JSON.stringify(e,null,2))
			throw e
		})

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

// async function gatherWorktreeFiles (wt: WorktreeRoot, documentUri?: vscode.Uri) {
// 	if (!wt.uri) {
// 		return Promise.resolve()
// 	}

// 	log.info('git status --porcelain -z (in ' + wt.uri.fsPath + ')')
// 	const args = ['status', '--porcelain', '-z']
// 	if (documentUri) {
// 		args.push(documentUri.fsPath)
// 	}
// 	const p = await git.spawn(args, {cwd: wt.uri.fsPath})
// 		.then((r: any) => {
// 			const responses = r.stdout.split('\0')

// 			for (let i = 0; i < responses.length; i++) {
// 				let response = responses[i]
// 				if (i == 0 && response.substring(2,3) != ' ') {
// 					response = ' ' + response
// 				}
// 				const stagedState = response.substring(0, 1).trim()
// 				const unstagedState = response.substring(1, 2).trim()
// 				const file = response.substring(3)
// 				if (file == '') {
// 					continue
// 				}

// 				if (stagedState != '?' && stagedState != '') {
// 					const c = new WorktreeFile(vscode.Uri.joinPath(wt.uri, file), wt.getFileGroupNode(FileGroup.Staged), stagedState)
// 				}
// 				if (unstagedState != '') {
// 					let group = FileGroup.Changes
// 					if (unstagedState == 'A' || unstagedState == '?') {
// 						group = FileGroup.Untracked
// 					}
// 					const c = new WorktreeFile(vscode.Uri.joinPath(wt.uri, file), wt.getFileGroupNode(group), unstagedState)
// 				}
// 			}
// 			return true
// 		}, (e: any) => {
// 			log.error('uri=' + wt.uri.fsPath + '; e=' + JSON.stringify(e,null,2))
// 			throw e
// 		})
// 	log.info('end gatherWorktreeFiles (p=' + p + ')')
// 	return p
// }

export function validateUri (node: WorktreeNode) {
	if (!node.uri) {
		throw new Error('Failed to unstage file - filepath not set (uri=' + node.uri + ')')
	}
	return true
}

async function command_deleteWorktree (rootNode: WorktreeRoot) {
	if (rootNode.locked) {
		await vscode.window.showWarningMessage('Worktree is locked and cannot be deleted')
	}

	// get count of files in the worktree
	let count = 0
	log.info('command_deleteWorktree rootNode=' + rootNode.id + ' ' + rootNode.children.length)
	for (const child of rootNode.children) {
		count += child.children.length
	}

	if (count > 0) {
		const proceed = await vscode.window.showWarningMessage('Worktree has modified files which have not been committed.  Delete anyway?', 'Yes', 'No')
			.then((r: 'Yes' | 'No' | undefined) => {
				if (r == "No") {
					log.info('User opted not to delete worktree with modified files')
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
	log.info('removing worktree ' + rootNode.id)
	return await gitcli.spawn(['worktree', 'remove', rootNode.uri.fsPath], { cwd: vscode.workspace.workspaceFolders![0].uri.fsPath })
		.then((r: any) => {
			log.info('Worktree removed successfully: ' + rootNode.uri.fsPath)
			vscode.window.showInformationMessage('Worktree removed successfully: ' + rootNode.uri.fsPath)
		}, (e: any) => {
			log.error('e=' + JSON.stringify(e, null, 2))
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

function getNode (uri: vscode.Uri, group?: FileGroup) {
	log.info('fileMap.get uri=' + uri.fsPath)
	const nodes = fileMap.get(uri.fsPath)
	if (group) {
		return nodes?.filter((n) => { return n instanceof WorktreeFile && n.getFileGroup() == group })
	}
	return nodes
}

export class WorktreeView {
	view: vscode.TreeView<WorktreeNode>
	// _onDidChangeTreeData = new vscode.EventEmitter();
	tdp = new tdp()

	constructor(context: vscode.ExtensionContext) {``

		this.view = vscode.window.createTreeView('multi-branch-checkout.worktreeView', { treeDataProvider: this.tdp, showCollapseAll: true, canSelectMany: true })
		// this.view.badge = { tooltip: 'Worktrees', value: 111 }
		this.view.badge = undefined
		this.view.title = 'Multi Branch Checkout (Worktrees)'
		this.view.message = '**Multi Branch Checkout**: use this to separate commits into multiple branches more easily'
		this.view.description = 'this is a description!'
		context.subscriptions.push(this.view)

		// ********** WorktreeView Commands ********** //
		vscode.commands.registerCommand('multi-branch-checkout.refresh', () => { return this.refresh() })

		// ********** WorktreeRoot Commands ********** //
		vscode.commands.registerCommand('multi-branch-checkout.deleteWorktree', (node: WorktreeRoot) => {
			return command_deleteWorktree(node)
				.then(() => { return this.refresh() })
		})
		vscode.commands.registerCommand('multi-branch-checkout.launchWindowForWorktree', (node: WorktreeRoot) => {
			return command_launchWindowForWorktree(node)
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

		// vscode.window.registerFileDecorationProvider(new TreeItemDecorationProvider())

		this.view.onDidChangeSelection (async (e: vscode.TreeViewSelectionChangeEvent<WorktreeNode>) => listener_onDidChangeSelection(e))

		this.refresh().then(() => log.info('extension activated!'))
	}

	getNode(uri: vscode.Uri) {
		const nodes = getNode(uri)
		if (nodes && nodes.length > 0) {
			return nodes[nodes.length - 1]
		}
		throw new WorktreeNotFoundError('Node not found for uri=' + uri.fsPath)
	}

	getWorktreeForUri (uri: vscode.Uri) {
		for (const node of tree) {
			if (uri.fsPath.startsWith(node.uri.fsPath)) {
				return node
			}
		}
		throw new WorktreeNotFoundError('Worktree not found that contains uri=' + uri.fsPath)
	}

	refresh (uriOrNode?: vscode.Uri | WorktreeNode) {
		let uri: vscode.Uri | undefined
		if (uriOrNode instanceof WorktreeFile || uriOrNode instanceof WorktreeFileGroup || uriOrNode instanceof WorktreeRoot) {
			uri = uriOrNode.uri
		} else if (uriOrNode instanceof Uri) {
			uri = uriOrNode
		}

		if (uri && tree.length > 0) {
			//update doc only
			const map = fileMap.get(uri.fsPath)
			if (map) {
				for (const node of map) {
					if (node instanceof WorktreeFile) {
						node.getParent()?.removeChild(node)
					}
				}
			}
			const wt = this.getWorktreeForUri(uri)
			getStatus(wt)
			// gatherWorktreeFiles(wt, uri)
		}
		return initWorktree()
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
		return tree
	}

	public reveal (nodeOrUri: WorktreeNode | Uri, options: { select: boolean, focus: boolean }) {
		let node: WorktreeNode | undefined = undefined
		if (nodeOrUri instanceof Uri) {
			log.info('nodeOrUri.fsPath=' + nodeOrUri.fsPath)
			const nodes = getNode(nodeOrUri)
			if (nodes && nodes.length > 0) {
				node = nodes[nodes.length -1]
			}
			log.info('node.id=' + node?.id)
			if (!node) {
				log.error('node not found for uri=' + nodeOrUri.fsPath)
				throw new Error('node not found for uri=' + nodeOrUri.fsPath)
			}
		} else {
			node = nodeOrUri
		}
		return this.view.reveal(node, options)
			.then(() => {
				log.info('revealed node.id=' + node.id)
			}, (e: unknown) => {
				log.error('failed to reveal node.id=' + node.id + ' (e=' + e + ')')
				throw e
			})
	}
}
