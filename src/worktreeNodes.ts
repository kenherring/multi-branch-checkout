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

	removeChild (child: WorktreeFileGroup) {
		log.info('WorktreeRoot.removeChild ' + child.label + ' ' + this.children.length)
		const idx = this.children.findIndex((node) => node.id = child.id)
		if (idx == 0 && this.children.length == 1) {
			log.info('this.children.length=' + this.children.length)
			this.children.unshift(new EmptyFileGroup(this))
			log.info('this.children.length=' + this.children.length)
			this.children.pop()
			log.info('this.children.length=' + this.children.length)
			log.info('this.children[0].id=' + this.children[0].id)
			// this.children.push(new EmptyFileGroup(this))
			log.info('pushed empty group')
		} else {
			this.children.splice(idx, 1)
		}
		log.info('this.children.length='  + this.children.length + ' ' + this.children[0].id)
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

		if (this.contextValue == 'WorktreePrimary') {
			return Promise.resolve()
		}
		if (this._locked == isLocked) {
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
	public readonly uri: vscode.Uri
	public readonly children: WorktreeNode[] = []
	constructor (private readonly parent: WorktreeRoot) {
		super('')
		this.uri = parent.uri
		this.description = 'No modified files detected'
		this.collapsibleState = vscode.TreeItemCollapsibleState.None
		this.id = parent.id + '#empty'
		this.contextValue = 'WorktreeFileGroupEmpty'
		nodeMaps.parents.set(this.id, parent)
	}

	getParent () {
		return nodeMaps.parents.get(this.id ?? this.label!.toString())
	}

	getRepoUri () {
		return this.parent.uri
	}

	removeChild () {}
}

export class WorktreeFileGroup extends vscode.TreeItem {
	public children: WorktreeNode[] = []
	public uri: vscode.Uri
	constructor(private readonly parent: WorktreeRoot, public readonly group: FileGroup) {
		super(group, vscode.TreeItemCollapsibleState.Collapsed)
		this.uri = parent.uri
		this.label = this.groupLabel(group)
		this.id = this.parent.id + '#' + group
		this.contextValue = 'WorktreeFileGroup' + group
		if (this.parent.contextValue == 'WorktreePrimary') {
			this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
		}
		nodeMaps.parents.set(this.id, parent)
	}

	getParent () {
		const ret = nodeMaps.parents.get(this.id ?? this.label!.toString())
		if (!ret) {
			throw new WorktreeNotFoundError('Parent not found for ' + this.id)
		}
		return ret as WorktreeRoot
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
	public state: string | undefined = undefined
	public relativePath: string
	public readonly group: FileGroup

	constructor(public readonly uri: vscode.Uri, private readonly parent: WorktreeFileGroup, state: string) {
		super(basename(uri.fsPath), vscode.TreeItemCollapsibleState.None)
		uri = uri.with({fragment: parent.group})
		this.label = basename(uri.fsPath)
		log.info('uri.fsPath=' + uri.fsPath)
		this.id = uri.fsPath + '#' + parent.group
		log.info('uri.fsPath=' + uri.fsPath)
		this.group = parent.group
		this.contextValue = 'WorktreeFile' + parent.group
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
		nodeMaps.parents.set(this.id, this.parent)
		this.parent.children.push(this)
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

	removeChild () {}
}
