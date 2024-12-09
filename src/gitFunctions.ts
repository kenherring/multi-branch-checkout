import * as vscode from 'vscode'
import { FileGroup, WorktreeFile, WorktreeFileGroup, WorktreeNode, WorktreeRoot } from './worktreeNodes'
import { GitExtension, Status } from './@types/git.d'
import { log } from './channelLogger'
import util from 'util'
import child_process from 'child_process'
import path from 'path'
import { GitError } from './errors'
const exec = util.promisify(child_process.exec)

export interface GitUriOptions {
	scheme?: string;
	replaceFileExtension?: boolean;
	submoduleOf?: string;
}

interface GitResponse {
	stdout: string
	stderr: string
}

interface GitErrorResponse {
	code: number
	killed: boolean
	signal: string | null
	cmd: string
	stdout: string
	stderr: string
}

interface WorktreeStatus {
	name: string
	path: string
	uri: vscode.Uri
	refName: string
	refSha: string
	branch: string
	locked: boolean
}

const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')?.exports
if (!gitExtension) {
	throw new Error('Git extension not found')
}
const gitAPI = gitExtension.getAPI(1)

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
		message = message.replace('{0}', nodes[0].relativePath)
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
		message = message.replace('{0}', nodes.length.toString())
	}
	log.info('message="' + message + '"')
	return vscode.window.showWarningMessage(message, { modal: true }, yes)
}

export namespace git {

	const gitExec = (args: string, repoRoot?: vscode.Uri | string) => {
		if (!repoRoot) {
			repoRoot = vscode.workspace.workspaceFolders![0].uri
		}
		if (repoRoot instanceof vscode.Uri) {
			repoRoot = repoRoot.fsPath
		}

		const command = 'git ' + args
		log.info('executing: ' + command + ' (in ' + repoRoot + ')')
		return exec(command, { cwd: repoRoot })
			.then((r: GitResponse) => {
				r.stdout = r.stdout.trim()
				log.info('success! (' + command + ') (stdout=' + r.stdout + ')')
				if (r.stderr != '') {
					log.error('      stderr=' + r.stderr)
					void log.notificationWarn(r.stderr + '\n(command: ' + command + ')')
				}
				return r.stdout
			}, (e: GitErrorResponse) => {
				log.error('GitErrorResponse=' + JSON.stringify(e, null, 2))
				if (e.stderr && e.stderr != '') {
					void log.notificationError(e.stderr)
					throw new GitError(e.stderr, e.code)
				}
				// log.error('e=' + JSON.stringify(e, null, 2))
				// void log.notificationError(e)
				throw e
			})
	}

	export const init = (workspaceUri?: vscode.Uri) => {
		if (!workspaceUri) {
			workspaceUri = vscode.workspace.workspaceFolders![0].uri
		}
		return gitExec('init -b main', workspaceUri.fsPath)
	}

	export const defaultBranch = () => {
		return gitExec('config init.defaultBranch').then((r) => {
			log.info('init.defaultBranch: ' + r)
			return r
		})
	}

	export const branch = (workspaceUri?: vscode.Uri) => {
		if (!workspaceUri) {
			workspaceUri = vscode.workspace.workspaceFolders![0].uri
		}
		log.info('git branch --show-current (cwd=' + workspaceUri.fsPath + ')')
		return gitExec('branch --show-current', workspaceUri.fsPath)
			.then((r: any) => {
				return r.stdout
			})
	}

	export const toGitUri = (rootNode: WorktreeRoot, uri: vscode.Uri, ref: string = '') => {
		// ref == '~': staged
		// ref == '': working tree
		// const relativePath = path.relative(rootNode.uri.fsPath, uri.fsPath)

		uri = uri.with({ fragment: undefined })
		return gitAPI.toGitUri(uri, ref)
	}

	export const version = () => {
		return gitExec('version').then((r) => {
			log.info('git version: ' + r)
			return r
		})
	}

