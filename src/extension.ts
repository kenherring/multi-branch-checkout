import * as vscode from 'vscode'
import { DepNodeProvider, Dependency } from './nodeDependencies'
import { JsonOutlineProvider } from './jsonOutline'
import { FtpExplorer } from './ftpExplorer'
import { FileExplorer } from './fileExplorer'
import { TestViewDragAndDrop } from './testViewDragAndDrop'
import { TestView } from './testView'
import { WorktreeFile, WorktreeFileGroup, WorktreeView } from './worktreeView'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const git = require('@npmcli/git')

export function activate(context: vscode.ExtensionContext) {
	const rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined

	// Samples of `window.registerTreeDataProvider`
	const nodeDependenciesProvider = new DepNodeProvider(rootPath)
	vscode.window.registerTreeDataProvider('nodeDependencies', nodeDependenciesProvider)
	vscode.commands.registerCommand('nodeDependencies.refreshEntry', () => nodeDependenciesProvider.refresh())
	vscode.commands.registerCommand('extension.openPackageOnNpm', moduleName => vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(`https://www.npmjs.com/package/${moduleName}`)))
	vscode.commands.registerCommand('nodeDependencies.addEntry', () => vscode.window.showInformationMessage(`Successfully called add entry.`))
	vscode.commands.registerCommand('nodeDependencies.editEntry', (node: Dependency) => vscode.window.showInformationMessage(`Successfully called edit entry on ${node.label}.`))
	vscode.commands.registerCommand('nodeDependencies.deleteEntry', (node: Dependency) => vscode.window.showInformationMessage(`Successfully called delete entry on ${node.label}.`))

	const jsonOutlineProvider = new JsonOutlineProvider(context)
	vscode.window.registerTreeDataProvider('jsonOutline', jsonOutlineProvider)
	vscode.commands.registerCommand('jsonOutline.refresh', () => jsonOutlineProvider.refresh())
	vscode.commands.registerCommand('jsonOutline.refreshNode', offset => jsonOutlineProvider.refresh(offset))
	vscode.commands.registerCommand('jsonOutline.renameNode', args => {
		let offset = undefined
		if (args.selectedTreeItems && args.selectedTreeItems.length) {
			offset = args.selectedTreeItems[0]
		} else if (typeof args === 'number') {
			offset = args
		}
		if (offset) {
			jsonOutlineProvider.rename(offset)
		}
	})
	vscode.commands.registerCommand('extension.openJsonSelection', range => jsonOutlineProvider.select(range))

	// Samples of `window.createView`
	new FtpExplorer(context)
	new FileExplorer(context)

	// Test View
	new TestView(context)

	new TestViewDragAndDrop(context)

	console.log('400')
	const worktreeView = new WorktreeView(context)
	console.log('401')

	// ********** WorktreeFile Commands ********** //
	vscode.commands.registerCommand('multi-branch-checkout.openFile', (node: WorktreeFile) => {
		return vscode.commands.executeCommand('vscode.open', node.uri)
	})
	vscode.commands.registerCommand('multi-branch-checkout.revertFile', (node: WorktreeFile) => {
		return vscode.window.showWarningMessage('not yet implemented')
	})
	vscode.commands.registerCommand('multi-branch-checkout.compareFileWithMergeBase', (node: WorktreeFile) => {
		return vscode.window.showWarningMessage('not yet implemented')
	})
	vscode.commands.registerCommand('multi-branch-checkout.copyToWorktree', (node: WorktreeFile) => {
		return command_copyToWorktree(node).then(() => { worktreeView.refresh() })
	})
	vscode.commands.registerCommand('multi-branch-checkout.moveToWorktree', (node: WorktreeFile) => {
		return vscode.window.showWarningMessage('not yet implemented')
	})
	vscode.commands.registerCommand('multi-branch-checkout.stageFile', (node: WorktreeFile) => {
		return command_stageFiles(node, 'stage').then(() => { worktreeView.refresh() })
	})
	vscode.commands.registerCommand('multi-branch-checkout.unstageFile', (node: WorktreeFile) => {
		return command_stageFiles(node, 'unstage').then(() => { worktreeView.refresh() })
	})
}

function command_copyToWorktree(node: WorktreeFile) {
	validateUri(node)
	if (!node.uri) {
		throw new Error('Failed to copy file to worktree (uri=' + node.uri + ')')
	}
	// first, create a patch file
	///// TODO - use extrension dir or mememory
	const patchFile = vscode.Uri.joinPath(node.getRepoUri(), node.label + '.patch')
	console.log('patchFile=' + patchFile.fsPath)
	return git.spawn(['diff', '--merge-base', '-p', node.uri.fsPath], { cwd: node.getRepoUri().fsPath })
		.then((r: any) => {
			console.log('r=' + JSON.stringify(r,null,2))
			return git.spawn(['apply', Buffer.from(r.stdout)], { cwd: node.getRepoUri().fsPath })
		})
		.then((r: any) => {
			console.log('r=' + JSON.stringify(r,null,2))
			console.log('successfully applied patch')
		})
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

function command_stageFiles (node: WorktreeFile | WorktreeFileGroup, action: 'stage' | 'unstage') {
	validateUri(node)
	if (!node.uri) {
		throw new Error('Failed to stage file - invalid filepath (uri=' + node.uri + ')')
	}
	const addList: string[] = []
	if (node instanceof WorktreeFile) {
		addList.push(node.uri.fsPath)
	} else {
		for (const child of node.children) {
			if (child instanceof WorktreeFile && child.uri) {
				addList.push(child.uri.fsPath)
			}
		}
	}

	let gitAction = 'add'
	if (action == 'unstage') {
		gitAction = 'reset'
	}
	return git.spawn([gitAction, ...addList], { cwd: node.getRepoUri().fsPath })
}

function validateUri(node: WorktreeFile | WorktreeFileGroup) {
	if (node.uri) {
		return true
	}
	throw new Error('Uri is undefined for node.id:' + node.id)
}
