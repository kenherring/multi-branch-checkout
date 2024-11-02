import * as vscode from 'vscode'
import { FileGroup, WorktreeFile, WorktreeFileGroup, WorktreeRoot } from './worktreeView'
import { GitExtension, Repository, Status } from './api/git'

const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')?.exports
if (!gitExtension) {
	throw new Error('Git extension not found')
}
export const git = gitExtension.getAPI(1)

const repomap = new Map<string, Repository>()

export function git_toGitUri(uri: vscode.Uri, ref: string = '') {
	// ref == '~': staged
	// ref == '': working tree
	return git.toGitUri(uri, ref)
}

export function getRepo(node: WorktreeFile | WorktreeFileGroup | WorktreeRoot) {
	const repo: Repository | undefined | null = repomap.get(node.getRepoUri().fsPath)
	if (repo) {
		console.log('found repo in map (repo.rootUri=' + repo.rootUri + ', node.id=' + node.id + ')')
		return Promise.resolve(repo)
	}

	// no repo found in map
	console.log('create repo obj for ' + node.getRepoUri().fsPath + ' (node.id=' + node.id + ')')
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
		console.log('ref=' + ref)
		if (!ref) {
			throw new Error('Failed to get merge base commit id')
		}
		return git.toGitUri(node.uri!, ref)
	})
}

export function getMergeBase(node: WorktreeFile) {
	// TODO default branch
	console.log('getMergeBaseGitUri node.id=' + node.id + '; repoUri=' + node.getRepoUri().fsPath)
	if (!git) {
		throw new Error('Git extension not found')
	}
	return getRepo(node).then((repo) => {
		console.log('repo.getMergeBase')
		return repo.getMergeBase('--fork-point', 'HEAD')
	})
}

export async function getStatus(wt: WorktreeRoot) {
	console.log('git status --porcelain -z (in ' + wt.uri.fsPath + ')')

	const repo = await getRepo(wt)
	await repo.status()

	const newFiles: WorktreeFile[] = []

	for (const c of repo.state.indexChanges) {
		let state = ''
		if (c.status == Status.DELETED) {
			state = 'D'
		}
		newFiles.push(new WorktreeFile(c.uri, wt.getFileGroupNode(FileGroup.Staged), state))
	}

	for (const c of repo.state.workingTreeChanges) {
		let state = ''
		if (c.status == Status.DELETED) {
			state = 'D'
		}
		newFiles.push(new WorktreeFile(c.uri, wt.getFileGroupNode(FileGroup.Changes), state))
	}

	for (const c of repo.state.untrackedChanges) {
		newFiles.push(new WorktreeFile(c.uri, wt.getFileGroupNode(FileGroup.Untracked), ''))
	}
	return newFiles
}
