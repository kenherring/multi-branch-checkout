import path, { basename } from 'path'
import * as vscode from 'vscode'
import { log } from './channelLogger'
import { WorktreeNotFoundError } from './errors'
import { git } from './gitFunctions'
import { dirExists, validateUri } from './utils'

export class NodeMapper {
    tree: WorktreeRoot[] = []

	getPrimaryRootNode () {
		log.info('400 this.tree.length=' + this.tree.length)
		const nodes = this.tree.filter((n) => { return n.isPrimary() })

		log.info('401 nodes.length=' + nodes.length)
		if (nodes.length == 0) {
			log.info('402 nodes.length=' + nodes.length)
			throw new WorktreeNotFoundError('Primary root node not found')
		}
		if (nodes.length > 1) {
			log.info('403 nodes.length=' + nodes.length)
			throw new WorktreeNotFoundError('Multiple primary root nodes found')
		}
		log.info('404 nodes.length=' + nodes.length)
		return nodes[0]
	}

	getAllNodes() {
		const allNodes: WorktreeNode[] = []

		for (const node of this.tree) {
			allNodes.push(node)
			log.info('node.id=' + node.id)
			for (const child of node.children) {
				allNodes.push(child)
				log.info('  child.id=' + child.id)
				for (const grandchild of child.children) {
					allNodes.push(grandchild)
					log.info('    grandchild.id=' + grandchild.id)
				}
			}
		}
		log.debug('returning all nodes (allNodes.length=' + allNodes.length + ')')
		return allNodes
	}