	export const revParse = async (uri: vscode.Uri, topLevel = false) => {
		let dirpath: string
		const stat = await vscode.workspace.fs.stat(uri).then((s) => { return s }, (e) => { return undefined })
		if (!stat || stat.type != vscode.FileType.Directory) {
			dirpath = path.dirname(uri.fsPath)
		} else {
			dirpath = uri.fsPath
		}

		let args = 'rev-parse'
		if (topLevel) {
			args += ' --show-toplevel'
		} else {
			args += ' HEAD'
		}
		const resp = await gitExec(args, dirpath)
		if (topLevel) {
			log.info('revParse: "' + resp + '"')
			return resp.split('\n')[0]
		}
		if (resp && resp != '') {
			return resp.trim()
		}
		return resp
	}

	export const revList = async (revA: string, revB: string) => {
		return gitExec('rev-list --left-right --count ' + revA + '..' + revB).then((r: any) => {
			log.info('revList success: ' + JSON.stringify(r, null, 2))
			const counts = r.stdout.trim().split('\t')
			return { ahead: counts[0], behind: counts[1] }
		}, (e) => {
			log.error('revList failed: ' + e)
			return { ahead: 0, behind: 0 }
		})
	}

	// TODO - reset cache when .gitignore changes
	export const ignoreCache: string[] = []

	export const checkIgnore = async (path: string) => {
		const ignore = await gitExec('check-ignore ' + path)
			.then((r) => {
				// log.info('checkIgnore: ' + path + ' -> true (r=' + r + ')')
				ignoreCache.push(path)
				return true
			}, (e: any) => {
				log.info('checkIgnore failed path=' + path)
				log.info(' -- stdout=' + e.stdout)
				log.info(' -- stderr=' + e.stderr)
				return false
			})
		log.info('ignore=' + ignore + ' (path=' + path + ')')
		return ignore
	}

	export const statusIgnored = async () => {
		const r = await gitExec('status --ignored --porcelain -z')
		const lines: string[] = r.split('\0')
		const ignoredFiles = []
		for (const l of lines) {
			if (l == '') {
				continue
			}
			const status = l.substring(0, 1)
			const path = l.substring(3)
			if (status == '!') {
				ignoredFiles.push(path)
			}
		}
		return ignoredFiles
	}

	export const show = async (repoRootUri: vscode.Uri, relativePath: string, tempDir: vscode.Uri) => {
		const showUri = vscode.Uri.joinPath(tempDir, relativePath.replace('/', '_'))
		// const outFile = path.join(tempDir.fsPath, relativePath.replace('/', '_'))
		const resp = await gitExec('show :0:' + relativePath, repoRootUri)
		await vscode.workspace.fs.writeFile(showUri, Buffer.from(resp))
		return showUri
	}

	function createWorktreeFileNode (repoNode: WorktreeRoot, path: string, group: FileGroup, status: string) {
		const groupNode = repoNode.getFileGroupNode(group)
		const uri = vscode.Uri.joinPath(repoNode.uri, path)
		const existing = groupNode.children.find((f) => f.uri?.fsPath == uri.fsPath)
		if (!existing) {
			return [new WorktreeFile(uri, groupNode, status)]
		}
		return []
	}

	export const status = async (node: WorktreeNode) => {
		const repoNode = node.getRepoNode()
		if (!repoNode.pathExists) {
			return []
		}
		let args = 'status --porcelain -z'
		if (node instanceof WorktreeFile) {
			args += ' ' + node.relativePath
		}
		const r = await gitExec(args, repoNode.uri)
			.then((r) => { return r }
			, (e: any) => {
				if (e.stderr == '' && e.stdout == '') {
					return ''
				}
				throw e
			})
		const newFiles: WorktreeFile[] = []
		const lines: string[] = r.split('\0')
		for (const l of lines) {
			if (l == '') {
				continue
			}
			const statusStaged = l.substring(0, 1)
			const statusChanged = l.substring(1, 2)
			const path = l.substring(3)

			const status: string | undefined = undefined
			const wg: WorktreeFileGroup | undefined = undefined
			if (statusStaged == '?' && statusChanged == '?') {
				newFiles.push(...createWorktreeFileNode(repoNode, path, FileGroup.Untracked, 'A'))
			} else {
				if (statusStaged.trim() != '') {
					newFiles.push(...createWorktreeFileNode(repoNode, path, FileGroup.Staged, statusStaged))
				}
				if (statusChanged.trim() != '') {
					newFiles.push(...createWorktreeFileNode(repoNode, path, FileGroup.Changes, statusChanged))
				}
			}
		}
		return newFiles
	}

