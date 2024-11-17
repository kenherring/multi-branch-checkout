import * as vscode from 'vscode'
import { nodeMaps, WorktreeFile, WorktreeFileGroup, WorktreeNode, WorktreeRoot } from "./worktreeNodes"
import { git } from './gitFunctions'
import { log } from './channelLogger'
import { NotImplementedError } from './errors'
import { worktreeView } from './extension'
import { dirExists, validateUri } from './utils'

function getOtherRootNodes (currentRootNode: WorktreeRoot) {
	return nodeMaps.tree.filter(n => n instanceof WorktreeRoot && n.uri.fsPath !== currentRootNode.uri.fsPath)
}

async function command_patchToWorktree(node: WorktreeFile) {
	// first, select a target worktree via a prompt
	// second, create a patch file against merge-base
	// third, apply the patch to the target worktree
	// fourth, (move only) remove the original file from the source worktree

	validateUri(node)

	log.info('patchToWorktree node.id=' + node.id)

	const rootNodes = worktreeView.getRootNodes()
	const rootNodeIds: vscode.QuickPickItem[] = []
	for (const n of rootNodes) {
		if (!n.label) {
			continue
		}
		if (n.uri === node.getRepoUri()) {
			continue
		}
		log.info('label=' + n.label)
		rootNodeIds.push({
			label: n.label?.toString(),
			description: "$(repo) path: " + n.uri.fsPath
		})
	}

	// first, select a target worktree via a prompt
	const moveToNode = await vscode.window.showQuickPick(rootNodeIds, { placeHolder: 'Select target worktree' })
		.then((r) => { return rootNodes.find(n => n.label?.toString() == r?.label) })
	log.info('moveToNode.id=' + moveToNode?.id)

	if (!moveToNode) {
		throw new Error('Failed to find repo for quickpick selection')
	}
	// const repoTo = await getRepo(moveToNode)

	// const repoFrom = await getRepo(node)

	// log.info('node.getFileGroup()=' + node.getFileGroup())

	// let patch: string = ''
	// if (node.getFileGroup() == FileGroup.Staged) {
	// 	patch = await repoFrom.diffIndexWithHEAD(node.uri!.fsPath)
	// } else if (node.getFileGroup() == FileGroup.Changes || node.getFileGroup() == FileGroup.Untracked) {
	// 	patch = await repoFrom.diffIndexWith('~',node.uri!.fsPath)
	// 		.then((r) => { return r	}, (e) => {
	// 			log.error('diffIndexWith error: ' + e)
	// 			return ''
	// 		})
	// 	if (patch.length == 0) {
	// 		patch = await repoFrom.diffWithHEAD(node.uri!.fsPath)
	// 	}
	// }

	// log.info('writePatchToFile patch=' + patch)
	// await vscode.workspace.fs.writeFile(vscode.Uri.file('C:/temp/patch'), Buffer.from(patch))

	// await repoTo.apply('C:/temp/patch').then(() => {
	// 	log.info('patch apply successful')
	// }, (e) => {
	// 	log.error('patch apply error: ' + e)
	// })

	// create patch
	// return git.spawn(['diff', '-p', '--merge-base', '--fork-point', '--', node.uri?.fsPath], { cwd: node.getRepoUri().fsPath })
	// 	.then((r: any) => {
	// 		log.info('r2=' + JSON.stringify(r,null,2))
	// 		// apply patch
	// 		return git.spawn(['apply', '-'], { cwd: moveTo!.uri.fsPath, stdin: r.stdout })
	// 	}).then((r: any) => {
	// 		log.info('r3=' + JSON.stringify(r,null,2))
	// 		log.info('successfully applied patch')
	// 		if (move) {
	// 			// delete original file (move only)
	// 			return git.spawn(['rm', node.uri?.fsPath], { cwd: node.getRepoUri().fsPath })
	// 		}
	// 		return Promise.resolve('copy only')
	// 	}).then((r: any) => {
	// 		log.info('r4=' + JSON.stringify(r,null,2))
	// 		if (r == 'copy only') {
	// 			return
	// 		}
	// 		log.info('r=' + JSON.stringify(r,null,2))
	// 		log.info('successfully moved ' + node.uri?.fsPath + ' to ' + moveTo!.uri.fsPath)
	// 	}, (e: any) => {

	// 		if (e.stderr) {
	// 			log.error('error: ' + e.stderr)
	// 			throw new Error('Failed to move file: ' + e.stderr)
	// 		}
	// 	})
		// .then((r: any) => {
		// 	log.info('r=' + JSON.stringify(r,null,2))
		// 	return vscode.workspace.fs.writeFile(patchFile, Buffer.from(r.stdout))
		// })
		// .then(() => {
		// 	return git.spawn(['apply', patchFile.fsPath], { cwd: node.getRepoUri().fsPath })
		// })
		// .then((r: any) => {
		// 	log.info('r=' + JSON.stringify(r,null,2))
		// 	return vscode.workspace.fs.delete(patchFile)
		// })
}

