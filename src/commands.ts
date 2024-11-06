import * as vscode from 'vscode'
import { FileGroup, validateUri, WorktreeFile, WorktreeFileGroup, WorktreeNode, WorktreeRoot } from "./worktreeView"
import { getRepo } from './gitFunctions'
import { Repository } from './api/git'
import { log } from './channelLogger'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const gitcli = require('@npmcli/git')

const repomap = new Map<string, Repository>()

function registerCommand(command: string, callback: (node: WorktreeNode) => any) {
	command = 'multi-branch-checkout.' + command
	log.info('registering command: ' + command)
	vscode.commands.registerCommand(command, callback)
	return vscode.commands.registerCommand(command, callback)
	// 	// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
	// 	// log.info('callback=' + callback)
	// 	let p = callback(node)
	// 	if (p instanceof Promise) {
	// 		log.info('p is a promise')
	// 	} else {
	// 		p = Promise.resolve(p)
	// 	}
	// 	log.info('p=' + p)
	// 	// // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	// 	// if (!Promise.
	// 	// 	p = Promise.resolve(p)
	// 	// }


	// 	// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
	// 	return p.then((r: any) => {
	// 		log.info('command completed successfully: ' + command + '(r=' + r + ')')
	// 		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	// 		return r
	// 	}, (e: any) => {
	// 		log.info('p.then error')
	// 		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
	// 		let msgtxt = e
	// 		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	// 		if (e.stderr) {
	// 			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
	// 			msgtxt = e.stderr
	// 		}
	// 		return vscode.window.showWarningMessage('Command ' + command + 'failed!\n' + msgtxt)
	// 			.then(() => { throw e })
	// 	})
	// })
}

export async function command_createWorktree (branchName?: string) {
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
	// log.info('checking if worktree exists: ' + worktreeUri.fsPath)
	// // throw an error if this directory already exists
	// await vscode.workspace.fs.stat(worktreeUri)
	// 	.then((s: vscode.FileStat) => {
	// 		if (s.type == vscode.FileType.Directory) {
	// 			throw new Error('Directory already exists')
	// 		}
	// 		if (s.type == vscode.FileType.File) {
	// 			throw new Error('File already exists')
	// 		}
	// 	}, (e) => {
	// 		if (e.code == 'FileNotFound') {
	// 			log.error('receieved FileNotFound as expected (e=' + e +')')
	// 		} else {
	// 			throw e
	// 		}
	// 	})

	//create the worktree
	const relativePath = vscode.workspace.asRelativePath(worktreeUri)
	log.info('git worktree add -b ' + branchName + ' ' + relativePath + ' (workspacePath=' + vscode.workspace.workspaceFolders[0].uri.fsPath + ')')
	await gitcli.spawn(['worktree', 'add', '-b', branchName, relativePath], { cwd: vscode.workspace.workspaceFolders[0].uri.fsPath })
		.then((r: any) => {
			log.info('worktree created for branch: ' + branchName)
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
	return true
}


export function command_stageNode (node: WorktreeNode, action: 'stage' | 'unstage') {
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

export function command_discardChanges(node: WorktreeNode) {
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


export async function command_patchToWorktree(node: WorktreeFile, rootNodes: WorktreeRoot[]) {
	// first, select a target worktree via a prompt
	// second, create a patch file against merge-base
	// third, apply the patch to the target worktree
	// fourth, (move only) remove the original file from the source worktree

	validateUri(node)

	log.info('patchToWorktree node.id=' + node.id)

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
