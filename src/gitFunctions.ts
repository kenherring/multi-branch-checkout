import * as vscode from 'vscode'
import { FileGroup, WorktreeFile, WorktreeFileGroup, WorktreeRoot } from './worktreeNodes'
import { GitExtension, Status } from './@types/git.d'
import { log } from './channelLogger'
import util from 'util'
import child_process from 'child_process'
import path from 'path'
import { NotImplementedError } from './errors'
const exec = util.promisify(child_process.exec)

const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')?.exports
if (!gitExtension) {
	throw new Error('Git extension not found')
}
const gitAPI = gitExtension.getAPI(1)

function gitExec (args: string, repoRoot?: vscode.Uri) {
	if (!repoRoot) {
		repoRoot = vscode.workspace.workspaceFolders![0].uri
	}
	const command = 'git ' + args
	log.info('executing: ' + command + ' (in ' + repoRoot.fsPath + ')')
	return exec(command, { cwd: repoRoot.fsPath })
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

export function toGitUri(uri: vscode.Uri, ref: string = '') {
	// ref == '~': staged
	// ref == '': working tree
	return gitAPI.toGitUri(uri, ref)
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
		return gitAPI.toGitUri(node.uri, ref)
	})
}

export function getMergeBase(node: WorktreeFile) {
	// TODO default branch
	log.info('getMergeBaseGitUri node.id=' + node.id + '; repoUri=' + node.getRepoUri().fsPath)
	if (!node.uri) {
		throw new Error('Invalid file path for node.id=' + node.id)
	}
	const repo = gitAPI.getRepository(node.uri)
	if (!repo) {
		throw new Error('Failed to open repository: ' + node.getRepoUri().fsPath)
	}
	log.info('repo.getMergeBase')
	return repo.getMergeBase('--fork-point', 'HEAD')
}

function getStateFromChar(status: string) {
	switch (status) {
		case 'M':
			return Status.MODIFIED
		case 'A':
			return Status.INDEX_ADDED
		case 'D':
			return Status.DELETED
		case 'R':
			return Status.INDEX_RENAMED
		case 'C':
			return Status.INDEX_COPIED
		case '?':
			return Status.UNTRACKED
		case '!':
			return Status.IGNORED
		default:
			throw new Error('Unknown status: ' + status)
	}
}

// https://github.com/microsoft/vscode/blob/8869a4eca90a111abac23d99b400b156390ed8f0/extensions/git/src/commands.ts#L1911
function cleanMessage (nodes: WorktreeFile[]) {

	const untrackedCount = (nodes.filter((n) => n.group == FileGroup.Untracked)).length
	let message: string
	// let yes: string = vscode.l10n.t('Discard Changes')
	let yes: string = 'Discard Changes'
	if (nodes.length === 1) {
		if (untrackedCount > 0) {
			// const message = vscode.l10n.t('Are you sure you want to DELETE {0}?\nThis is IRREVERSIBLE!\nThis file will be FOREVER LOST if you proceed.', path.basename(untrackedUris[0].fsPath))
			// const yes = vscode.l10n.t('Delete file')
			message = 'Are you sure you want to DELETE {0}?\nThis is IRREVERSIBLE!\nThis file will be FOREVER LOST if you proceed.'
			yes = 'Delete file'
		} else if (nodes[0].state === 'D') {
			// yes = l10n.t('Restore file')
			// message = l10n.t('Are you sure you want to restore {0}?', path.basename(scmResources[0].resourceUri.fsPath));
			yes = 'Restore file'
			message = 'Are you sure you want to restore {0}?'
		} else {
			// message = l10n.t('Are you sure you want to discard changes in {0}?', path.basename(scmResources[0].resourceUri.fsPath))
			message = 'Are you sure you want to discard changes in {0}?'
		}
	} else {
		if (nodes.every((n) => n.state === 'D')) {
			// 	yes = l10n.t('Restore files');
			// 	message = l10n.t('Are you sure you want to restore {0} files?', scmResources.length);
			yes = 'Restore files'
			message = 'Are you sure you want to restore {0} files?'
		} else {
			// 	message = l10n.t('Are you sure you want to discard changes in {0} files?', scmResources.length);
			message = 'Are you sure you want to discard changes in {0} files?'
		}

		if (untrackedCount > 0) {
			// message = `${message}\n\n${l10n.t('This will DELETE {0} untracked files!\nThis is IRREVERSIBLE!\nThese files will be FOREVER LOST.', untrackedCount)}`;
			message = `${message}\n\n${'This will DELETE {0} untracked files!\nThis is IRREVERSIBLE!\nThese files will be FOREVER LOST.'}`
		}
	}
	log.info('message="' + message + '"')
	return vscode.window.showWarningMessage(message, { modal: true }, yes)
}

