import * as vscode from 'vscode'
import * as assert from 'assert'
import { MultiBranchCheckoutAPI } from '../src/commands'
import { log } from '../src/channelLogger'
import { toUri, deleteFile } from '../src/utils'
import util from 'util'
import child_process from 'child_process'
import { WorktreeFile } from '../src/worktreeNodes'
const exec = util.promisify(child_process.exec)

async function gitInit (workspaceUri?: vscode.Uri) {
    if (!workspaceUri) {
        workspaceUri = vscode.workspace.workspaceFolders![0].uri
    }
    log.info('git init -b main (cwd=' + workspaceUri.fsPath + ')')
    const r1 = await exec('git init -b main', { cwd: workspaceUri.fsPath })
    const r2 = await exec('git add .gitkeep', { cwd: workspaceUri.fsPath })
    const r3 = await exec('git commit -m "intial commit" --no-gpg-sign', { cwd: workspaceUri.fsPath})
    log.trace('git commit response: ' + r1.stdout)  // coverage
    return true
}

function gitBranch (workspaceUri?: vscode.Uri) {
    if (!workspaceUri) {
        workspaceUri = vscode.workspace.workspaceFolders![0].uri
    }
    log.info('git branch --show-current (cwd=' + workspaceUri.fsPath + ')')
    return exec('git branch --show-current', { cwd: workspaceUri.fsPath })
        .then((r: any) => {
            log.info('current branch: ' + r.stdout)
            return true
        })
}

function sleep (timeout: number) {
    log.info('sleeping for ' + timeout + 'ms')
    const prom = new Promise((resolve) => setTimeout(resolve, timeout))
    return prom
}

function fileExists (path: string) {
    return vscode.workspace.fs.stat(toUri(path))
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

    suiteSetup('proj1 setup', async () => {
        deleteFile('.git')
        deleteFile('.gitignore')
        deleteFile('.worktrees')
        deleteFile('.vscode')
        deleteFile('test_file.txt')
        deleteFile('test_4.txt')
        const r = await gitInit().then(() => {
            log.info('git repo re-initialized')
        })
        const b = await gitBranch()
        return true
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
        api = await ext.activate()
        const tree = api.getWorktreeView().getRootNodes()
        assert.equal(tree.length, 1)
    })

    test('proj1.2 - create first worktree', async () => {
        const r = await api.createWorktree('test2')
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
            .then(() => log.info('file created uri=' + uri.fsPath))
        await api.createWorktree('secondTree')
        await sleep(100)

        const nodes = api.getNodes(uri)
        for (const node of nodes) {
            if (node instanceof WorktreeFile) {
                log.info('node: ' + node.id + ' ' + node.disposed)
                log.info('parent: ' + node.getParent()?.id)
            }
        }

        await api.moveToWorktree(api.getFileNode(uri), 'secondTree')
        assert.ok(toUri('.worktrees/test2/test_file.txt'))
    })

    test('proj1.5 - stage two files', async () => {
        const uri1 = toUri('.worktrees/test2/test_staging_1.txt')
        const uri2 = toUri('.worktrees/test2/test_staging_2.txt')
        await vscode.workspace.fs.writeFile(uri1, Buffer.from('test staging 1 content'))
        await vscode.workspace.fs.writeFile(uri2, Buffer.from('test staging 2 content'))
        await sleep(100)
        await sleep(100)
        await sleep(100)

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

})
