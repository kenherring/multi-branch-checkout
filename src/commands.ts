import * as vscode from 'vscode'
import { FileGroup, nodeMaps, WorktreeFile, WorktreeFileGroup, WorktreeNode, WorktreeRoot } from "./worktreeNodes"
import { getRepo } from './gitFunctions'
import { Repository } from './@types/git'
import { log } from './channelLogger'
import { NotImplementedError } from './errors'
import { worktreeView } from './extension'
import { dirExists, validateUri } from './utils'
import util from 'util'
import child_process from 'child_process'
const exec = util.promisify(child_process.exec)

const repomap = new Map<string, Repository>()

export function command_launchWindowForWorktree (node: WorktreeRoot) {
	validateUri(node)
	return vscode.commands.executeCommand('vscode.openFolder', node.uri, { forceNewWindow: true })
}

function command_refresh (node?: WorktreeNode) {
	if (! worktreeView) {
		throw new Error('worktreeView is not defined')
	}
	if (!node) {
		log.info('refreshing tree...')
		return worktreeView.refresh()
	}
	log.info('refreshing node: ' + node.id)
	return worktreeView.refresh(node)
}

export async function command_getWorktrees () {
	if (!vscode.workspace.workspaceFolders) {
		throw new Error('No workspace folder open')
	}

	const trees: string[] = await exec('git worktree list --porcelain -z', { cwd: vscode.workspace.workspaceFolders[0].uri.fsPath })
		.then((r: any) => {
			const stdout = r.stdout as string
			const trees = stdout.split('\0\0')
			return trees
		}, (e: unknown) => {
			log.error('e=' + JSON.stringify(e,null,2))
			throw e
		})
	return trees
}

async function command_createWorktree (worktreeName?: string) {
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
		await vscode.workspace.fs.createDirectory(worktreesDir).then(undefined, (e) => {
			vscode.window.showErrorMessage('Failed to create worktrees directory: ' + e)
			throw e
		})
	}

	const worktreeUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, '.worktrees', worktreeName)

	//create the worktree
	const relativePath = vscode.workspace.asRelativePath(worktreeUri)
	log.info('git worktree add "' + relativePath + '" (workspacePath=' + vscode.workspace.workspaceFolders[0].uri.fsPath + ')')
	const r = await exec('git worktree add "' + relativePath + '"', { cwd: vscode.workspace.workspaceFolders[0].uri.fsPath })
		.then((r: any) => {
			log.info('worktree created for branch: ' + worktreeName)
		}, (e: any) => {
			if (e.stderr) {
				log.error('Failed to create worktree!\n * stderr="' + e.stderr + '"\n * e.message="' + e.message + '"')
				vscode.window.showErrorMessage(e.stderr)
			} else {
				log.error('Failed to create worktree: ' + JSON.stringify(e))
				vscode.window.showErrorMessage('Failed to create worktree! ' + e.message)
			}
			throw e
		})
	log.info('r=' + JSON.stringify(r))
	await command_refresh()
	// await command_refresh(worktreeUri)
	log.info('refresh after create worktree')
	return r
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
	return await exec('git worktree remove "' + rootNode.uri.fsPath + '"', { cwd: vscode.workspace.workspaceFolders![0].uri.fsPath })
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

async function command_lockWorktree (rootNode: WorktreeRoot, lock: boolean) {
	if (rootNode.locked == lock) {
		return
	}

	const action = lock ? 'lock' : 'unlock'
	const emoji = lock ? '🔒' : '🔓'

	return exec('git worktree ' + action + ' ' + rootNode.uri.fsPath, { cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath })
			.then(() => {
				log.info('successfully ' + action + 'ed ' + emoji + ' worktree: ' + rootNode.uri.fsPath)
			}, (e: any) => {
				let errText = 'Failed to ' + action + ' worktree: ' + e
				if (e.stderr) {
					errText = 'Failed to ' + action + ' ' + emoji + ' worktree: ' + e.stderr
				}
				log.error(errText)
				vscode.window.showErrorMessage(errText)
				throw e
			})
}

async function command_swapWorktrees (node: WorktreeRoot) {
	vscode.window.showInformationMessage('Not yet implemented')
}

