import * as vscode from 'vscode'
import { FileGroup, nodeMaps, WorktreeFile, WorktreeFileGroup, WorktreeNode, WorktreeRoot } from "./worktreeNodes"
import { getRepo } from './gitFunctions'
import { Repository } from './@types/git'
import { log } from './channelLogger'
import { NotImplementedError } from './errors'
import { worktreeView } from './extension'
import { validateUri } from './utils'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const gitcli = require('@npmcli/git')

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

	const trees: string[] = await gitcli.spawn(['worktree', 'list', '--porcelain', '-z'], { cwd: vscode.workspace.workspaceFolders[0].uri.fsPath })
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

async function command_createWorktree (branchName?: string) {
	if (!vscode.workspace.workspaceFolders) {
		throw new Error('No workspace folder open')
	}

	if (!branchName) {
		//display an input dialog to get the branch name
		branchName = await vscode.window.showInputBox({ prompt: 'Enter the branch name' })
		if (!branchName) {
			return
		}
	}

	const worktreesDir = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, '.worktrees')
	// create ./.worktrees, if it does not already exist
	await vscode.workspace.fs.stat(worktreesDir)
		.then((s: vscode.FileStat) => {

			if (s.type == vscode.FileType.File) {
				throw new Error('File exists with the name ".worktrees", cannot create directory')
			}
			if (s.type == vscode.FileType.Directory) {
				return Promise.resolve()
			}
			return vscode.workspace.fs.createDirectory(worktreesDir)
		}, (e) => {
			if (e.code == 'FileNotFound') {
				return vscode.workspace.fs.createDirectory(worktreesDir)
			} else {
				throw e
			}
		})

	const worktreeUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, '.worktrees', branchName)

	//create the worktree
	const relativePath = vscode.workspace.asRelativePath(worktreeUri)
	log.info('git worktree add -b ' + branchName + ' ' + relativePath + ' (workspacePath=' + vscode.workspace.workspaceFolders[0].uri.fsPath + ')')
	const r = await gitcli.spawn(['worktree', 'add', '-b', branchName, relativePath], { cwd: vscode.workspace.workspaceFolders[0].uri.fsPath })
		.then((r: any) => {
			log.info('worktree created for branch: ' + branchName)
			return command_refresh()
		}).then(() => {
			return true
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

async function command_lockWorktree (rootNode: WorktreeRoot, lock: boolean) {
	if (rootNode.locked == lock) {
		return
	}

	const action = lock ? 'lock' : 'unlock'
	const emoji = lock ? '🔒' : '🔓'

	return gitcli.spawn(['worktree', action, rootNode.uri.fsPath], { cwd: rootNode.uri.fsPath })
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

async function command_copyToWorktree(node: WorktreeFile, move = false) {
	validateUri(node)
	const rootNodes = nodeMaps.tree

	const rootNodeIds: vscode.QuickPickItem[] = []
	for (const n of rootNodes) {
		if (!n.label) {
			continue
		}
		if (n.uri === node.getRepoUri()) {
			continue
		}
		rootNodeIds.push({
			label: n.label?.toString(),
			description: "$(repo) path: " + n.uri.fsPath
		})
	}
	let moveTo: WorktreeRoot | undefined = undefined
	let moveToUri: vscode.Uri | undefined = undefined

	if (rootNodeIds.length <= 1) {
		throw new Error('No worktrees found for copy destination')
	} else if (rootNodeIds.length == 2) {
		moveTo = rootNodes.find(n => n.label?.toString() != node.getRepoUri().fsPath)
		if (!moveTo) {
			throw new Error('Failed to find target worktree')
		}
		moveToUri = vscode.Uri.joinPath(moveTo.uri, node.uri!.fsPath.replace(node.getRepoUri().fsPath, ''))
		if (!moveToUri) {
			throw new Error('Failed to create target file path')
		}
	} else {

		await vscode.window.showQuickPick(rootNodeIds, { placeHolder: 'Select target worktree' })
			.then((r) => {
				log.info('r1=' + JSON.stringify(r))
				moveTo = rootNodes.find(n => n.label?.toString() == r?.label)
				if (!moveTo) {
					throw new Error('Failed to find target worktree: ' + r?.label)
				}
				moveToUri = vscode.Uri.joinPath(moveTo.uri, node.uri!.fsPath.replace(node.getRepoUri().fsPath, ''))
				log.info('moveToUri=' + moveToUri)
				if (!moveToUri) {
					throw new Error('Failed to create target file path: ' + moveToUri)
				}
				log.info('copying ' + node.uri?.fsPath + ' to ' + moveToUri.fsPath)
			}, (e: unknown) => {
				log.error('e=' + JSON.stringify(e))
				throw e
			})
	}
	if (!moveToUri) {
		throw new Error('Failed to find target worktree')
	}
	return await vscode.workspace.fs.copy(node.uri!, moveToUri, { overwrite: true })
		.then((r: any) => {
			log.info('r2=' + JSON.stringify(r,null,2))
			log.info('successfully copied file')
			if (move) {
				// delete original file (move only)
				return gitcli.spawn(['rm', node.uri?.fsPath], { cwd: node.getRepoUri().fsPath })
			}
			return Promise.resolve('copy only')
		}).then((r: any) => {
			log.info('r4=' + JSON.stringify(r,null,2))
			if (r == 'copy only') {
				return moveToUri
			}
			log.info('r=' + JSON.stringify(r,null,2))
			log.info('successfully moved ' + node.uri?.fsPath + ' to ' + moveTo!.uri.fsPath)
			return moveToUri
		}, (e: any) => {
			const moveType = move ? 'move' : 'copy'
			if (e.stderr) {
				log.error('error: ' + e.stderr)

				throw new Error('Failed to ' + moveType + ' file: ' + e.stderr)
			}
			log.error('error: ' + e.stderr)
			throw new Error('Failed to move ' + moveType + ' : ' + e.stderr)
		})
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
function copyToWorktree(node: WorktreeFile) { command_copyToWorktree(node, false) }
function moveToWorktree(node: WorktreeFile) { command_copyToWorktree(node, true) }
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
	copyToWorktree = copyToWorktree
	moveToWorktree = moveToWorktree
	patchToWorktree = patchToWorktree
	stageNode = stageNode
	unstageNode = unstageNode
	compareWithMergeBase = compareWithMergeBase

}
