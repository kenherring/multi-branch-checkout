import { Uri, workspace } from 'vscode'
import { WorktreeFile } from './worktreeView'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const git = require('@npmcli/git')


// https://github.com/microsoft/vscode/blob/b87039d5e2380e888ec471f427df68c12e0463ec/extensions/git/src/uri.ts#L23

export interface GitUriParams {
	path: string;
	ref: string;
	submoduleOf?: string;
}

export interface GitUriOptions {
	scheme?: string;
	replaceFileExtension?: boolean;
	submoduleOf?: string;
}

export function toGitUri(uri: Uri, ref: string, options: GitUriOptions = {}): Uri {
	const params: GitUriParams = {
		path: uri.fsPath,
		ref
	}

	if (options.submoduleOf) {
		params.submoduleOf = options.submoduleOf
	}

	let path = uri.path

	if (options.replaceFileExtension) {
		path = `${path}.git`
	} else if (options.submoduleOf) {
		path = `${path}.diff`
	}

	return uri.with({ scheme: options.scheme ?? 'git', path, query: JSON.stringify(params) })
}

export async function getMergeBaseGitUri(node: WorktreeFile) {
	// TODO default branch
	console.log('getMergeBaseGitUri node.id=' + node.id + '; repoUri=' + node.getRepoUri().fsPath)
	const uri: Uri = await git.spawn(['merge-base', '--fork-point', 'HEAD'], { cwd: node.getRepoUri().fsPath })
		.then((r: any) => {
			console.log('mergeBase="' + r.stdout + '"')
			const mergeBaseCommit = r.stdout.trim()
			console.log('mergeBaseCommit=' + mergeBaseCommit)
			// gitUri's only work from the workspace root and not the work tree
			// but since we're compare to a commit ref we can use the workspace root
			const workspaceUri = workspace.workspaceFolders?.[0].uri ?? node.getRepoUri()
			return toGitUri(Uri.joinPath(workspaceUri, node.relativePath), mergeBaseCommit)
		}, (e: any) => {
			if (e.stderr) {
				console.error('Failed to get merge base: ' + e.stderr)
				throw new Error('Failed to get merge base: ' + e.stderr)
			}
			console.error('Failed to get merge base: ' + e)
			throw e
		})
	return uri
}
