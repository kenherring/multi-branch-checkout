import path, { basename } from 'path'
import * as vscode from 'vscode'
import { log } from './channelLogger'
import { WorktreeNotFoundError } from './errors'
import { git, GitUriOptions } from './gitFunctions'
import { publicDecrypt } from 'crypto'

export class NodeMapper {
    tree: WorktreeRoot[] = []

	getPrimaryRootNode () {
		const nodes = this.tree.filter((n) => n.contextValue == 'WorktreePrimary')
		if (nodes.length == 0) {
			throw new WorktreeNotFoundError('Primary root node not found')
		}
		if (nodes.length > 1) {
			throw new WorktreeNotFoundError('Multiple primary root nodes found')
		}
		return nodes[0]
	}

	getAllNodes() {
		const allNodes: WorktreeNode[] = []

		for (const node of this.tree) {
			allNodes.push(node)
			for (const child of node.children) {
				allNodes.push(child)
				for (const grandchild of child.children) {
					allNodes.push(grandchild)
				}
			}
		}
		log.debug('returning all nodes (allNodes.length=' + allNodes.length + ')')
		return allNodes
	}

	// This isn't super efficient, but it's only used for testing...
    getNodes (uri: vscode.Uri, group?: FileGroup) {
		const allNodes = this.getAllNodes()

		log.info(' - getNodes uri=' + uri?.fsPath + ', group=' + group + 'allNodes.length=' + allNodes.length)
		const nodes = allNodes.filter((n) => { return n.uri.fsPath == uri.fsPath })
		log.info(' - nodes.length=' + nodes.length + ', group=' + group)
		if (group) {
			const ret = nodes?.filter((n) => { return n instanceof WorktreeFile && n.group == group })
			log.info(' - ret.length=' + ret.length)
			return ret
		}
		return nodes
	}

	getNode(uriOrId: vscode.Uri | string, group?: FileGroup) {
		let input: string
		let nodes: WorktreeNode[]
		// by id
		if (typeof uriOrId == 'string') {
			const id = uriOrId
			input = 'id=' + id
			nodes = this.getAllNodes().filter((n) => { return n.id == id })
		} else {
			// by uri
			const uri = uriOrId
			input = 'uri=' + uri.fsPath
			nodes = this.getAllNodes().filter((n) => { return n.uri.fsPath == uri.fsPath })
		}
		if (group) {
			nodes = nodes.filter((n) => { return n instanceof WorktreeFile && n.group == group })
		}

		if (nodes.length == 0) {
			// throw new WorktreeNotFoundError('Node not found for ' + input)
			log.warn('Node not found for ' + input)
			return undefined
		}
		if (nodes.length > 1) {
			// throw new WorktreeNotFoundError('Multiple nodes found for ' + input + ' (count=' + nodes.length + ')')
			log.warn('Multiple nodes found for ' + input + ' (count=' + nodes.length + ')')
			return undefined
		}
		return nodes[0]
	}

	getFileNode(uri: vscode.Uri, group?: FileGroup) {
		const nodes = this.getNodes(uri, group).filter((n) => { return n instanceof WorktreeFile })
		if (nodes.length == 0) {
			throw new WorktreeNotFoundError('File node not found for uri=' + uri.fsPath)
		}
		if (nodes.length > 1) {
			for (const node of nodes) {
				log.info('node.id=' + node.id + ' ' + node.disposed)
			}
			throw new WorktreeNotFoundError('Multiple file nodes found for uri=' + uri.fsPath + ' (count=' + nodes.length + ')')
		}
		return nodes[0]
	}

	getLastNode(uri: vscode.Uri) {
		const nodes = this.getNodes(uri)
		if (nodes && nodes.length > 0) {
			return nodes[nodes.length - 1]
		}
		throw new WorktreeNotFoundError('Node not found for uri=' + uri.fsPath)
	}

	getWorktreeForUri (uri: vscode.Uri) {
		let bestNode: WorktreeNode | undefined = undefined
		const nodes = this.getAllNodes().filter((n) => { return n instanceof WorktreeRoot })
		log.info('nodes.length = ' + nodes.length)

		for (const node of nodes) {
			if (uri.fsPath.startsWith(node.uri.fsPath)) {
				if (!bestNode || bestNode.uri.fsPath.length < node.uri.fsPath.length) {
					bestNode = node
				}
			}
		}
		log.info('bestNode = ' + bestNode)

		if (bestNode) {
			return bestNode.getRepoNode()
		}
		throw new WorktreeNotFoundError('Worktree not found that contains uri=' + uri.fsPath)
	}

}

