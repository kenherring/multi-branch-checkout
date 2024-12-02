import * as vscode from 'vscode'
import { FileGroup, nodeMaps, WorktreeFile, WorktreeFileGroup, WorktreeNode, WorktreeRoot } from "./worktreeNodes"
import { git } from './gitFunctions'
import { log } from './channelLogger'
import { NotImplementedError, WorktreeNotFoundError } from './errors'
import { dirExists, validateUri } from './utils'
import { WorktreeView } from './worktreeView'
import path from 'path'

// async function command_patchToWorktree(node: WorktreeFile) {
// 	// first, select a target worktree via a prompt
// 	// second, create a patch file against merge-base
// 	// third, apply the patch to the target worktree
// 	// fourth, (move only) remove the original file from the source worktree

// 	validateUri(node)

// 	log.info('patchToWorktree node.id=' + node.id)

// 	const rootNodes = worktreeView.getRootNodes()
// 	const rootNodeIds: vscode.QuickPickItem[] = []
// 	for (const n of rootNodes) {
// 		if (!n.label) {
// 			continue
// 		}
// 		if (n.uri === node.getRepoUri()) {
// 			continue
// 		}
// 		log.info('label=' + n.label)
// 		rootNodeIds.push({
// 			label: n.getLabel(),
// 			description: "$(repo) path: " + n.uri.fsPath
// 		})
// 	}

// 	// first, select a target worktree via a prompt
// 	const moveToNode = await vscode.window.showQuickPick(rootNodeIds, { placeHolder: 'Select target worktree' })
// 		.then((r) => { return rootNodes.find(n => n.getLabel() == r?.getLabel()) })
// 	log.info('moveToNode.id=' + moveToNode?.id)

// 	if (!moveToNode) {
// 		throw new Error('Failed to find repo root node for quickpick selection')
// 	}
// 	// const repoTo = await getRepo(moveToNode)

// 	// const repoFrom = await getRepo(node)

// 	// log.info('node.getFileGroup()=' + node.getFileGroup())

// 	// let patch: string = ''
// 	// if (node.getFileGroup() == FileGroup.Staged) {
// 	// 	patch = await repoFrom.diffIndexWithHEAD(node.uri!.fsPath)
// 	// } else if (node.getFileGroup() == FileGroup.Changes || node.getFileGroup() == FileGroup.Untracked) {
// 	// 	patch = await repoFrom.diffIndexWith('~',node.uri!.fsPath)
// 	// 		.then((r) => { return r	}, (e) => {
// 	// 			log.error('diffIndexWith error: ' + e)
// 	// 			return ''
// 	// 		})
// 	// 	if (patch.length == 0) {
// 	// 		patch = await repoFrom.diffWithHEAD(node.uri!.fsPath)
// 	// 	}
// 	// }

// 	// log.info('writePatchToFile patch=' + patch)
// 	// await vscode.workspace.fs.writeFile(vscode.Uri.file('C:/temp/patch'), Buffer.from(patch))

// 	// await repoTo.apply('C:/temp/patch').then(() => {
// 	// 	log.info('patch apply successful')
// 	// }, (e) => {
// 	// 	log.error('patch apply error: ' + e)
// 	// })

// 	// create patch
// 	// return git.spawn(['diff', '-p', '--merge-base', '--fork-point', '--', node.uri?.fsPath], { cwd: node.getRepoUri().fsPath })
// 	// 	.then((r: any) => {
// 	// 		log.info('r2=' + JSON.stringify(r,null,2))
// 	// 		// apply patch
// 	// 		return git.spawn(['apply', '-'], { cwd: moveTo!.uri.fsPath, stdin: r.stdout })
// 	// 	}).then((r: any) => {
// 	// 		log.info('r3=' + JSON.stringify(r,null,2))
// 	// 		log.info('successfully applied patch')
// 	// 		if (move) {
// 	// 			// delete original file (move only)
// 	// 			return git.spawn(['rm', node.uri?.fsPath], { cwd: node.getRepoUri().fsPath })
// 	// 		}
// 	// 		return Promise.resolve('copy only')
// 	// 	}).then((r: any) => {
// 	// 		log.info('r4=' + JSON.stringify(r,null,2))
// 	// 		if (r == 'copy only') {
// 	// 			return
// 	// 		}
// 	// 		log.info('r=' + JSON.stringify(r,null,2))
// 	// 		log.info('successfully moved ' + node.uri?.fsPath + ' to ' + moveTo!.uri.fsPath)
// 	// 	}, (e: any) => {