export namespace git {

	export const status = async (wt: WorktreeRoot) => {
		const r = await gitExec('status --porcelain -z', wt.uri)
			.then((r) => { return r }
			, (e: any) => {
				log.info('620')
				if (e.stderr == '' && e.stdout == '') {
					log.info('621')
					return []
				}
				log.info('622')
				throw e
			})
		log.info('600')
		const newFiles: WorktreeFile[] = []
		log.info('601')
		const lines: string[] = r.stdout.split('\0')
		log.info('602')
		for (const l of lines) {
			log.info('603')
			if (l == '') {
				continue
			}
			log.info('604 line=' + l)
			const statusStaged = l.substring(0, 1)
			log.info('605 statusStaged=' + statusStaged)
			const statusChanged = l.substring(1, 2)
			log.info('606 statusChanged=' + statusChanged)
			const path = l.substring(3)
			log.info('607')

			let status: string | undefined = undefined
			let wg: WorktreeFileGroup | undefined = undefined
			if (statusStaged == '?' && statusChanged == '?') {
				log.info('608 UNTRACKED')
				wg = wt.getFileGroupNode(FileGroup.Untracked)
				status = 'A'
			} else if (statusStaged.trim() != '') {
				log.info('608 STAGED')
				wg = wt.getFileGroupNode(FileGroup.Staged)
				status = statusStaged
			} else if (statusChanged.trim() != '') {
				log.info('609 CHANGED')
				wg = wt.getFileGroupNode(FileGroup.Changes)
				status = statusChanged
			}
			log.info('610')
			if (wg && status) {
				log.info('611 path=' + path + ' ' + wg.label)
				const existing = wg.children.find((f) => f.uri?.fsPath == vscode.Uri.joinPath(wt.uri, path).fsPath)
				log.info('612 existing.id=' + existing?.id)
				if (!existing) {
					log.info('613 create new file ' + path)
					newFiles.push(new WorktreeFile(vscode.Uri.joinPath(wt.uri, path), wg, status))
				}
			}
			log.info('612')
		}
		log.info('613 newFiles.length=' + newFiles.length)
		return newFiles
	}

	export const clean = async (...nodes: WorktreeFile[]) => {
		const paths: string[] = []
		for (const node of nodes) {
			paths.push(node.uri.fsPath)
		}
		// assume all nodes are in the same repo
		const repoRoot = nodes[0].getRepoNode()
		log.info('clean changes in ' + nodes.length + ' files')

		const r = await cleanMessage(nodes)
		log.info('r=' + r)
		if (!r) {
			log.info('clean cancelled')
			return false
		}

		await gitExec('clean -f ' + paths.join(' '), repoRoot.uri)
		log.info('cleaned changes in ' + paths)
		return true
	}

	export const add = (...nodes: WorktreeFile[]) => {
		const paths: string[] = []
		for (const node of nodes) {
			paths.push(node.uri.fsPath)
		}
		return gitExec('add ' + paths.join(' '), nodes[0].getRepoNode().uri)
	}

	export const rm = (...nodes: WorktreeFile[]) => {
		const paths: string[] = []
		for (const node of nodes) {
			paths.push(node.uri.fsPath)
		}
		return gitExec('rm ' + paths.join(' '), nodes[0].getRepoNode().uri)
	}


	class Worktree {
		public list (args: string) {
			return gitExec('worktree list ' + args)
		}

		public add (args: string) {
			return gitExec('worktree add ' + args)
		}

		public remove(args: string) {
			return gitExec('worktree remove ' + args)
		}

		public lock(path: string) {
			return gitExec('worktree lock ' + path)
		}

		public unlock(path: string) {
			return gitExec('worktree unlock ' + path)
		}
	}

	export const worktree = new Worktree()
}