export class MultiBranchCheckoutAPI {
	getWorktreeView() { return worktreeView }
	getNodes(uri: vscode.Uri) { return nodeMaps.getNodes(uri) }
	getNode(uri: vscode.Uri) { return nodeMaps.getNode(uri) }
	getFileNode(uri: vscode.Uri) { return nodeMaps.getFileNode(uri) }

	public lastRefresh = Date.now()

	async refreshUri (uri: vscode.Uri) {

		if (uri.path.includes('/.git/')) {
			log.warn('refreshUri called on .git directory path: ' + uri.fsPath)
			return
		}

		const isDir = await vscode.workspace.fs.stat(uri).then((s) => { return s.type === vscode.FileType.Directory })
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

	async refresh(...nodes: WorktreeNode[]) {
		if (nodes.length == 0) {
			await worktreeView.refresh()
		}
		for (const node of nodes) {
			log.info('refreshing node: ' + node?.id)
			await worktreeView.refresh(node)
		}
	}

	async getWorktrees () {
		if (!vscode.workspace.workspaceFolders) {
			throw new Error('No workspace folder open')
		}

		const trees: string[] = await git.worktree.list('--porcelain -z')
			.then((r: any) => {
				const stdout = r.stdout as string
				const trees = stdout.split('\0\0')
				return trees.filter((t) => t.trim().length > 0)
			})
		return trees
	}

	async createWorktree (worktreeName?: string) {
		if (!vscode.workspace.workspaceFolders) {
			throw new Error('No workspace folder open')
		}

		if (!worktreeName) {
			//display an input dialog to get the branch name
			worktreeName = await vscode.window.showInputBox({ prompt: 'Enter the branch name' })
			if (!worktreeName) {
				return
			}
		}

		const worktreesDir = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, '.worktrees')

		if (!dirExists(worktreesDir)) {
			log.info('creating worktrees directory: ' + worktreesDir.fsPath)
			await vscode.workspace.fs.createDirectory(worktreesDir).then(() => {}, (e) => {
				void vscode.window.showErrorMessage('Failed to create worktrees directory: ' + e)
				throw e
			})
		}

		const worktreeUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, '.worktrees', worktreeName)

		//create the worktree
		const relativePath = vscode.workspace.asRelativePath(worktreeUri)
		log.info('git worktree add "' + relativePath + '" (workspacePath=' + vscode.workspace.workspaceFolders[0].uri.fsPath + ')')
		const r = await git.worktree.add('"' + relativePath + '"')
			.then((r: any) => {
				log.info('worktree created for branch: ' + worktreeName)
				return r
			}, (e: any) => {
				if (e.stderr) {
					log.error('Failed to create worktree!\n * stderr="' + e.stderr + '"\n * e.message="' + e.message + '"')
					void vscode.window.showErrorMessage(e.stderr)
				} else {
					log.error('Failed to create worktree: ' + JSON.stringify(e))
					void vscode.window.showErrorMessage('Failed to create worktree! ' + e.message)
				}
				throw e
			})