export const nodeMaps = new NodeMapper()

export enum FileGroup {
    Merge = 'Merge',
	Untracked = 'Untracked',
	Changes = 'Changes',
	Staged = 'Staged',
	Committed = 'Committed',
}

function groupLabel (group: FileGroup) {
	switch (group) {
		case FileGroup.Committed:
			return 'Committed Changes'
		case FileGroup.Staged:
			return 'Staged Changes'
		case FileGroup.Changes:
			return 'Changes'
		case FileGroup.Untracked:
			return 'Untracked Changes'
		case FileGroup.Merge:
			return 'Merge Changes'
	}
	throw new Error('Invalid group: ' + group)
}

export type WorktreeNode = WorktreeRoot | WorktreeFileGroup | WorktreeFile | EmptyFileGroup

// interface IWorktreeNode {
// 	type: string
// 	// children: IWorktreeNode[]
// 	// getParent: () => IWorktreeNode
// 	// toString: () => string
// }

// export class WorktreeNode extends vscode.TreeItem implements IWorktreeNode {
// 	readonly type: string

// 	constructor (type: string, private readonly parent: WorktreeNode, label: string) {
// 		super(label)
// 		this.type = type
// 	}

// 	get children () {
// 		return []
// 	}

// 	override toString () {
// 		return '{"type"="' + this.type + '", "id"="' + this.id + '"'
// 	}

// 	getParent () {
// 		return this.parent
// 	}
// }

// interface IWorktreeNode {
// 	readonly type: string
// 	id?: string | undefined
// 	get children(): WorktreeNode[]
// 	get parent(): WorktreeNode | undefined
// 	removeChild(child: WorktreeNode): void
// }

// export class WorktreeNode extends vscode.TreeItem implements IWorktreeNode {
// 	private _children: WorktreeNode[] = []
// 	private readonly _parent: WorktreeNode | undefined
// 	public disposed: boolean = false

// 	constructor (readonly type: string, parent: WorktreeNode | undefined, public uri: vscode.Uri, id: string | vscode.TreeItemLabel, state?: vscode.TreeItemCollapsibleState) {
// 		super(id, state)
// 		this._parent = parent
// 	}

// 	get parent () {
// 		return this._parent
// 	}

// 	get children () {
// 		return this._children
// 	}

// 	override toString () {
// 		const ret = {
// 			type: this.type,
// 			id: this.id
// 		}
// 		return JSON.stringify(ret)
// 	}

// 	removeChild (child: WorktreeNode) {
// 		this._children = this.children.filter((node) => node.id != child.id)
// 	}

// 	getRepoUri (): WorktreeRoot {
// 		if (!this.parent) {
// 			return this as WorktreeRoot
// 		}
// 		if (this.parent!.type == 'WorktreeRoot') {
// 			return this.parent
// 		}
// 		return this.parent.getRepoUri()
// 	}

// 	dispose () {
// 		this.disposed = true
// 		for (let i=this.children.length - 1; i >= 0; i--) {
// 			const c = this.children[i]
// 			c.dispose()
// 		}
// 		if (this.parent) {
// 			this.parent.removeChild(this)
// 		}
// 	}
// }

export class WorktreeNodeInfo extends vscode.TreeItem implements vscode.Disposable {
	public disposed: boolean = false

	constructor (private readonly type: string, label: string, state?: vscode.TreeItemCollapsibleState) {
		super(label, state)
	}

	override toString () {
		const ret = {
			type: this.type,
			id: this.id,
		}
		return JSON.stringify(ret)
	}

	dispose () {
		log.info('disposing of ' + this)
		this.disposed = true
	}
}

export class WorktreeRoot extends WorktreeNodeInfo {
	private readonly committed: WorktreeFileGroup
	private readonly staged: WorktreeFileGroup
	private readonly changes: WorktreeFileGroup
	private readonly untracked: WorktreeFileGroup
	private readonly merge: WorktreeFileGroup
	private _locked: boolean = false
	public commitRef: string
	public gitUri: vscode.Uri

