import { basename } from 'path'
import * as vscode from 'vscode'
import { log } from './channelLogger'
import { WorktreeNotFoundError } from './errors'

export class NodeMapper {
    tree: WorktreeRoot[] = []

	// This isn't super efficient, but it's only used for testing...
    getNodes (uri?: vscode.Uri, group?: FileGroup) {
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
		if (!uri) {
			log.info('returning all nodes (allNodes.lenght=' + allNodes.length + ')')
			return allNodes
		}

		log.info(' - getNodes uri=' + uri.fsPath)
		const nodes = allNodes.filter((n) => {
			if (n instanceof WorktreeFile) {
				log.info(' -- filter n.id=' + n.id + ' ' + n.disposed)
			}
			return n.uri.fsPath == uri.fsPath
		})
		if (group) {
			return nodes?.filter((n) => { return n instanceof WorktreeFile && n.group == group })
		}
		return nodes
	}

	getNode(uri: vscode.Uri, group?: FileGroup) {
		const nodes = this.getNodes(uri, group)
		if (nodes.length == 0) {
			throw new WorktreeNotFoundError('Node not found for uri=' + uri.fsPath)
		}
		if (nodes.length > 1) {
			throw new WorktreeNotFoundError('Multiple nodes found for uri=' + uri.fsPath + ' (count=' + nodes.length + ')')
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
		const nodes = this.getNodes().filter((n) => { return n instanceof WorktreeRoot })
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

	constructor(public readonly uri: vscode.Uri, branch: string) {
		super('WorktreeRoot', basename(uri.fsPath), vscode.TreeItemCollapsibleState.Collapsed)
		this.label = basename(uri.fsPath)
		this.id = uri.fsPath

		this.contextValue = 'WorktreeRoot'
		this.description = branch
		this.resourceUri = uri
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
		this.contextValue = 'WorktreeFileGroupEmpty'
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
	public children: WorktreeNode[] = []
	public uri: vscode.Uri

	constructor(private readonly parent: WorktreeRoot, public readonly group: FileGroup) {
		super('WorktreeFileGroup', group, vscode.TreeItemCollapsibleState.Collapsed)
		this.uri = parent.uri.with({fragment: this.group})
		this.label = groupLabel(group)
		this.id = this.parent.id + '#' + group
		this.contextValue = 'WorktreeFileGroup' + group
		if (this.parent.contextValue == 'WorktreePrimary') {
			this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
		}
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
		this.children = this.children.filter((node) => node.uri.fsPath != child.uri.fsPath)
	}

	public toJSON(): string {
		const {
			parent: _p,
			...props } = this
		return JSON.stringify(props)
	}

	override dispose () {
		for (let i=this.children.length - 1; i >= 0; i--) {
			const c = this.children[i] as WorktreeFile
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
	public readonly group: FileGroup

	constructor(public readonly uri: vscode.Uri, private readonly parent: WorktreeFileGroup, state: string) {
		super('WorktreeFile', basename(uri.fsPath), vscode.TreeItemCollapsibleState.None)
		uri = uri.with({fragment: parent.group})
		this.label = basename(uri.fsPath)
		log.info('uri.fsPath=' + uri.fsPath + ' ' + uri)
		this.id = uri.fsPath + '#' + parent.group
		log.info('uri.fsPath=' + uri.fsPath)
		this.group = parent.group
		this.contextValue = 'WorktreeFile' + parent.group
		this.uri = uri
		this.resourceUri = uri
		this.relativePath = uri.fsPath.replace(this.parent.getRepoUri().fsPath, '').substring(1)
		// this.resourceUri = vscode.Uri.parse(uri.toString().replace('file:///', 'worktree:///'))
		this.tooltip = uri.fsPath
		this.state = state
		if (this.state == 'D') {
			this.label = '~~~' + this.label + '~~~'
		}

		const wt = this.parent.getParent()
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
		this.parent.children.push(this)

		this.command = {
			title: 'vscode.open',
			command: 'vscode.open',
			arguments: [this.uri],
		}
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
