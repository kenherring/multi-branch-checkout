import { basename } from 'path'
import * as vscode from 'vscode'
import { log } from './channelLogger'
import { WorktreeNotFoundError } from './errors'

export class NodeMapper {
    tree: WorktreeRoot[] = []
    parents = new Map<string, WorktreeNode>()
    fileMap = new Map<string, WorktreeNode[]>()

    emptyTree(children: WorktreeNode[]) {
        while (children.length > 0) {
            const c = children.pop()
            if (c) {
                this.emptyTree(c.children)
            }
        }
    }

    getNodes (uri: vscode.Uri, group?: FileGroup) {
		log.info('fileMap.get uri=' + uri.fsPath)
		const nodes = nodeMaps.fileMap.get(uri.fsPath) ?? []
		if (group) {
			return nodes?.filter((n) => { return n instanceof WorktreeFile && n.getFileGroup() == group })
		}
		return nodes
	}

	getNode(uri: vscode.Uri, group?: FileGroup) {
		const nodes = this.getNodes(uri, group)
		if (nodes.length == 0) {
			throw new WorktreeNotFoundError('Node not found for uri=' + uri.fsPath)
		}
		if (nodes.length > 1) {
			throw new WorktreeNotFoundError('Multiple nodes found for uri=' + uri.fsPath)
		}
		return nodes[0]
	}

	getFileNode(uri: vscode.Uri, group?: FileGroup) {
		log.info('350')
		const nodes = this.getNodes(uri, group).filter((n) => { return n instanceof WorktreeFile })
		log.info('351')
		if (nodes.length == 0) {
			log.info('352')
			throw new WorktreeNotFoundError('File node not found for uri=' + uri.fsPath)
		}
		if (nodes.length > 1) {
			log.info('353')
			throw new WorktreeNotFoundError('Multiple file nodes found for uri=' + uri.fsPath)
		}
		log.info('354')
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
		for (const node of this.tree) {
			if (uri.fsPath.startsWith(node.uri.fsPath)) {
				return node
			}
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

export type WorktreeNode = WorktreeRoot | WorktreeFileGroup | WorktreeFile | EmptyFileGroup

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
		log.info('worktree ' + this.label + ' is now ' + action + 'ed ' + emoji + ' ' + this.uri.fsPath)
	}

	get locked () {
		return this._locked
	}

}

export class EmptyFileGroup extends vscode.TreeItem {
	public readonly uri: vscode.Uri | undefined = undefined
	public readonly children: WorktreeNode[] = []
	constructor (parent: WorktreeRoot) {
		super('')
		this.description = 'No modified files detected'
		this.collapsibleState = vscode.TreeItemCollapsibleState.None
		this.id = parent.id + '#empty'
		this.contextValue = 'WorktreeFileGroupEmpty'
		nodeMaps.parents.set(this.id, parent)
	}

	getParent () {
		return nodeMaps.parents.get(this.id ?? this.label!.toString())
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
		nodeMaps.parents.set(this.id, parent)
	}

	getParent () {
		return nodeMaps.parents.get(this.id ?? this.label!.toString())
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
		const map = nodeMaps.fileMap.get(this.id)
		if (map) {
			map.push(this)
			nodeMaps.fileMap.set(this.resourceUri.fsPath, map)
		} else {
			nodeMaps.fileMap.set(this.resourceUri.fsPath, [ this ])
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
		nodeMaps.parents.set(this.id, parent)
		parent.children.push(this)
	}

	getParent () {
		return nodeMaps.parents.get(this.id ?? this.label!.toString())
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
