import * as vscode from 'vscode'
import { WorktreeFile } from './worktreeView'
import { GitErrorCodes, GitExtension, Repository } from './api/git'

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

export function getRepo(node: WorktreeFile) {
	const repo = repomap.get(node.getRepoUri().fsPath) || git.getRepository(node.getRepoUri())
	if (repo) {
		return repo
	}
	throw new Error('Repository not found for uri=' + node.getRepoUri())
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
	const repo = getRepo(node)
	console.log('repo.getMergeBase')
	return repo.getMergeBase('--fork-point', 'HEAD')
}