function command_stageNode (node: WorktreeNode, action: 'stage' | 'unstage') {
	if (!(node instanceof WorktreeFile) && !(node instanceof WorktreeFileGroup)) {
		throw new Error('Invalid node type: only Files and FileGroups can be staged')
	}

	return getRepo(node).then((repo) => {
		log.info('repo.rootUri=' + repo.rootUri)

		const addList: string[] = []
		if (node instanceof WorktreeFile) {
			if (node.uri) {
				addList.push(node.uri.fsPath)
			}
		} else if(node instanceof WorktreeFileGroup) {
			for (const child of node.children) {
				if (child instanceof WorktreeFile && child.uri) {
					addList.push(child.uri.fsPath)
				}
			}
		}

		if (action === 'stage') {
			log.info('stage files: ' + JSON.stringify(addList))
			return repo.add(addList)
		}
		log.info('unstage files: ' + JSON.stringify(addList))
		return repo.revert(addList)
	})
}

function command_discardChanges(node: WorktreeNode) {
	if (node instanceof WorktreeFile) {
		log.info('git.clean uri=' + node.uri?.fsPath)
		if (!node.uri) {
			throw new Error('discardChanges failed for uri=' + node.uri)
		}

		return getRepo(node)
			.then((repo) => {
				log.info('command git.clean ----- start -----')
				return repo.clean([node.uri!.fsPath])
			}).then(() => {
				log.info('command git.clean -----  end  -----')
				const p = node.getParent()
				if (p) {
					p.removeChild(node)
				}
				return node
			}, (e: unknown) => {
				log.error('git.clean error (e=' + e + ')')
				throw e
			})
	}
	throw new NotImplementedError('Discard changes not yet implemented for root or group nodes')
}

