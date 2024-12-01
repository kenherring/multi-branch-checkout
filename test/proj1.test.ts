import * as vscode from 'vscode'
import * as assert from 'assert'
import { MultiBranchCheckoutAPI } from '../src/commands'
import { log } from '../src/channelLogger'
import { toUri, deleteFile } from '../src/utils'
import { FileGroup, WorktreeFile } from '../src/worktreeNodes'
import { git } from '../src/gitFunctions'

function sleep (timeout: number) {
	log.info('sleeping for ' + timeout + 'ms')
	const prom = new Promise((resolve) => setTimeout(resolve, timeout))
	return prom
}

function fileExists (path: string | vscode.Uri) {
	let uri: vscode.Uri
	if (path instanceof vscode.Uri) {
		uri = path
	} else {
		uri = toUri(path)
	}
	return vscode.workspace.fs.stat(uri)
		.then((r) => {
			if (r.type === vscode.FileType.File) {
				return true
			}
			log.error('fs.stat returned non-file type: ' + r.type)
			return false
		}, (e) => {
			log.info('fileExists error! e=' + e)
			return false
		})
}


let api: MultiBranchCheckoutAPI

suite('proj1', () => {

	suiteSetup('proj1 setup', () => {
		deleteFile('.git')
		deleteFile('.gitignore')
		deleteFile('.worktrees')
		deleteFile('.vscode')
		deleteFile('test_file.txt')
		deleteFile('test_4.txt')
		const r = git.init()
			.then(() => {
				log.info('git repo re-initialized (r=' + r + ')')
				return git.branch()
			})
			.then((b) => {
				log.info('current branch: ' + b)
				return Promise.resolve(true)
			})
		log.info('return r=' + r)
	})

	suiteTeardown('proj1 teardown', () => {
		log.info('suiteTeardown')
	})

	test('proj1.1 - no worktrees yet', async () => {
		await vscode.workspace.fs.writeFile(toUri('.gitignore'), Buffer.from('.vscode/settings.json'))
		const ext = vscode.extensions.getExtension('kherring.multi-branch-checkout')
		if (!ext) {
			assert.fail('Extension not found')
		}

		log.info('activating extension ext=' + ext)
		api = await ext.activate().then(() => {
			log.info('activated extension')
			return ext.exports as MultiBranchCheckoutAPI
		}, (e) => {
			assert.fail('Extension activation failed: ' + e)
		})
		log.info('getting root nodes')
		const tree = api.getWorktreeView().getRootNodes()
		log.info('tree.length=' + tree.length)
		assert.equal(tree.length, 1)
	})

	test('proj1.2 - create first worktree', async () => {
		await api.createWorktree(vscode.workspace.workspaceFolders![0], 'test2')
		const tree = api.getWorktreeView().getRootNodes()
		for (const c of tree) {
			log.info('child: ' + c.label + ' ' + c.disposed)
		}
		assert.equal(tree.length, 2)
		return true
	})

	test('proj1.3 - create file, copy to test tree', async () => {
		const ext = vscode.extensions.getExtension('kherring.multi-branch-checkout')
		if (!ext) {
			assert.fail('Extension not found')
			return
		}
		const api = ext.exports as MultiBranchCheckoutAPI
		if (!api) {
			assert.fail('Extension not found')
			return
		}
		const uri = toUri('test_file.txt')
		await vscode.workspace.fs.writeFile(uri, Buffer.from('test file content'))
		await api.refresh()

		await sleep(100) // wait for onDidCreate event to fire
		await sleep(100) // wait for onDidCreate event to fire
		await sleep(100) // wait for onDidCreate event to fire
		await sleep(100) // wait for onDidCreate event to fire

		log.info('file created uri=' + uri.fsPath)
		const n = api.getFileNode(uri)
		log.info('copying file to worktree n.id=' + n.id)
		await api.copyToWorktree(n)

		assert.ok(await fileExists('.worktrees/test2/test_file.txt'))
	})

	test('proj1.4 - create file, move to test tree', async () => {
		const uri = toUri('test_4.txt')
		await vscode.workspace.fs.writeFile(uri, Buffer.from('test file content'))
			.then(() => { log.info('file created uri=' + uri.fsPath) })
		await api.createWorktree(vscode.workspace.workspaceFolders![0], 'secondTree')
		await sleep(100)

		const nodes = api.getNodes(uri)
		for (const node of nodes) {
			if (node instanceof WorktreeFile) {
				log.info('node: ' + node.id + ' ' + node.disposed)
				log.info('parent: ' + node.getParent()?.id)
			}
		}

		log.info('moving to worktree')
		const z = await api.moveToWorktree(api.getFileNode(uri), 'secondTree')
		log.info('moved to worktree (z=' + z + ')')
		// const p = api.getWorktreeView().waitForDidChangeTreeData()
		// log.info('waiting for refresh (r=' + p + ')')
		// const r = await p
		log.info('prom complete')

		assert.ok(await fileExists('.worktrees/secondTree/test_4.txt'), 'to file')
		assert.ok(!(await fileExists('test_4.txt')), 'from file')
	})

	test('proj1.5 - create file in tree and discard changes', async () => {
		const uri = toUri('.worktrees/secondTree/test_5.txt')
		log.info('create file')
		await vscode.workspace.fs.writeFile(uri, Buffer.from('test file content'))
			.then(() => log.info('file created uri=' + uri.fsPath))
		log.info('api.refresh')
		await api.refresh()
		await sleep(100)
		await sleep(100)
		await sleep(100)
		await sleep(100)

		const nodes = api.getNodes(uri)
		log.info('nodes.length=' + nodes.length)
		if (nodes.length === 0) {
			assert.fail('No nodes found for ' + uri.fsPath)
		}

		assert.ok(await fileExists(uri), 'after create')

		log.info('discarding changes')
		await api.discardChanges(api.getFileNode(uri), 'secondTree')
		log.info('discarded changes')


		const exist = await fileExists(uri)
		log.info('file exists? ' + exist)
		assert.ok(!(await fileExists(uri)), 'after discard')
	})

	test('proj1.6 - stage two files', async () => {
		const uri1 = toUri('.worktrees/test2/test_staging_1.txt')
		const uri2 = toUri('.worktrees/test2/test_staging_2.txt')
		await vscode.workspace.fs.writeFile(uri1, Buffer.from('test staging 1 content'))
		await vscode.workspace.fs.writeFile(uri2, Buffer.from('test staging 2 content'))
		await api.refresh()

		// validate before staging
		const node1 = api.getFileNode(uri1)
		const node2 = api.getFileNode(uri2)
		const fg_untracked = node1.getParent()
		log.info('fg_untracked: ' + fg_untracked.label)
		for (const c of fg_untracked.children) {
			log.info('child: ' + c.label)
		}
		assert.strictEqual(fg_untracked.children.length, 3, "untracked before")

		// stage 2 files and validate
		await api.stage(node1)
		await api.stage(node2)
		const stage1 = api.getFileNode(uri1)
		const fg_staged = stage1.getParent()
		log.info('fg_staged: ' + fg_staged.label)
		for (const c of fg_staged.children) {
			log.info('  child: ' + c.label)
		}
		assert.strictEqual(fg_staged.children.length, 2, "staged")
		log.info('fg_untracked: ' + fg_untracked.label)
		for (const c of fg_untracked.children) {
			log.info('  child: ' + c.label + ' ' + c.disposed)
		}
		assert.strictEqual(fg_untracked.children.length, 1, "untracked")

		await api.unstage(stage1)
		const post_unstage_1 = api.getFileNode(uri1)
		const post_unstage_2 = api.getFileNode(uri2)

		assert.strictEqual(post_unstage_1.group, 'Untracked')
		assert.strictEqual(post_unstage_2.group, 'Staged')
		log.info('Untracked node.id=' + post_unstage_1.getParent())
		for (const c of post_unstage_1.getParent().children) {
			log.info('  child: ' + c.label)
		}
		assert.strictEqual(post_unstage_1.getParent().children.length, 2, "post untracked")
		log.info('Staged node.id=' + post_unstage_2.getParent())
		for (const c of post_unstage_2.getParent().children) {
			log.info('  child: ' + c.label)
		}
		assert.strictEqual(post_unstage_2.getParent().children.length, 1, "post staged")
	})

	test('proj1.7 - open file', async () => {
		log.info('start test: proj1.9')

		deleteFile(api.getTempDir()) // improve coverage by having this be recreated during test

		let nodes = api.getWorktreeView().getAllNodes()
		nodes = nodes.filter((n) => { return n.type == 'WorktreeFile' })
		log.info('nodes.length=' + nodes.length)

		// any file
		const node = nodes[0] as WorktreeFile
		log.info('node=' + node)
		await api.openFile(node)
		log.info('opened file')

		// staged non-root file
		const staged = nodes.filter((n) => {
			if (n.type === 'WorktreeFile') {
				n = n as WorktreeFile
				return n.group == FileGroup.Staged && n.getParent().label !== 'test2'
			}
			return false
		})[0] as WorktreeFile
		await api.openFile(staged)
		log.info('open staged file')
	})

	test('proj1.8 - select file in WorktreeView', async () => {
		const nodes = api.getWorktreeView().getAllFileNodes()
		log.info('nodes.length=' + nodes.length)
		const fileNode = nodes.filter(((n) => {
			log.info('n.id=' + n.id + '; n.group=' + n.group)
			return n.getRepoNode().contextValue == 'WorktreePrimary' && n.relativePath == '.gitignore'
		}))[0] as WorktreeFile
		log.info('fileNode=' + fileNode)

		await api.selectWorktreeFile(fileNode)

		log.info('fileNode=' + fileNode)
		const active = vscode.window.activeTextEditor
		log.info('active=' + JSON.stringify(active, null, 2))
		assert.equal(fileNode.uri.fsPath, active?.document.uri.fsPath, '.gitignore file active')
		// assert.equal(active?.visibleRanges.length, 2, '.gitignore file opened as diff')
		// log.info('active=' + active?.document.uri.fsPath)

		// await sleep(5000)
		// log.info('sleep complete')
		// assert.fail('test not fully implemented')
	})

	test('proj1.98 - delete worktree', async () => {
		const root = api.getWorktreeView().getRootNode('secondTree')
		log.info('root=' + root)
		if (!root) {
			assert.fail('Root node not found')
		}

		assert.equal(api.getWorktreeView().getRootNodes().length, 3)
		const r = await api.deleteWorktree(root, 'Yes')
		log.info('r=' + r)
		assert.equal(api.getWorktreeView().getRootNodes().length, 2)
	})

	test('proj1.99 - lock and delete worktree', async () => {
		const root = api.getWorktreeView().getRootNode('test2')
		log.info('root=' + root)
		if (!root) {
			assert.fail('Root node not found')
		}
		assert.equal(api.getWorktreeView().getRootNodes().length, 2)
		await api.lockWorktree(root)

		// attempt to delete locked worktree
		assert.ok(root.locked == '🔒', 'confirm worktree locked after lock command')
		assert.equal(root.locked, '🔒', 'confirm worktree unlocked after unlock command')
		await api.deleteWorktree(root, 'Yes').then(() => {
			assert.fail('Delete should have failed')
		}, (e) => {
			log.info('Delete failed as expected: ' + e)
		})
		assert.equal(api.getWorktreeView().getRootNodes().length, 2)

		// unlock and attempt to delete again, get message about deleting with modified files
		await api.unlockWorktree(root)
		assert.equal(root.locked, '🔓', 'confirm worktree unlocked after unlock command')
		await api.deleteWorktree(root, 'No')
		assert.equal(api.getWorktreeView().getRootNodes().length, 2)

		// actually delete the worktree
		await api.deleteWorktree(root, 'Yes')
		assert.equal(api.getWorktreeView().getRootNodes().length, 1)
	})


})