	constructor(public readonly uri: vscode.Uri, branch: string) {
		super('WorktreeRoot', basename(uri.fsPath), vscode.TreeItemCollapsibleState.Collapsed)
		this.id = uri.fsPath
		this.label = basename(uri.fsPath)

		this.commitRef = 'HEAD'
		this.gitUri = git.toGitUri(this, uri, 'HEAD')

		// this.commitRef = branch
		// this.gitUri = git.toGitUri(this, uri, branch)

		this.setCommitRef(this.commitRef).catch((e) => { log.error('setCommitRef error: ' + e) })

		log.info('id=' + this.id + '; gitUri=' + JSON.stringify(this.gitUri, null, 2))

		this.contextValue = 'WorktreeRoot'
		this.description = branch
		if (vscode.workspace.workspaceFolders && this.uri.fsPath == vscode.workspace.workspaceFolders[0].uri.fsPath) {
			this.iconPath = new vscode.ThemeIcon('root-folder-opened')
			this.contextValue = 'WorktreePrimary'
			this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
		} else {
			this.iconPath = new vscode.ThemeIcon('repo')
		}

		this.committed = new WorktreeFileGroup(this, FileGroup.Committed)
		this.staged = new WorktreeFileGroup(this, FileGroup.Staged)
		this.changes = new WorktreeFileGroup(this, FileGroup.Changes)
		this.untracked = new WorktreeFileGroup(this, FileGroup.Untracked)
		this.merge = new WorktreeFileGroup(this, FileGroup.Merge)
		this.setLocked(this._locked)



		nodeMaps.tree.push(this)
	}