async function command_copyToWorktree(node: WorktreeFile, move = false, worktreeName?: string) {
	log.info('300')
	validateUri(node)
	log.info('301')
	const rootNodes = nodeMaps.tree
	log.info('302')

	const rootNodeIds: vscode.QuickPickItem[] = []
	log.info('303')
	for (const n of rootNodes) {
		log.info('304 n=' + n.id)
		if (!n.label) {
			continue
		}
		log.info('305')
		if (n.uri === node.getRepoUri()) {
			continue
		}
		log.info('306')
		rootNodeIds.push({
			label: n.label?.toString(),
			description: "$(repo) path: " + n.uri.fsPath
		})
		log.info('307')
	}
	log.info('308')
	let moveTo: WorktreeRoot | undefined = undefined
	let moveToUri: vscode.Uri | undefined = undefined

	log.info('309 rootNodeIds.lenght=' + rootNodeIds.length)
	if (rootNodeIds.length < 1) {
		log.info('310')
		log.notificationWarning("No worktrees found for copy destination")
		throw new Error('No worktrees found for copy destination')
	}

	if (worktreeName) {
		moveTo = rootNodes.find(n => n.label?.toString() == worktreeName)
		if (!moveTo) {
			throw new Error('Failed to find target worktree: ' + worktreeName)
		}
		moveToUri = vscode.Uri.joinPath(moveTo.uri, node.uri!.fsPath.replace(node.getRepoUri().fsPath, ''))
	} else if (rootNodeIds.length == 1) {
		log.info('311')
		moveTo = rootNodes.find(n => n.label?.toString() != node.getRepoUri().fsPath)
		if (!moveTo) {
			throw new Error('Failed to find target worktree')
		}

		log.info('312')
		moveToUri = vscode.Uri.joinPath(moveTo.uri, node.uri!.fsPath.replace(node.getRepoUri().fsPath, ''))
		if (!moveToUri) {
			throw new Error('Failed to create target file path')
		}
		log.info('313')
	} else {
		log.info('314')
		await vscode.window.showQuickPick(rootNodeIds, { placeHolder: 'Select target worktree' })
			.then((r) => {
				log.info('315')
				log.info('r1=' + JSON.stringify(r))
				moveTo = rootNodes.find(n => n.label?.toString() == r?.label)
				log.info('316')
				if (!moveTo) {
					throw new Error('Failed to find target worktree: ' + r?.label)
				}
				log.info('317')
				moveToUri = vscode.Uri.joinPath(moveTo.uri, node.uri!.fsPath.replace(node.getRepoUri().fsPath, ''))
				log.info('318')
				log.info('moveToUri=' + moveToUri)
				log.info('319')
				if (!moveToUri) {
					throw new Error('Failed to create target file path: ' + moveToUri)
				}
				log.info('320')
				log.info('copying ' + node.uri?.fsPath + ' to ' + moveToUri.fsPath)
			}, (e: unknown) => {
				log.info('321')
				log.error('e=' + JSON.stringify(e))
				throw e
			})
			log.info('322')
	}
	log.info('322')
	if (!moveToUri) {
		log.info('323')
		throw new Error('Failed to assign target worktree')
	}
	log.info('324')
	log.info(' --from = ' + node.uri?.fsPath)
	log.info(' --to   = ' + moveToUri.fsPath)
	const r = await vscode.workspace.fs.copy(node.uri!, moveToUri, { overwrite: true })
	log.info('325')
	log.info('r=' + JSON.stringify(r,null,2))
	log.info('successfully copied file')
	if (move) {
		log.info('326')
		// delete original file (move only)
		await exec('git rm ' +  node.uri?.fsPath, { cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath })
		log.info('327')
		log.info('completed git rm')
	}
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
	const repoTo = await getRepo(moveToNode)

	const repoFrom = await getRepo(node)

	log.info('node.getFileGroup()=' + node.getFileGroup())

	let patch: string = ''
	if (node.getFileGroup() == FileGroup.Staged) {
		patch = await repoFrom.diffIndexWithHEAD(node.uri!.fsPath)
	} else if (node.getFileGroup() == FileGroup.Changes || node.getFileGroup() == FileGroup.Untracked) {
		patch = await repoFrom.diffIndexWith('~',node.uri!.fsPath)
			.then((r) => { return r	}, (e) => {
				log.error('diffIndexWith error: ' + e)
				return ''
			})
		if (patch.length == 0) {
			patch = await repoFrom.diffWithHEAD(node.uri!.fsPath)
		}
	}

	log.info('writePatchToFile patch=' + patch)
	await vscode.workspace.fs.writeFile(vscode.Uri.file('C:/temp/patch'), Buffer.from(patch))

	await repoTo.apply('C:/temp/patch').then(() => {
		log.info('patch apply successful')
	}, (e) => {
		log.error('patch apply error: ' + e)
	})

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

function getNodes(uri: vscode.Uri) { return nodeMaps.getNodes(uri) }
function getNode(uri: vscode.Uri) { return nodeMaps.getNode(uri) }
function getFileNode(uri: vscode.Uri) { return nodeMaps.getFileNode(uri) }
function lockWorktree(node: WorktreeRoot) { command_lockWorktree(node, false) }
function unlockWorktree(node: WorktreeRoot) { command_lockWorktree(node, true) }
function patchToWorktree(node: WorktreeFile) { command_patchToWorktree(node) }
function stageNode(node: WorktreeNode) { command_stageNode(node, "stage") }
function unstageNode(node: WorktreeNode) { command_stageNode(node, "unstage") }
function compareWithMergeBase(node: WorktreeFile) {
	throw new NotImplementedError('compareWithMergeBase not yet implemented')
	// command_compareWithMergeBase(node)
}

export class MultiBranchCheckoutAPI {
	getWorktreeView() { return worktreeView }
	getNodes = getNodes
	getNode = getNode
	getFileNode = getFileNode
	refresh = command_refresh

	getWorktrees = command_getWorktrees
	createWorktree = command_createWorktree
	deleteWorktree = command_deleteWorktree
	lockWorktree = lockWorktree
	unlockWorktree = unlockWorktree
	swapWorktrees = command_swapWorktrees
	launchWindowForWorktree = command_launchWindowForWorktree

	discardChanges = command_discardChanges
	copyToWorktree = (node: WorktreeFile, worktreeName?: string) => { return command_copyToWorktree(node, false, worktreeName) }
	moveToWorktree = (node: WorktreeFile, worktreeName?: string) => { return command_copyToWorktree(node, true, worktreeName)  }
	patchToWorktree = patchToWorktree
	stageNode = stageNode
	unstageNode = unstageNode
	compareWithMergeBase = compareWithMergeBase

}
