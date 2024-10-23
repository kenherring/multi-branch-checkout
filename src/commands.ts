import * as vscode from 'vscode'
import { WorktreeFile, WorktreeFileGroup, WorktreeNode, WorktreeRoot } from "./worktreeView"
import { getMergeBaseGitUri, getRepo, git } from './gitFunctions'
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

export function command_discardChanges(node: WorktreeNode) {
	if (node instanceof WorktreeFile) {
		console.log('git.clean uri=' + node.uri?.fsPath)
		if (!node.uri) {
			throw new Error('discardChanges failed for uri=' + node.uri)
		}

		const gitUri = git.toGitUri(node.uri, '~')
		const repo = getRepo(node)

		console.log('command git.clean ----- start ----- (gitUri=' + gitUri + ')')
		return repo.clean([node.uri.fsPath]).then(() => {
			console.log('command git.clean -----  end  -----')
		}, (e: unknown) => {
			console.error('git.clean error (e=' + e + ')')
			throw e
		})
	}
	throw new NotImplementedError('Discard changes not yet implemented for root or group nodes')
}