	export const diff = async (repo: WorktreeRoot | vscode.Uri, ref1: string, ref2?: string) => {
		let repoUri: vscode.Uri
		if (repo instanceof WorktreeRoot) {
			repoUri = repo.uri
		} else {
			repoUri = repo
		}

		let args = 'diff ' + ref1
		if (ref2) {
			args += ' ' + ref2
		}
		return await gitExec(args, repoUri)
	}

	// dialogResponse should only be set during test runs
	export const clean = async (nodes: WorktreeFile[] | WorktreeFile, dialogResponse?: string) => {
		if (!Array.isArray(nodes)) {
			nodes = [nodes]
		}
		const paths: string[] = []
		for (const node of nodes) {
			paths.push(node.uri.fsPath)
		}
		// assume all nodes are in the same repo
		const repoRoot = nodes[0].getRepoNode()
		log.info('clean changes in ' + nodes.length + ' files')

		log.info('dialogResponse=' + dialogResponse)
		if (dialogResponse == undefined) {
			dialogResponse = await cleanMessage(nodes)
			log.info('dialogResponse=' + dialogResponse)
		}
		if (!dialogResponse) {
			log.info('clean cancelled')
			return false
		}

		await gitExec('clean -f ' + paths.join(' '), repoRoot.uri)
		log.info('cleaned changes in ' + paths)
		return true
	}

	export const add = (rootNode: WorktreeRoot | undefined, ...targets: (WorktreeFile | vscode.Uri | string)[]) => {
		const paths: string[] = []
		for (const target of targets) {
			if (target instanceof WorktreeFile) {
				paths.push(target.uri.fsPath)
			} else if (target instanceof vscode.Uri) {
				paths.push(target.fsPath)
			} else {
				paths.push(target)
			}
		}

		let cwd: vscode.Uri
		if (rootNode == undefined) {
			cwd = vscode.workspace.workspaceFolders![0].uri
		} else {
			cwd = rootNode.uri
		}

		return gitExec('add ' + paths.join(' '), cwd)
	}

	export const reset = (...nodes: WorktreeFile[]) => {
		const paths: string[] = []
		for (const node of nodes) {
			paths.push(node.uri.fsPath)
		}
		return gitExec('reset ' + paths.join(' '), nodes[0].getRepoNode().uri)
	}

	export const rm = (...nodes: WorktreeFile[]) => {
		const paths: string[] = []
		for (const node of nodes) {
			paths.push(node.uri.fsPath)
		}
		return gitExec('rm ' + paths.join(' '), nodes[0].getRepoNode().uri)
	}

	export const commit = (message: string, args?: string, repoRoot?: WorktreeRoot) => {
		return gitExec('commit -m "' + message + '" ' + args, repoRoot?.uri)
	}

	class Worktree {
		public list () {
			return gitExec('worktree list --porcelain -z').then((stdout) => {
				const trees: WorktreeStatus[] = []
				const lines = stdout.split('\0\0')
				for (const line of lines) {
					if (line == '') {
						continue
					}
					const tree = line.split('\0')
					if (tree.length < 3) {
						throw new Error('Invalid worktree: ' + line)
					}
					trees.push({
						name: tree[0].split(' ')[0],
						path: tree[0].split(' ')[1],
						uri: vscode.Uri.file(tree[0].split(' ')[1]),
						refName: tree[1].split(' ')[0],
						refSha: tree[1].split(' ')[1],
						branch: tree[2].split(' ')[1],
						locked: tree[3] === 'locked'
					})
				}

				log.info('worktree list: ' + trees.map((t) => t.name).join(', '))
				return trees
			})
		}

		public add (args: string) {
			return gitExec('worktree add ' + args)
		}

		public remove(args: string, force?: boolean) {
			let cmd = 'worktree remove '
			if (force) {
				cmd = cmd + '--force '
			}
			return gitExec(cmd + args)
		}

		public lock(path: string) {
			return gitExec('worktree lock ' + path)
		}

		public unlock(path: string) {
			return gitExec('worktree unlock ' + path)
		}

		public prune() {
			return gitExec('worktree prune')
		}
	}

	export const worktree = new Worktree()
}