	async setCommitRef(commitRef?: string) {
		log.info('setCommitRef commitRef=' + commitRef + ' contextValue=' + this.contextValue)
		if (!commitRef) {
			commitRef = this.commitRef
		}
		if (!commitRef || commitRef == 'HEAD' ) {
			const revParseRef: string = await git.revParse(this.uri)
			log.info('setCommitRef revParseRef=' + revParseRef)
			if (!revParseRef) {
				log.error('Commit reference not found for ' + this.id + ' (commitRef=' + commitRef + ')')
				throw new Error('Commit reference not found for ' + this.id + ' (commitRef=' + commitRef + ')')
			}
			commitRef = revParseRef
		}
		if (this.commitRef == commitRef) {
			log.info('setCommitRef commitRef=' + commitRef + ' matches existing commitRef=' + this.commitRef)
			return
		}
		this.commitRef = commitRef
		log.info('setCommitRef id= ' + this.id + ' contextValue=' + this.contextValue + ' commitRef=' + commitRef)
		this.gitUri = git.toGitUri(this, this.uri, commitRef)
		log.info('setCommitRef gitUri=' + JSON.stringify(this.gitUri))

		if (this.contextValue != 'WorktreePrimary') {
			log.info('setCommitRef git.revList ' + this.commitRef + ' ' + nodeMaps.getPrimaryRootNode().commitRef)
			const revList = await git.revList(this.commitRef, nodeMaps.getPrimaryRootNode().commitRef)
			log.info('setCommitRef revList=' + revList)
			this.committed.description = ''
			if (revList.ahead > 0) {
				this.committed.description = '+' + revList.ahead
			}
			if (revList.behind > 0) {
				if (this.committed.description.length > 0) {
					this.committed.description += ', '
				}
				this.committed.description = this.committed.description + '-' + revList.behind
			}
			this.committed.description = '[' + this.committed.description + ']'
		}
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

	createCommittedFiles() {

		const workspaceFolderPaths = vscode.workspace.workspaceFolders?.map((wf) => wf.uri.fsPath)
		log.info('createCommittedFiles workspaceFolderPaths=' + workspaceFolderPaths)
		log.info('this.uri.fsPath=' + this.uri.fsPath)
		if (workspaceFolderPaths?.includes(this.uri.fsPath)) {
			log.info('skipping createCommittedFiles for ' + this.uri.fsPath + ' which is a WorkspaceFolder')
			return
		}

		log.info('createCommittedFiles rootUri=' + this.uri.fsPath)
		const primaryRootNode = nodeMaps.getWorktreeForUri(vscode.workspace.workspaceFolders![0].uri)
		log.info('createCommittedFiles primaryRootNode=' + primaryRootNode.label + ' ' + primaryRootNode.uri.fsPath)
		return git.revParse(primaryRootNode.uri)
			.then((primaryRevision: string) => {
				log.info('createCommittedFiles primaryRevision=' + JSON.stringify(primaryRevision))
				if (!primaryRevision) {
					throw new Error('Primary revision not found')
				}
				return git.diff(this.uri, '-z --name-status HEAD', primaryRevision)
			}).then((r: any) => {
				log.info('createCommittedFiles r=' + JSON.stringify(r))
				const diff: string = r.stdout
				log.info('createCommittedFiles diff=' + diff)

				const newFileNodes: WorktreeFile[] = []
				const lines = diff.split('\0')

				while(lines.length > 1) {
					const state = lines.shift()
					const relativeFile = lines.shift()
					if (!state) {
						log.warn('state not found in diff!')
						continue
					}
					if (!relativeFile) {
						log.warn('relativeFile not found in diff!')
						continue
					}
					const uri = vscode.Uri.file(this.uri.fsPath + '/' + relativeFile)
					newFileNodes.push(new WorktreeFile(uri, this.committed, state))
				}
				log.info('createCommittedFiles newFileNodes.length=' + newFileNodes.length)
			})
	}

	removeChild (child: WorktreeFileGroup | EmptyFileGroup) {
		// do nothing??


		// log.info('WorktreeRoot.removeChild ' + child.label + ' ' + this.children.length)
		// const idx = this.children.findIndex((node) => node.id = child.id)
		// if (idx == 0 && this.children.length == 1) {
		// 	log.info('this.children.length=' + this.children.length)
		// 	this.children.unshift(new EmptyFileGroup(this))
		// 	log.info('this.children.length=' + this.children.length)
		// 	this.children.pop()
		// 	log.info('this.children.length=' + this.children.length)
		// 	log.info('this.children[0].id=' + this.children[0].id)
		// 	// this.children.push(new EmptyFileGroup(this))
		// 	log.info('pushed empty group')
		// } else {
		// 	this.children.splice(idx, 1)
		// }
		// log.info('this.children.length='  + this.children.length + ' ' + this.children[0].id)
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

	getRepoNode () {
		return this
	}

	setLocked (isLocked = true) {
		if (this.contextValue == 'WorktreePrimary') {
			return
		}
		if (this._locked == isLocked) {
			return
		}
		this._locked = isLocked
		this.contextValue = 'WorktreeRoot' + (isLocked ? 'Locked' : 'Unlocked')
		const action = isLocked ? 'lock' : 'unlock'
		const emoji = isLocked ? '🔒' : '🔓'
		log.info('worktree ' + this.label + ' is now ' + action + 'ed ' + emoji + ' ' + this.uri.fsPath)
	}

	get locked () {
		return this._locked
	}

	override dispose () {
		this.committed.dispose()
		this.staged.dispose()
		this.changes.dispose()
		this.untracked.dispose()
		this.merge.dispose()

		nodeMaps.tree.splice(nodeMaps.tree.findIndex((n) => n.id == this.id), 1)
		super.dispose()
	}

}

export class EmptyFileGroup extends WorktreeNodeInfo {
	public readonly uri: vscode.Uri
	public readonly children: WorktreeNode[] = []
	constructor (private readonly parent: WorktreeRoot) {
		super('EmptyFileGroup', '')
		this.uri = parent.uri
		this.description = 'No modified files detected'
		this.collapsibleState = vscode.TreeItemCollapsibleState.None
		this.id = parent.id + '#empty'
		this.contextValue = 'WorktreeFileGroup#Empty'
	}

	getParent () {
		return this.parent
	}

	getRepoUri () {
		return this.parent.uri
	}

	getRepoNode () {
		return this.parent
	}

	removeChild () {
		// do nothing, no children to remove
	}

	override dispose () {
		this.parent.removeChild(this)
		super.dispose()
	}
}

export class WorktreeFileGroup extends WorktreeNodeInfo {
	private _children: WorktreeNode[] = []
	public uri: vscode.Uri

	constructor(private readonly parent: WorktreeRoot, public readonly group: FileGroup) {
		super('WorktreeFileGroup', groupLabel(group), vscode.TreeItemCollapsibleState.Collapsed)
		this.uri = parent.uri.with({scheme: 'WorktreeNode', query: this.group})
		this.id = this.parent.id + '#' + group
		this.contextValue = 'WorktreeFileGroup#' + group
		if (this.parent.contextValue == 'WorktreePrimary') {
			this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
		}
	}

	get children () {
		return this._children.sort((a, b) => {
			if (a.description == b.description) {
				return a.label! > b.label! ? 1 : -1
			}
			return (a.description ?? '') > (b.description ?? '') ? 1 : -1
		})
			// if (a instanceof WorktreeFile && b instanceof WorktreeFile) {
			// 	return a.relativePath > b.relativePath ? 1 : -1
			// }
			// // should never get here, but just in case we could compare the label as a backup
			// return a.label! > b.label! ? 1 : -1 })
	}

	getParent () {
		return this.parent
	}

	getRepoNode () {
		return this.getParent()
	}

	getRepoUri () {
		return this.getParent().uri
	}

	removeChild (child: WorktreeFile) {
		this._children = this._children.filter((node) => node.uri.fsPath != child.uri.fsPath)
	}

	public toJSON(): string {
		const {
			parent: _p,
			...props } = this
		return JSON.stringify(props)
	}

	override dispose () {
		for (let i=this._children.length - 1; i >= 0; i--) {
			const c = this._children[i] as WorktreeFile
			c.dispose()
		}
		this.parent.removeChild(this)
		super.dispose()
	}
}

export class WorktreeFile extends WorktreeNodeInfo implements vscode.Disposable {
	// public children: WorktreeNode[] = []
	public children: WorktreeNode[] = []
	public state: string | undefined = undefined
	public relativePath: string
	public readonly gitUri: vscode.Uri

	constructor(public readonly uri: vscode.Uri, private readonly parent: WorktreeFileGroup, state: string) {
		super('WorktreeFile', basename(parent.uri.fsPath), vscode.TreeItemCollapsibleState.None)

		this.relativePath = path.relative(parent.uri.fsPath, uri.fsPath)

		// this.relativePath = this.uri.path.replace(this.parent.getRepoUri().path, '').substring(1)

		if (parent.group == FileGroup.Staged) {
			this.gitUri = git.toGitUri(this.getRepoNode(), this.uri, '~')
			if (this.getRepoNode().contextValue != 'WorktreePrimary') {
				// const diffUri = this.uri.with({path: this.uri.path + '.diff'})
				this.gitUri = git.toGitUri(this.getRepoNode(), this.uri, '~')
			}

		} else if (parent.group == FileGroup.Committed) {
			const primaryRootNode = nodeMaps.getPrimaryRootNode()
			const refUri = vscode.Uri.joinPath(primaryRootNode.uri, this.relativePath)



			this.gitUri = git.toGitUri(nodeMaps.getPrimaryRootNode(), refUri, this.getRepoNode().commitRef)

			const params: GitUriOptions = JSON.parse(this.gitUri.query)
			params.replaceFileExtension = true
			// params.submoduleOf = '.worktrees/' + this.getRepoNode().label?.toString()

			// this.gitUri = this.gitUri.with({scheme: 'WorktreeFile', query: JSON.stringify(params)})
			this.gitUri = this.gitUri.with({query: JSON.stringify(params)})
		} else {
			this.gitUri = this.uri
		}

		this.label = basename(this.uri.fsPath)
		this.id = this.uri.fsPath + '#' + parent.group
		// this.id2 = vscode.Uri.from({authority: 'multi-branch-checkout', scheme: 'WorktreeFile', path: this.uri.path, query: this.group }).toString()
		log.info('id2=' + vscode.Uri.from({
				authority: 'multi-branch-checkout',
				scheme: 'WorktreeFile',
				path: this.uri.path,
				query: this.group,
				fragment: this.getRepoNode().label!.toString()
			}).toString())
		this.contextValue = 'WorktreeFileNode#' + parent.group
		this.tooltip = this.uri.fsPath
		this.state = state

		if (this.state == 'D') {
			this.label = '~~~' + this.label + '~~~'
		}

		const wt = this.parent.getParent()
		if (wt?.uri) {
			this.description = this.uri.fsPath
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
		this.parent.children.push(this)

		this.command = {
			title: 'multi-branch-checkout.selectFileNode',
			command: 'multi-branch-checkout.selectFileNode',
			arguments: [this.id],
		}
	}

	getParent () {
		return this.parent
	}

	get group () { return this.parent.group }

	get diffLabel () {
		if (this.group == FileGroup.Committed) {
			// TODO: should use the git configured length
			return this.getRepoNode().commitRef.substring(0,5) + ':' + this.label
		} else if (this.getRepoNode().contextValue != 'WorktreePrimary') {
			return this.getRepoNode().label + ':' + this.label
		}
		return this.label
	}

	getRepoUri () {
		const grandparent = this.getRepoNode()
		if (grandparent?.uri) {
			return grandparent.uri
		}
		throw new WorktreeNotFoundError('Worktree root directory not found for ' + this.id + ' (label=' + this.label + '; uri=' + this.uri?.fsPath + ')')
	}

	getRepoNode () {
		const grandparent = this.parent.getParent()
		if (grandparent) {
			return grandparent
		}
		throw new WorktreeNotFoundError('Worktree root directory not found for ' + this.id + ' (label=' + this.label + '; uri=' + this.uri?.fsPath + ')')
	}

	removeChild () {
		// do nothing, files have no children
	}

	public toJSON(): string { // NOSONAR
		const {
			parent: _p,
			...props } = this
		return JSON.stringify(props)
	}

	override dispose() {
		this.parent.removeChild(this)
		super.dispose()
	}
}