// 	// 		if (e.stderr) {
// 	// 			log.error('error: ' + e.stderr)
// 	// 			throw new Error('Failed to move file: ' + e.stderr)
// 	// 		}
// 	// 	})
// 		// .then((r: any) => {
// 		// 	log.info('r=' + JSON.stringify(r,null,2))
// 		// 	return vscode.workspace.fs.writeFile(patchFile, Buffer.from(r.stdout))
// 		// })
// 		// .then(() => {
// 		// 	return git.spawn(['apply', patchFile.fsPath], { cwd: node.getRepoUri().fsPath })
// 		// })
// 		// .then((r: any) => {
// 		// 	log.info('r=' + JSON.stringify(r,null,2))
// 		// 	return vscode.workspace.fs.delete(patchFile)
// 		// })
// }

export class MultiBranchCheckoutAPI {

	private readonly tempFiles: vscode.Uri[] = []
	private tempDir: vscode.Uri

	constructor (private readonly worktreeView: WorktreeView) {
		this.tempDir = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, '.temp')
	}

	setTempDir(dir: vscode.Uri) { this.tempDir = dir }
	getTempDir() { return this.tempDir }
	getWorktreeView() { return this.worktreeView }
	getNodes(uri: vscode.Uri) { return nodeMaps.getNodes(uri) }
	getNode(uri: vscode.Uri) { return nodeMaps.getNode(uri) }
	getFileNode(uri: vscode.Uri) { return nodeMaps.getFileNode(uri) }

	getOtherRootNodes (currentRootNode: WorktreeRoot) {
		return nodeMaps.tree.filter(n => n instanceof WorktreeRoot && n.uri.fsPath !== currentRootNode.uri.fsPath)
	}

	public lastRefresh = Date.now()

	async refreshUri (uri: vscode.Uri) {

		if (uri.path.includes('/.git/')) {
			log.warn('refreshUri called on .git directory path: ' + uri.fsPath)
			return
		}

		const ignore = await git.checkIgnore(uri.fsPath)
		if (ignore) {
			return
		}

		const isDir = await vscode.workspace.fs.stat(uri).then((s) => { return s.type === vscode.FileType.Directory }, () => { return false })
		if (isDir) {
			log.warn('refreshUri called on directory: ' + uri.fsPath)
			return
		}

		this.lastRefresh = Date.now()
		const nodes = this.getNodes(uri)
		if (nodes.length == 0) {
			const wt = nodeMaps.getWorktreeForUri(uri)
			log.info('refreshUri wt=' + wt?.id)
			if (wt) {
				await this.refresh(wt)
				return
			}
		} else {
			for (const node of nodes) {
				await this.refresh(node)
			}
		}
		log.info('refreshUri complete')
	}

	refresh(node?: WorktreeNode, ...nodes: WorktreeNode[]) {
		log.info('node=' + node + ', nodes.lenth=' + nodes.length)
		if (node) {
			nodes.unshift(node)
		}
		log.info('nodes.length=' + nodes.length)
		if (nodes.length == 0) {
			return this.worktreeView.refresh()
		}

		const proms: Promise<void>[] = []
		for (const node of nodes) {
			log.info('refreshing node: ' + node?.id)
			proms.push(this.worktreeView.refresh(node))
		}
		return Promise.all(proms)
			.then(() => {
				log.info('refreshComplete!')
			}, (e) => {
				log.warn('refresh failed: ' + e)
			})
	}

	async getWorktrees () {
		const trees: string[] = await git.worktree.list('--porcelain -z')
			.then((r: any) => {
				const stdout = r.stdout as string
				const trees = stdout.split('\0\0')
				return trees.filter((t) => t.trim().length > 0)
			})
		return trees
	}

	async createWorktree (workspaceFolder: vscode.WorkspaceFolder, worktreeName?: string) {
		if (!worktreeName) {
			//display an input dialog to get the branch name
			worktreeName = await vscode.window.showInputBox({ prompt: 'Enter the branch name' })
			if (!worktreeName) {
				return
			}
		}

		const worktreesDir = vscode.Uri.joinPath(workspaceFolder.uri, '.worktrees')

		if (!dirExists(worktreesDir)) {
			log.info('creating worktrees directory: ' + worktreesDir.fsPath)
			await vscode.workspace.fs.createDirectory(worktreesDir).then(() => {}, (e) => {
				void log.notificationError('Failed to create worktrees directory: ' + e)
				throw e
			})
		}

		const worktreeUri = vscode.Uri.joinPath(workspaceFolder.uri, '.worktrees', worktreeName)

		//create the worktree
		const relativePath = vscode.workspace.asRelativePath(worktreeUri)
		log.info('git worktree add "' + relativePath + '" (workspacePath=' + workspaceFolder.uri.fsPath + ')')
		const r = await git.worktree.add('"' + relativePath + '"')
			.then((r: any) => {
				log.info('worktree created for branch: ' + worktreeName)
				return r
			}, (e: any) => {
				if (e.stderr) {
					log.error('Failed to create worktree!\n * stderr="' + e.stderr + '"\n * e.message="' + e.message + '"')
					void log.notificationError(e.stderr)
				} else {
					log.error('Failed to create worktree: ' + JSON.stringify(e))
					void log.notificationError('Failed to create worktree! ' + e.message)
				}
				throw e
			})

		log.info('r=' + JSON.stringify(r))
		await this.refresh()
		// await command_refresh(worktreeUri)
		log.info('refresh after create worktree complete!')
		return r
	}

	async deleteWorktree (rootNode: WorktreeRoot, proceedAction?: 'Yes' | 'No') {
		if (rootNode.locked == '🔒') {
			void log.notificationError('Worktree is locked and cannot be deleted')
			throw new Error('Worktree is locked and cannot be deleted')
		}

		// get count of files in the worktree
		let count = 0
		log.info('command_deleteWorktree rootNode=' + rootNode.id + ' ' + rootNode.children.length)
		for (const child of rootNode.children) {
			count += child.children.length
		}

		// TODO: Attempt remove without force, then prompt user if there are modified files
		//
		// const r = await git.worktree.remove('"' + rootNode.uri.fsPath + '"', false)


		if (count > 0) {
			let proceed: boolean
			if (!proceedAction) {
				proceedAction = await vscode.window.showWarningMessage('Worktree has modified files which have not been committed.  Delete anyway?', 'Yes', 'No')
					.then((r: 'Yes' | 'No' | undefined) => {
						log.info('delete worktree anyways? ' + r)
						if (!r) {
							throw new Error('Failed to delete worktree with modified files, no response from user')
						}
						return r
					})
			}
			proceed = false
			if (proceedAction == 'Yes') {
				proceed = true
			}
			if (!proceed) {
				return Promise.resolve()
			}
		}
		log.info('removing worktree ' + rootNode.id)
		const r = await git.worktree.remove('"' + rootNode.uri.fsPath + '"', true)
		if (r.stderr) {
			void log.notificationError('Failed to remove worktree: ' + r.stderr)
			return
		}
		void log.notification('Worktree removed successfully: ' + rootNode.uri.fsPath)
		nodeMaps.tree.splice(nodeMaps.tree.indexOf(rootNode), 1)
		await this.refresh()
		return true
	}

	lockWorktree (rootNode: WorktreeRoot, lock: '🔒' | '🔓' = '🔒') {
		let action
		let prom: Promise<any>

		if (lock == '🔒') {
			action = 'lock'
			prom = git.worktree.lock(rootNode.uri.fsPath)
		} else {
			action = 'unlock'
			prom = git.worktree.unlock(rootNode.uri.fsPath)
		}

		return prom.then(() => {
				rootNode.setLocked(lock)
				if (rootNode.locked == lock) {
					log.info('successfully ' + action + 'ed ' + rootNode.locked + ' worktree: ' + rootNode.uri.fsPath)
					return this.refresh(rootNode)
				}
				log.warn('Failed to ' + action + ' worktree: ' + rootNode.locked + ' ' + rootNode.uri.fsPath)
			}).then(() => {
				log.info('refresh after ' + action + ' complete!')
			}, (e: any) => {
				let errText = 'Failed to ' + action + ' worktree.'
				if (e.stderr) {
					errText = errText + ' e.stderr=' + e.stderr
				} else {
					errText = errText + ' e=' + JSON.stringify(e)
				}
				void log.notificationError(errText)
				throw e
			})
	}

	unlockWorktree(node: WorktreeRoot) {
		return this.lockWorktree(node, '🔓')
	}

	swapWorktrees (node: WorktreeRoot) {
		return vscode.window.showInformationMessage('Not yet implemented')
	}

	launchWindowForWorktree (node: WorktreeRoot) {
		validateUri(node)
		return vscode.commands.executeCommand('vscode.openFolder', node.uri, { forceNewWindow: true })
	}

	private async getOpenUri (node: WorktreeFile) {
		let openUri = node.gitUri
		log.info('api.openFile openUri=' + openUri.fsPath)
		if (node.group != FileGroup.Staged || node.getRepoNode().contextValue == 'WorktreePrimary') {
			return openUri
		}

		log.info('api.openFile node.group=Staged')
		if (!dirExists(this.tempDir)) {
			await vscode.workspace.fs.createDirectory(this.tempDir).then(() => {
				log.info('created temp directory: ' + this.tempDir.fsPath)
			}, (e: Error) => {
				// log.error('failed to create temp directory: ' + tempDir.fsPath)
				e.message = 'Failed to open file ' + node.relativePath + '. Could not create temp directory ' +this.tempDir.fsPath + ',\n' + e.message
				log.error('e.message=' + e.message)
				throw e

			})
		}
		openUri = await git.show(node.getRepoUri(), node.relativePath, this.tempDir)
		log.info('api.openFile openUri=' + openUri.fsPath)
		this.tempFiles.push(openUri)
		log.info('this.tempFiles.length=' + this.tempFiles.length)
		return openUri
	}

	openFile = async (node: WorktreeFile) => {
		log.info('api.openFile node.id=' + node.id + ' ' + JSON.stringify(node.gitUri, null, 2))
		if (!node.gitUri) {
			throw new Error('gitUri is undefined for node.id:' + node.id)
		}

		const openUri = await this.getOpenUri(node)
		// const tempDir = vscode.Uri.joinPath(node.gitUri, '.temp')



		// const tempUri = node.gitUri.with({ path: vscode.Uri.joinPath(tempDir, node.relativePath).path })
		// const tempUri = node.gitUri.with({ path: node.relativePath })
		// log.info('tempUri=' + JSON.stringify(tempUri, null, 2))

		// await git.version()

		// openUri = openUri.with({ fragment: '(fragment)', query: '(query)',  })
		log.info('api.openFile vscode.openWith openUri=' + JSON.stringify(openUri, null, 2))
		await vscode.commands.executeCommand('vscode.openWith', openUri, 'default').then(() => {
		// await vscode.commands.executeCommand('vscode.openWith', tempUri, 'default').then(() => {
			log.info('open file ' + openUri + ' successful')
		}, (e) => {
			// log.error('open file failed: ' + e)
			log.notificationError('api.openFile failed to open file ' + openUri + '!\n' + e)
			throw e
		})

		// const doc = vscode.workspace.openTextDocument(openUri)
		// doc.FileName

		// await vscode.window.showTextDocument()

		if (node.group == FileGroup.Staged) {
			log.info('settings active editor to readonly...')
			await vscode.commands.executeCommand('workbench.action.files.setActiveEditorReadonlyInSession', openUri).then((r) =>{
				log.info('active editor set to readonly (r=' + r + ')')
			}, (e) => {
				log.error('failed to set active editor to readonly!  e=' + e)
			})
			// const active = vscode.window.activeTextEditor
			// active?.options.readOnly = true
			// active?.document.uri.fsPath = '123'
			// active?.document.uri.with({ path: '123' })
		}
	}

	// compare(node: WorktreeFile, to: 'HEAD' | 'merge-base') {
	compare(node: WorktreeFile) {
		throw new NotImplementedError('compareWithMergeBase not yet implemented')
		// command_compareWithMergeBase(node)
	}

	async discardChanges(node: WorktreeNode, dialogResponse?: string) {
		if (node instanceof WorktreeFile) {
			log.info('discardChanges uri=' + node.uri?.fsPath)
			const r = await git.clean(node, dialogResponse)
			if (!r) {
				log.error('discardChanges did not complete for ' + node.uri?.fsPath)
				return false
			}
			const parent = node.getParent()
			node.dispose()
			let updateNode: WorktreeNode = parent
			if (parent.children.length == 0) {
				const grandparent = parent.getParent()
				parent.dispose()
				updateNode = grandparent
			}
			await this.worktreeView.updateTree(updateNode)
			return true
		}
		throw new NotImplementedError('Discard changes not yet implemented for root or group nodes')
	}

	async copyToWorktree(node: WorktreeFile, move = false, worktreeName?: string) {
		validateUri(node)

		let otherRootNodes = this.getOtherRootNodes(node.getRepoNode())
		log.info('otherRootNodes.length=' + otherRootNodes.length)
		if (worktreeName) {
			otherRootNodes = otherRootNodes.filter(n => {
				log.info('label=' + n.getLabel())
				return n.getLabel() == worktreeName
			})
		}

		if (otherRootNodes.length == 0) {
			throw new WorktreeNotFoundError('No other worktrees found')
		}

		let moveToRoot: WorktreeRoot | undefined
		if (otherRootNodes.length == 1) {
			moveToRoot = otherRootNodes[0]
		} else {
			const rootNodeIds: vscode.QuickPickItem[] = []
			for (const n of otherRootNodes) {
				rootNodeIds.push({
					label: n.getLabel(),
					description: "$(repo) path: " + n.uri.fsPath
				})
			}
			const r = await vscode.window.showQuickPick(rootNodeIds, { placeHolder: 'Select target worktree' })
			moveToRoot = otherRootNodes.find(n => n.getLabel() == r?.label)
			if (!moveToRoot) {
				throw new WorktreeNotFoundError('Failed to find target worktree: ' + r?.label)
			}
		}

		const moveToUri = vscode.Uri.joinPath(moveToRoot.uri, node.relativePath)
		log.info('copying ' + node.uri?.fsPath + ' to ' + moveToUri.fsPath)
		log.info(' --from = ' + node.uri?.fsPath)
		log.info(' --to   = ' + moveToUri.fsPath)
		log.info(' --moveToRoot = ' + moveToRoot.uri.fsPath)
		await vscode.workspace.fs.copy(node.uri, moveToUri, { overwrite: true })
		await this.refresh(moveToRoot)
		const newNode = this.getFileNode(moveToUri)
		await this.worktreeView.reveal(newNode, { select: false, focus: true })
		log.info('successfully copied file')
		if (move) {
			// delete original file (move only)
			const repoNode = node.getRepoNode()
			await git.clean(node, 'delete')
			log.info('completed git clean (node=' + node + ')')
			await this.refresh(repoNode)
		}
	}

	moveToWorktree = (node: WorktreeFile, worktreeName?: string) => {
		return this.copyToWorktree(node, true, worktreeName)
	}

	async stage (node: WorktreeNode, action: 'stage' | 'unstage' = 'stage') {
		const addList: WorktreeFile[] = []
		if (node instanceof WorktreeFile) {
			addList.push(node)
		} else if(node instanceof WorktreeFileGroup) {
			for (const child of node.children) {
				addList.push(child as WorktreeFile)
			}
		} else {
			throw new Error('Invalid node type: only Files and FileGroups can be staged')
		}

		if (action === 'stage') {
			log.info('stage files: ' + JSON.stringify(addList))
			await git.add(...addList)
		} else {
			log.info('unstage files: ' + JSON.stringify(addList))
			await git.reset(...addList)
		}
		for (const n of addList) {
			const p = n.getParent()
			log.info('p.children.length=' + p.children.length + ' p.id=' + p.id)
			n.dispose()
			log.info('p.children.length=' + p.children.length + ' p.id=' + p.id)
			// worktreeView.updateTree(p)
		}
		const repoNode = node.getRepoNode()
		await git.status(repoNode)
		await this.worktreeView.updateTree(repoNode)
	}

	unstage(node: WorktreeNode) { return this.stage(node, "unstage") }

	async selectWorktreeFile(nodeOrId: WorktreeFile | string) {
		log.info('selectFileTreeItem: nodeOrId=' + nodeOrId)
		let node: WorktreeFile
		if (nodeOrId instanceof WorktreeFile) {
			node = nodeOrId
		} else {
			node = nodeMaps.getNode(nodeOrId) as WorktreeFile
			log.info('selectFileTreeItem: node=' + node)
			if (!node) {
				throw new Error('Node not found for id: ' + node)
			}
		}

		const openUri = await this.getOpenUri(node)

		// const parentRef = await git.revParse(node.getRepoNode().uri)
		const parentRef = node.getRepoNode().commitRef
		log.info('selectFileTreeItem: ' + node.id + ' parentRef=' + parentRef)

		const primaryRootNode = nodeMaps.getPrimaryRootNode()
		log.info('selectFileTreeItem primaryRootNode=' + primaryRootNode.id)
		const repoNode = node.getRepoNode()

		log.info(' --- primaryRootNode.uri=' + primaryRootNode.uri.fsPath)
		log.info(' --- node.relativePath=' + node.relativePath)
		let compareToUri: vscode.Uri | undefined = vscode.Uri.joinPath(primaryRootNode.uri, node.relativePath)

		log.info(' --- compareToUri=' + compareToUri.fsPath)
		// let compareToGitUri = git.toGitUri(primaryRootNode, compareToUri)
		// log.info('compareToUri=' + compareToUri.fsPath)

		log.info(' -- primaryRootNode.id=' + primaryRootNode.id)
		log.info(' --        repoNode.id=' + repoNode.id)
		if (primaryRootNode.id == repoNode.id) {
			log.info(' - selectFileTreeItem primaryRootNode is the parent of the selected node')
			if (node.group == FileGroup.Staged) {
				compareToUri = git.toGitUri(node.getRepoNode(), node.uri, 'HEAD')
				log.info('compareToGitUri=' + compareToUri.fsPath)
			}
			if (node.group == FileGroup.Untracked) {
				log.info('looking for staged node...')
				let s: WorktreeFile | undefined = undefined
				try {
					s = nodeMaps.getFileNode(node.uri, FileGroup.Staged)
				} catch (_e) {
					log.info('staged node not found, using undefined')
				}
				if (s) {
					compareToUri = s.uri
				} else {
					compareToUri = git.toGitUri(node.getRepoNode(), node.uri, 'HEAD')
				}
			}

			// if (node.group == FileGroup.Changes || node.group == FileGroup.Untracked) {
			// 	const stagedNode = nodeMaps.getNode(node.uri, FileGroup.Staged) as WorktreeFile
			// 	log.info('selectFileTreeItem stagedNode = ' + stagedNode)
			// 	if (stagedNode) {
			// 		log.info('selectFileTreeItem stagedNode found: ' + stagedNode.id)
			// 		compareToGitUri = stagedNode.gitUri
			// 	}
			// }
		}

		let titleGroup: string = node.group
		if (node.group == FileGroup.Staged) {
			titleGroup = 'Index'
		} else if (node.group == FileGroup.Changes) {
			titleGroup = 'Working Tree'
		}

		let diffTitle = node.diffLabel + ' (' + titleGroup + ')'
		if (repoNode.contextValue != 'WorktreePrimary') {
			diffTitle += ' [worktree: ' + node.getRepoNode().label + ']'
		}
		diffTitle = path.basename(compareToUri.fsPath) + ' ⟷ ' + diffTitle
		if (primaryRootNode.id == repoNode.id && node.group == FileGroup.Untracked) {
			diffTitle = node.relativePath + ' (Untracked)'
		}
		log.info('selectFileTreeItem: diffTitle=' + diffTitle)
		log.info(' -- openUri         = ' + JSON.stringify(openUri))
		log.info(' -- compareToGitUri = ' + JSON.stringify(compareToUri))

		return vscode.commands.executeCommand('vscode.diff', compareToUri, openUri, diffTitle)
	}

	async dispose () {
		// should we delete a tempFile when the editor closes?
		for (let i = this.tempFiles.length - 1 ; i >= 0 ; i--) {
			const tempFile = this.tempFiles[i]
			vscode.workspace.fs.delete(tempFile).then(() => {
				log.info('file deleted!')
			}, (e) => {
				log.warn('failed to delete tempFile ' + tempFile.fsPath + '! e=' + e)
			})
		}
	}

}