	// This isn't super efficient, but it's only used for testing...
    getNodes (uri: vscode.Uri, group?: FileGroup) {
		log.info('[getNodes] uri=' + uri.fsPath + ', group=' + group)
		const allNodes = this.getAllNodes()

		log.info(' - getNodes allNodes.length=' + allNodes.length + ', uri=' + uri?.fsPath + ', group=' + group + ', allNodes.length=' + allNodes.length)
		for (const node of allNodes) {
			log.info('    node.id=' + node.id)
		}
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
			log.info('node.uri=' + node.uri.fsPath + ' ' + node.children.length)
			if (uri.fsPath.startsWith(node.uri.fsPath)) {
				log.info('  child.uri=' + node.uri.fsPath + ' ' + node.children.length)
				if (!bestNode || bestNode.uri.fsPath.length < node.uri.fsPath.length) {
					log.info('    bestNode=' + node.uri.fsPath)
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
	private readonly _parent: WorktreeNode | undefined

	constructor (public readonly type: string, id: string, public readonly uri: vscode.Uri, parent: WorktreeNode | undefined, label: string, state?: vscode.TreeItemCollapsibleState) {
		super(label, state)
		this.id = id
		this._parent = parent
	}

	getLabel () {
		if (typeof this.label == 'string') {
			return this.label
		}
		if (!this.label) {
			throw new Error('Label not found for ' + this.id)
		}
		return this.label.label
	}

	override toString () {
		const ret = {
			type: this.type,
			id: this.id,
			contextValue: this.contextValue,
		}
		return JSON.stringify(ret)
	}

	dispose () {
		log.debug('disposing of ' + this)
		this.disposed = true
	}
}

export class WorktreeRoot extends WorktreeNodeInfo {
	private readonly committed: WorktreeFileGroup
	private readonly staged: WorktreeFileGroup
	private readonly changes: WorktreeFileGroup
	private readonly untracked: WorktreeFileGroup
	private readonly merge: WorktreeFileGroup
	private readonly empty: EmptyFileGroup
	private _locked: '🔒' | '🔓'
	private _primary: boolean = false
	public pathExists: boolean = true
	public commitRef: string
	public gitUri: vscode.Uri

	constructor(uri: vscode.Uri, branch: string, locked: '🔒' | '🔓') {
		super('WorktreeRoot', uri.fsPath, uri, undefined, basename(uri.fsPath), vscode.TreeItemCollapsibleState.Collapsed)

		this.commitRef = 'HEAD'
		this.gitUri = git.toGitUri(this, uri, 'HEAD')

		this.description = branch
		if (vscode.workspace.workspaceFolders && this.uri.fsPath == vscode.workspace.workspaceFolders[0].uri.fsPath) {
			this.iconPath = new vscode.ThemeIcon('root-folder-opened')
			this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
			this._primary = true
		} else {
			this.iconPath = new vscode.ThemeIcon('repo')
		}

		if (!dirExists(uri)) {
			this.description = 'Invalid path'
			this.pathExists = false
			this.resourceUri = uri
			this.collapsibleState = vscode.TreeItemCollapsibleState.None
		}

		this.committed = new WorktreeFileGroup(this, FileGroup.Committed)
		this.staged = new WorktreeFileGroup(this, FileGroup.Staged)
		this.changes = new WorktreeFileGroup(this, FileGroup.Changes)
		this.untracked = new WorktreeFileGroup(this, FileGroup.Untracked)
		this.merge = new WorktreeFileGroup(this, FileGroup.Merge)
		this.empty = new EmptyFileGroup(this)
		this._locked = '🔓'


		this.setLocked(locked)
		this._setContextValue()
		nodeMaps.tree.push(this)
	}

	isPrimary() {
		return this._primary
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
		log.info('setCommitRef id= ' + this.id + ' commitRef=' + commitRef)
		this.gitUri = git.toGitUri(this, this.uri, commitRef)
		log.info('setCommitRef gitUri=' + JSON.stringify(this.gitUri))

		if (!this.isPrimary()) {
			log.info('setCommitRef git.revList ' + this.commitRef + ' ' + nodeMaps.getPrimaryRootNode().commitRef)
			const revList = await git.revList(this.commitRef, nodeMaps.getPrimaryRootNode().commitRef)
			log.info('setCommitRef revList=' + JSON.stringify(revList))
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
		if (!this.pathExists) {
			return []
		}
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
			c.push(this.empty)
		}
		return c
	}

	async createCommittedFiles() {
		if (!this.pathExists) {
			log.warn('path does not exist for worktree: ' + this.uri)
			return []
		}
		const workspaceFolderPaths = vscode.workspace.workspaceFolders?.map((wf) => wf.uri.fsPath)
		log.info('createCommittedFiles workspaceFolderPaths=' + workspaceFolderPaths)
		log.info('this.uri.fsPath=' + this.uri.fsPath)
		if (workspaceFolderPaths?.includes(this.uri.fsPath)) {
			log.warn('skipping createCommittedFiles for ' + this.uri.fsPath + ' which is a WorkspaceFolder')
			return []
		}

		log.info('createCommittedFiles rootUri=' + this.uri.fsPath)
		const primaryRootNode = nodeMaps.getPrimaryRootNode() ?? this
		log.info('createCommittedFiles primaryRootNode=' + primaryRootNode.label + ' ' + primaryRootNode.uri.fsPath)
		const primaryRevision = await git.revParse(primaryRootNode.uri)
		log.info('createCommittedFiles primaryRevision=' + JSON.stringify(primaryRevision))
		if (!primaryRevision) {
			log.error('Primary revision not found')
			throw new Error('Primary revision not found')
		}
		const r = await git.diff(this.uri, '-z --name-status HEAD', primaryRevision)
		log.info('createCommittedFiles r=' + JSON.stringify(r))
		const diff: string = r
		log.info('createCommittedFiles diff=' + diff)
		const lines = diff.split('\0')
		log.info('lines.length=' + lines.length)

		const newFileNodes: WorktreeFile[] = []
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
		return newFileNodes
	}

	removeChild (child: WorktreeNode) {
		// do nothing
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

	private _setContextValue () {
		let isLocked = false
		if (this._locked == '🔒') {
			log.info('this._locked=' + this._locked)
			isLocked = true
		}
		this.contextValue = this.type + '#locked=' + isLocked + '&pathExists=' + this.pathExists + '&primary=' + this._primary
		log.info('_setContextValue = ' + this.contextValue)
	}

	setLocked (isLocked: '🔒' | '🔓') {
		if (this.isPrimary()) {
			return
		}
		if (this._locked == isLocked) {
			return
		}
		this._locked = isLocked
		let action: 'lock' | 'unlock' = 'lock'
		if (isLocked == '🔓') {
			action = 'unlock'
		}
		this._setContextValue()
		log.info('worktree ' + this.label + ' is now ' + action + 'ed ' + this._locked + ' ' + this.uri.fsPath)
		log.info('contextValue=' + this.contextValue)
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

	override toString () {
		// const ret = JSON.parse(super.toString()) && {
		// 	commitRef: this.commitRef,
		// 	locked: this._locked,
		// }
		const ret = {
			type: this.type,
			id: this.id,
			contextValue: this.contextValue,
			commitRef: this.commitRef,
			locked: this._locked,
			primary: this._primary,
		}
		return JSON.stringify(ret)
	}

}

export class EmptyFileGroup extends WorktreeNodeInfo {

	constructor (private readonly parent: WorktreeRoot) {
		super('EmptyFileGroup', parent.id + '#empty', parent.uri, parent, '', vscode.TreeItemCollapsibleState.None)
		this.description = 'No modified files detected'
		this.contextValue = 'WorktreeFileGroup#Empty'
	}

	get children () {
		return [] as WorktreeNode[]
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
}

export class WorktreeFileGroup extends WorktreeNodeInfo {
	private _children: WorktreeNode[] = []

	constructor(private readonly parent: WorktreeRoot, public readonly group: FileGroup) {
		super('WorktreeFileGroup', parent.id + '#' + group, parent.uri.with({scheme: 'WorktreeNode', query: group}), parent, groupLabel(group), vscode.TreeItemCollapsibleState.Collapsed)
		this.contextValue = 'WorktreeFileGroup#' + group
		if (this.parent.isPrimary()) {
			this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
		}
	}

	get children () {
		return this._children.sort((a, b) => {
			if (a.description == b.description) {
				return a.getLabel() > b.getLabel() ? 1 : -1
			}
			return (a.description ?? '') > (b.description ?? '') ? 1 : -1
		})
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

	constructor(uri: vscode.Uri, private readonly parent: WorktreeFileGroup, state: string) {
		super('WorktreeFile', uri.fsPath + '#' + parent.group, uri, parent, basename(uri.fsPath), vscode.TreeItemCollapsibleState.None)

		this.relativePath = path.relative(parent.uri.fsPath, uri.fsPath)
		this.gitUri = this.uri
		if (parent.group == FileGroup.Staged) {
			this.gitUri = git.toGitUri(this.getRepoNode(), this.uri, '~')
			if (!this.getRepoNode().isPrimary()) {
				// const diffUri = this.uri.with({path: this.uri.path + '.diff'})
				this.gitUri = git.toGitUri(this.getRepoNode(), this.uri, '~')
			}

		} else if (parent.group == FileGroup.Committed) {
			const primaryRootNode = nodeMaps.getPrimaryRootNode()
			const refUri = vscode.Uri.joinPath(primaryRootNode.uri, this.relativePath)
			this.gitUri = git.toGitUri(nodeMaps.getPrimaryRootNode(), refUri, this.getRepoNode().commitRef)

			// const params: GitUriOptions = JSON.parse(this.gitUri.query)
			// params.replaceFileExtension = true
			// this.gitUri = this.gitUri.with({query: JSON.stringify(params)})
			// this.gitUri = this.gitUri.with({query: JSON.stringify(this.gitUri.query)})
		}

		// this.id2 = vscode.Uri.from({authority: 'multi-branch-checkout', scheme: 'WorktreeFile', path: this.uri.path, query: this.group }).toString()
		log.info('id2=' + vscode.Uri.from({
				authority: 'multi-branch-checkout',
				scheme: 'WorktreeFile',
				path: this.uri.path,
				query: this.group,
				fragment: this.getRepoNode().getLabel()
			}).toString())
		this.contextValue = 'WorktreeFileNode#' + parent.group
		this.tooltip = this.uri.fsPath
		this.state = state

		if (this.state == 'D') {
			this.label = '~~~' + this.label + '~~~'
		}

		const wt = this.parent.getParent()
		this.description = vscode.workspace.asRelativePath(path.dirname(this.uri.fsPath))
		if (wt.uri.fsPath == this.description) {
			// files in repo root
			this.description = ''
		}
		this.parent.children.push(this)

		this.command = {
			title: 'multi-branch-checkout.selectFileNode',
			command: 'multi-branch-checkout.selectFileNode',
			arguments: [this.id],
		}
//
		// this.resourceUri = this.uri
		// this.resourceUri = this.gitUri

	}


	get group () { return this.parent.group }

	get diffLabel () {
		if (this.group == FileGroup.Committed) {
			// TODO: should use the git configured length
			return this.getRepoNode().commitRef.substring(0,5) + ':' + this.label
		} else if (!this.getRepoNode().isPrimary()) {
			return this.getRepoNode().label + ':' + this.label
		}
		return this.label
	}

	getParent () {
		return this.parent
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
