import * as vscode from 'vscode'
import { FileGroup, WorktreeFile, WorktreeFileGroup, WorktreeRoot } from './worktreeNodes'
import { GitExtension, Repository, Status } from './@types/git.d'
import { log } from './channelLogger'
import util from 'util'
import child_process from 'child_process'
const exec = util.promisify(child_process.exec)

const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')?.exports
if (!gitExtension) {
	throw new Error('Git extension not found')
}
export const git = gitExtension.getAPI(1)

const repomap = new Map<string, Repository>()

export function gitExec (args: string) {
	const command = 'git ' + args
	log.info('executing: ' + command)
	return exec(command, { cwd: vscode.workspace.workspaceFolders![0].uri.fsPath })
		.then((r: any) => {
			log.debug('success! (' + command + ')')
			return r
		}, (e: any) => {
			log.error('e=' + JSON.stringify(e, null, 2))
			if (e.stderr) {
				vscode.window.showErrorMessage(e.stderr)
				return
			}
			vscode.window.showErrorMessage(e)
			throw e
		})
}

export function git_toGitUri(uri: vscode.Uri, ref: string = '') {
	// ref == '~': staged
	// ref == '': working tree
	return git.toGitUri(uri, ref)
}

export function getRepo(node: WorktreeFile | WorktreeFileGroup | WorktreeRoot) {
	// const repo: Repository | undefined | null = repomap.get(node.getRepoUri().fsPath)
	// if (repo) {
	// 	log.info('found repo in map (repo.rootUri=' + repo.rootUri + ', node.id=' + node.id + ')')
	// 	return Promise.resolve(repo)
	// }

	log.info('getRepo1 node=' + node)

	// no repo found in map
	if (!node.uri) {
		throw new Error('Invalid file path for node.id=' + node.id)
	}

	log.info('getRepo2 node.id=' + node.id + '; node.contextValue=' + node.contextValue)
	let uri = node.uri
	if (node.contextValue?.startsWith('WorktreeRoot') || node.contextValue?.startsWith('WorktreePrimary')) {
		log.info('getRepo3 node is WorktreeRoot')
		uri = vscode.Uri.joinPath(node.uri, '.git')
	}
	uri = git_toGitUri(uri)
	log.info('getRepo4 uri=' + uri)
	const repo = git.getRepository(uri)
	if (!repo) {
		log.error('Failed to get repository for ' + uri.fsPath + '; attempting openRepository')
		// throw new Error('Failed to open repository: ' + node.getRepoUri().fsPath)
	} else {
		log.info('found repo: ' + repo.rootUri.fsPath + ' for ' + node.uri)
		return Promise.resolve(repo)
	}
	return git.openRepository(node.getRepoUri()).then((repo) => {
		if (repo) {
			return repo
		}
		throw new Error('Failed to open repository: ' + node.getRepoUri().fsPath)
	})
}

export function getMergeBaseGitUri(node: WorktreeFile) {
	if (!node.uri) {
		throw new Error('Invalid file path')
	}
	return getMergeBase(node).then((ref) => {
		log.info('ref=' + ref)
		if (!ref) {
			throw new Error('Failed to get merge base commit id')
		}
		return git.toGitUri(node.uri!, ref)
	})
}

export function getMergeBase(node: WorktreeFile) {
	// TODO default branch
	log.info('getMergeBaseGitUri node.id=' + node.id + '; repoUri=' + node.getRepoUri().fsPath)
	if (!git) {
		throw new Error('Git extension not found')
	}
	if (!node.uri) {
		throw new Error('Invalid file path for node.id=' + node.id)
	}
	const repo = git.getRepository(node.uri)
	if (!repo) {
		throw new Error('Failed to open repository: ' + node.getRepoUri().fsPath)
	}
	log.info('repo.getMergeBase')
	return repo.getMergeBase('--fork-point', 'HEAD')
}

export async function getStatus(wt: WorktreeRoot) {
	log.info('git status --porcelain -z (in ' + wt.uri.fsPath + ')')

	const repo = await getRepo(wt)
	log.info('repo=' + repo.rootUri.fsPath)
	await repo.status()

	const newFiles: WorktreeFile[] = []

	for (const c of repo.state.indexChanges) {
		let state = ''
		if (c.status == Status.DELETED) {
			state = 'D'
		}
		const fg =  wt.getFileGroupNode(FileGroup.Staged)
		const existingNode = fg?.children.find((n) => n.uri?.fsPath == c.uri.fsPath) as WorktreeFile
		if (!existingNode) {
			log.info('create node (1) for ' + c.uri.fsPath + ' ' + wt.uri.fsPath)
			newFiles.push(new WorktreeFile(c.uri, fg, state))
		} else {
			existingNode.state = state
		}
	}

	for (const c of repo.state.workingTreeChanges) {
		let state = ''
		if (c.status == Status.DELETED) {
			state = 'D'
		}
		const fg = wt.getFileGroupNode(FileGroup.Changes)
		const existingNode = fg?.children.find((n) => n.uri?.fsPath == c.uri.fsPath) as WorktreeFile
		if (!existingNode) {
			log.info('create node (2) for ' + c.uri.fsPath + ' ' + wt.uri.fsPath)
			newFiles.push(new WorktreeFile(c.uri, fg, state))
		} else {
			existingNode.state = state
		}
	}

	for (const c of repo.state.untrackedChanges) {
		let state = ''
		if (c.status == Status.DELETED) {
			state = 'D'
		}
		const fg = wt.getFileGroupNode(FileGroup.Untracked)
		const existingNode = fg?.children.find((n) => n.uri?.fsPath == c.uri.fsPath) as WorktreeFile
		if (!existingNode) {
			log.info('create node (3) for ' + c.uri.fsPath + ' ' + wt.uri.fsPath)
			newFiles.push(new WorktreeFile(c.uri, fg, state))
		} else {
			existingNode.state = state
		}
	}
	return newFiles
}

export async function revertChange(node: WorktreeFile) {
	log.info('499')
	const repo = await getRepo(node)
	log.info('401 ' + repo.rootUri.fsPath)
	log.info('reverting changes in ' + node.uri!.fsPath)
	await repo.revert([node.uri!.fsPath]).then(() => {
		log.info('402 reverted changes in ' + node.uri!.fsPath)
	})
}
