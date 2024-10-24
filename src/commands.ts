import * as vscode from 'vscode'
import { FileGroup, validateUri, WorktreeFile, WorktreeFileGroup, WorktreeNode, WorktreeRoot } from "./worktreeView"
import { getMergeBaseGitUri, getRepo, git, git_toGitUri } from './gitFunctions'
import { Repository } from './api/git'

// TODO - remove me
//eslint-disable-next-line @typescript-eslint/no-var-requires
const gitcli = require('@npmcli/git')

const repomap = new Map<string, Repository>()

function registerCommand(command: string, callback: (node: WorktreeNode) => any) {
	command = 'multi-branch-checkout.' + command
	console.log('registering command: ' + command)
	vscode.commands.registerCommand(command, callback)
	return vscode.commands.registerCommand(command, callback)
	// 	// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
	// 	// console.log('callback=' + callback)
	// 	let p = callback(node)
	// 	if (p instanceof Promise) {
	// 		console.log('p is a promise')
	// 	} else {
	// 		p = Promise.resolve(p)
	// 	}
	// 	console.log('p=' + p)
	// 	// // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	// 	// if (!Promise.
	// 	// 	p = Promise.resolve(p)
	// 	// }


	// 	// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
	// 	return p.then((r: any) => {
	// 		console.log('command completed successfully: ' + command + '(r=' + r + ')')
	// 		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	// 		return r
	// 	}, (e: any) => {
	// 		console.log('p.then error')
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

export function command_stageNode (node: WorktreeNode, action: 'stage' | 'unstage') {
	if (!(node instanceof WorktreeFile) && !(node instanceof WorktreeFileGroup)) {
		throw new Error('Invalid node type: only Files and FileGroups can be staged')
	}

	return getRepo(node).then((repo) => {
		console.log('repo.rootUri=' + repo.rootUri)

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
			console.log('stage files: ' + JSON.stringify(addList))
			return repo.add(addList)
		}
		console.log('unstage files: ' + JSON.stringify(addList))
		return repo.revert(addList)
	})
}

export function command_discardChanges(node: WorktreeNode) {
	if (node instanceof WorktreeFile) {
		console.log('git.clean uri=' + node.uri?.fsPath)
		if (!node.uri) {
			throw new Error('discardChanges failed for uri=' + node.uri)
		}

		return getRepo(node)
			.then((repo) => {
				console.log('command git.clean ----- start -----')
				return repo.clean([node.uri!.fsPath])
			}).then(() => {
				console.log('command git.clean -----  end  -----')
				const p = node.getParent()
				if (p) {
					p.removeChild(node)
				}
				return node
			}, (e: unknown) => {
				console.error('git.clean error (e=' + e + ')')
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

	console.log('patchToWorktree node.id=' + node.id)

	const rootNodeIds: vscode.QuickPickItem[] = []
	for (const n of rootNodes) {
		if (!n.label) {
			continue
		}
		if (n.uri === node.getRepoUri()) {
			continue
		}
		console.log('label=' + n.label)
		rootNodeIds.push({
			label: n.label?.toString(),
			description: "$(repo) path: " + n.uri.fsPath
		})
	}

	// first, select a target worktree via a prompt
	const moveToNode = await vscode.window.showQuickPick(rootNodeIds, { placeHolder: 'Select target worktree' })
		.then((r) => { return rootNodes.find(n => n.label?.toString() == r?.label) })
	console.log('moveToNode.id=' + moveToNode?.id)

	if (!moveToNode) {
		throw new Error('Failed to find repo for quickpick selection')
	}
	const repoTo = await getRepo(moveToNode)

	const repoFrom = await getRepo(node)

	console.log('node.getFileGroup()=' + node.getFileGroup())

	let patch: string = ''
	if (node.getFileGroup() == FileGroup.Staged) {
		patch = await repoFrom.diffIndexWithHEAD(node.uri!.fsPath)
	} else if (node.getFileGroup() == FileGroup.Changes || node.getFileGroup() == FileGroup.Untracked) {
		patch = await repoFrom.diffIndexWith('~',node.uri!.fsPath)
			.then((r) => { return r	}, (e) => {
				console.error('diffIndexWith error: ' + e)
				return ''
			})
		if (patch.length == 0) {
			patch = await repoFrom.diffWithHEAD(node.uri!.fsPath)
		}
	}

	console.log('writePatchToFile patch=' + patch)
	await vscode.workspace.fs.writeFile(vscode.Uri.file('C:/temp/patch'), Buffer.from(patch))

	await repoTo.apply('C:/temp/patch').then(() => {
		console.log('patch apply successful')
	}, (e) => {
		console.error('patch apply error: ' + e)
	})

	// create patch
	// return git.spawn(['diff', '-p', '--merge-base', '--fork-point', '--', node.uri?.fsPath], { cwd: node.getRepoUri().fsPath })
	// 	.then((r: any) => {
	// 		console.log('r2=' + JSON.stringify(r,null,2))
	// 		// apply patch
	// 		return git.spawn(['apply', '-'], { cwd: moveTo!.uri.fsPath, stdin: r.stdout })
	// 	}).then((r: any) => {
	// 		console.log('r3=' + JSON.stringify(r,null,2))
	// 		console.log('successfully applied patch')
	// 		if (move) {
	// 			// delete original file (move only)
	// 			return git.spawn(['rm', node.uri?.fsPath], { cwd: node.getRepoUri().fsPath })
	// 		}
	// 		return Promise.resolve('copy only')
	// 	}).then((r: any) => {
	// 		console.log('r4=' + JSON.stringify(r,null,2))
	// 		if (r == 'copy only') {
	// 			return
	// 		}
	// 		console.log('r=' + JSON.stringify(r,null,2))
	// 		console.log('successfully moved ' + node.uri?.fsPath + ' to ' + moveTo!.uri.fsPath)
	// 	}, (e: any) => {

	// 		if (e.stderr) {
	// 			console.error('error: ' + e.stderr)
	// 			throw new Error('Failed to move file: ' + e.stderr)
	// 		}
	// 	})
		// .then((r: any) => {
		// 	console.log('r=' + JSON.stringify(r,null,2))
		// 	return vscode.workspace.fs.writeFile(patchFile, Buffer.from(r.stdout))
		// })
		// .then(() => {
		// 	return git.spawn(['apply', patchFile.fsPath], { cwd: node.getRepoUri().fsPath })
		// })
		// .then((r: any) => {
		// 	console.log('r=' + JSON.stringify(r,null,2))
		// 	return vscode.workspace.fs.delete(patchFile)
		// })
}