		log.info('r=' + JSON.stringify(r))
		await this.refresh()
		// await command_refresh(worktreeUri)
		log.info('refresh after create worktree complete!')
		return r
	}

	async deleteWorktree (rootNode: WorktreeRoot) {
		if (rootNode.locked) {
			void vscode.window.showWarningMessage('Worktree is locked and cannot be deleted')
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
		const r = await git.worktree.remove('"' + rootNode.uri.fsPath + '"')
		if (r.stderr) {
			void vscode.window.showErrorMessage('Failed to remove worktree: ' + r.stderr)
			return
		}
		void vscode.window.showInformationMessage('Worktree removed successfully: ' + rootNode.uri.fsPath)
		nodeMaps.tree.splice(nodeMaps.tree.indexOf(rootNode), 1)
		await this.refresh()
	}

	lockWorktree (rootNode: WorktreeRoot, lock: boolean = true) {
		if (rootNode.locked == lock) {
			return
		}

		const action = lock ? 'lock' : 'unlock'
		const emoji = lock ? '🔒' : '🔓'
		let prom: Promise<any>

		if (action === 'lock') {
			prom = git.worktree.lock(rootNode.uri.fsPath)
		} else {
			prom = git.worktree.unlock(rootNode.uri.fsPath)
		}

		return prom.then(() => {
				log.info('successfully ' + action + 'ed ' + emoji + ' worktree: ' + rootNode.uri.fsPath)
			}, (e: any) => {
				let errText = 'Failed to ' + action + ' worktree: ' + e
				if (e.stderr) {
					errText = 'Failed to ' + action + ' ' + emoji + ' worktree: ' + e.stderr
				}
				log.error(errText)
				void vscode.window.showErrorMessage(errText)
				throw e
			})
	}

	unlockWorktree(node: WorktreeRoot) {
		return this.lockWorktree(node, true)
	}

	swapWorktrees (node: WorktreeRoot) {
		return vscode.window.showInformationMessage('Not yet implemented')
	}

	launchWindowForWorktree (node: WorktreeRoot) {
		validateUri(node)
		return vscode.commands.executeCommand('vscode.openFolder', node.uri, { forceNewWindow: true })
	}

	openFile = (node: WorktreeFile) => {
		throw new NotImplementedError('openFile not yet implemented')
	}

	compareWithMergeBase(node: WorktreeFile) {
		throw new NotImplementedError('compareWithMergeBase not yet implemented')
		// command_compareWithMergeBase(node)
	}

	async discardChanges(node: WorktreeNode) {
		if (node instanceof WorktreeFile) {
			log.info('discardChanges uri=' + node.uri?.fsPath)
			const r = await git.clean(node)
			if (!r) {
				return false
			}
			const parent = node.getParent()
			node.dispose()
			worktreeView.updateTree(parent)
			if (parent.children.length == 0) {
				const grandparent = parent.getParent()
				parent.dispose()
				worktreeView.updateTree(grandparent)
			}
			return true
		}
		throw new NotImplementedError('Discard changes not yet implemented for root or group nodes')
	}

	async copyToWorktree(node: WorktreeFile, move = false, worktreeName?: string) {
		validateUri(node)

		let otherRootNodes = getOtherRootNodes(node.getRepoNode())
		if (worktreeName) {
			otherRootNodes = otherRootNodes.filter(n => n.label?.toString() == worktreeName)
		}
		let moveToRoot: WorktreeRoot | undefined

		if (otherRootNodes.length == 0) {
			throw new Error('No other worktrees found')
		}

		if (otherRootNodes.length == 1) {
			moveToRoot = otherRootNodes[0]
		} else {
			const rootNodeIds: vscode.QuickPickItem[] = []
			for (const n of otherRootNodes) {
				rootNodeIds.push({
					label: n.label!.toString(),
					description: "$(repo) path: " + n.uri.fsPath
				})
			}
			const r = await vscode.window.showQuickPick(rootNodeIds, { placeHolder: 'Select target worktree' })
			moveToRoot = otherRootNodes.find(n => n.label?.toString() == r?.label)
			if (!moveToRoot) {
				throw new Error('Failed to find target worktree: ' + r?.label)
			}
		}

		const moveToUri = vscode.Uri.joinPath(moveToRoot.uri, node.relativePath)
		log.info('copying ' + node.uri?.fsPath + ' to ' + moveToUri.fsPath)
		log.info(' --from = ' + node.uri?.fsPath)
		log.info(' --to   = ' + moveToUri.fsPath)
		await vscode.workspace.fs.copy(node.uri, moveToUri, { overwrite: true })
		await this.refresh(moveToRoot)
		const newNode = this.getFileNode(moveToUri)
		await worktreeView.reveal(newNode, { select: false, focus: true })
		log.info('successfully copied file')
		if (move) {
			// delete original file (move only)
			await git.rm(node)
			log.info('completed git rm')
			await this.refresh(node)
		}
	}

	moveToWorktree = (node: WorktreeFile, worktreeName?: string) => {
		return this.copyToWorktree(node, true, worktreeName)
	}

	patchToWorktree(node: WorktreeFile) {
		return command_patchToWorktree(node)
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
		worktreeView.updateTree(repoNode)
	}

	unstage(node: WorktreeNode) { return this.stage(node, "unstage") }

}
